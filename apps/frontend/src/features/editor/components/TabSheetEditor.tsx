import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import './TabSheetEditor.css';

import type {
  BeatPosition, Clef, Duration, FrettedNote, InstrumentId, NoteTechniques, PitchedNote, StaffDisplay,
  TabNote, TabBeat, TabMeasure, TabSong, TabTrack, BeamGroup, MLayout,
} from './types';
import {
  getDurationVal,
  computeBeamGroups,
  createTrack,
  isFretted,
  isFrettedNote,
  midiToNoteName,
  midiToNoteOctave,
  noteOctaveToMidi,
  normalizeTrackLengths,
  MAX_BPM,
  MIN_BPM,
  resolveNoteMidi,
  retuneTrack,
  trackKind,
  tuningPresets,
  resizeTuning,
  GUITAR_NOTE_OPTIONS,
  spellPitch,
  barAccidentals,
  keySignatureSteps,
  staffStepToSoundingMidi,
  Y_of_step,
  createEmptyMeasure,
  createEmptySong,
  createId,
  getEffectiveBpm,
  getEffectiveTimeSignature,
  pruneNotesToStringCount,
  locateCursor,
  beatSpan,
  copyBeats,
  MAX_REPEAT,
  MIN_REPEAT,
  nextBeatPosition,
  orderRange,
  pasteClip,
  removeBeats,
  STAFF_DISPLAYS,
  addBassStaff,
  grandStaffOf,
  beatAt,
  beatOnset,
  getEffectiveClefs,
} from './songUtils';
import type { CursorIds, CursorIndices } from './songUtils';
import { getClip, setClip, subscribeClip } from '../clipboard';
import { midiSupported, useMidiInput } from '../midiInput';
import { INSTRUMENTS } from './audioEngine';
import { TrackStrip } from './TrackStrip';
import { parseSong } from './songSchema';
import { canEdit } from '../../library/libraryStore';
import type { LibraryEntry } from '../../library/libraryStore';
import { createSong } from '../../library/libraryApi';
import type { SongChannel } from '../songChannel';
import { deriveInitials } from '../../user/userStore';
import { loadSettings, updateSettings } from '../../settings/settingsStore';
import { usePlayback } from './usePlayback';
import {
  computeRowHeight,
  computeMeasureLayouts,
  checkMeasureBeats,
  computeFretboardNeckHeight,
  getFretboardStringY as getFretboardStringYFromLayout,
  getFretCellLeft,
  getFretCellWidth,
  getFretLeftPercentage,
  isWhiteKey,
  computeKeyboardRange,
  FRET_COUNT as fretCount,
  MAX_ROW_WIDTH,
  STEM_TOP_PAD,
  getTabStaffTop,
  TAB_STAFF_HEIGHT_PX,
  TAB_FRET_FONT_SIZE,
  REPEAT_PADDING,
  GRAND_BASS_TOP,
  alignBars,
  CLEF_CHANGE_ROOM,
} from './layout';

// Treble clef outline traced from the public-domain "Treble clef with empty staff.svg"
// (Wikimedia Commons, author WarX), retargeted to staff units: top line y=10, 10 per space.
const TREBLE_CLEF_PATH =
  'M 27.7 34.8 C 26.7 35 25.7 35.6 24.8 36.5 23.9 37.4 23.4 38.4 23.3 39.6 23.2 40.3 23.4 41.2 23.9 42.1 24.3 43.1 25 43.8 25.9 44.2 26.2 44.3 26.4 44.5 26.3 44.7 26.3 44.8 26.2 44.9 25.9 44.9 24.4 44.5 23.2 43.5 22.3 42.3 21.5 41 21.1 39.5 21.1 37.9 21.3 36.2 21.9 34.6 23 33.2 24.1 31.8 25.5 30.9 27.1 30.4 L 26.3 24.4 C 23.6 26.3 21.4 28.4 19.6 30.6 17.8 32.8 16.8 35.3 16.6 38 16.5 39.2 16.7 40.4 17.1 41.6 17.5 42.8 18.1 43.8 19 44.9 20.7 46.9 23.1 48 26.1 48.3 27.1 48.3 28.2 48.2 29.4 48 L 27.7 34.8 z M 28.9 34.7 L 30.6 47.7 C 33.3 46.8 34.7 44.7 35 41.2 34.9 40.1 34.6 39 34.1 38.1 33.6 37.1 33 36.3 32.1 35.7 31.2 35.1 30.1 34.8 28.9 34.7 z M 26.7 17.1 C 27.3 16.8 27.9 16.3 28.7 15.5 29.4 14.8 30.2 13.9 30.9 12.8 31.6 11.8 32.2 10.7 32.7 9.6 33.1 8.6 33.4 7.5 33.4 6.6 33.5 6.1 33.5 5.7 33.4 5.4 33.4 4.8 33.2 4.3 32.9 3.9 32.6 3.6 32.2 3.4 31.7 3.4 30.7 3.3 29.8 3.9 28.9 5 28.2 6.1 27.6 7.3 27.1 8.7 26.7 10.1 26.3 11.6 26.2 13 26.2 14.7 26.4 16 26.7 17.1 z M 25.6 18 C 25 15.3 24.8 12.5 24.9 9.7 25 7.9 25.3 6.2 25.8 4.7 26.2 3.1 26.8 1.8 27.5 0.7 28.2 -0.4 29 -1.3 29.8 -1.8 30.6 -2.3 31.1 -2.6 31.4 -2.5 31.6 -2.5 31.8 -2.4 32 -2.3 32.1 -2.1 32.3 -1.8 32.6 -1.5 34.4 1.5 35.1 4.9 34.9 8.9 34.7 10.8 34.4 12.6 33.7 14.4 33.1 16.2 32.3 17.9 31.2 19.4 30.1 21 28.9 22.3 27.5 23.5 L 28.4 30.1 C 29.1 30.1 29.6 30.1 29.9 30.1 31.2 30.2 32.3 30.5 33.3 31.1 34.4 31.7 35.2 32.5 35.9 33.5 36.5 34.4 37 35.5 37.4 36.7 37.7 37.9 37.8 39.1 37.7 40.4 37.6 42.3 36.9 44.1 35.8 45.7 34.6 47.2 33 48.3 30.9 48.9 30.9 49.7 31.1 50.9 31.3 52.5 31.6 54 31.7 55.3 31.8 56.2 31.9 57.1 32 58 31.9 58.8 31.8 60.1 31.4 61.3 30.7 62.3 30 63.2 29.1 64 27.9 64.5 26.8 65 25.6 65.2 24.3 65.1 22.4 64.9 20.9 64.3 19.6 63.2 18.3 62.1 17.6 60.6 17.7 58.9 17.8 58.1 18 57.4 18.4 56.7 18.8 56 19.3 55.5 19.9 55.1 20.5 54.7 21.2 54.5 22 54.5 22.6 54.5 23.2 54.8 23.8 55.2 24.3 55.6 24.8 56.1 25.1 56.7 25.4 57.4 25.5 58.1 25.4 58.8 25.4 59.8 25 60.6 24.3 61.2 23.6 61.9 22.7 62.2 21.7 62.1 L 21.3 62.1 C 21.9 63.1 22.9 63.7 24.4 63.8 25.1 63.8 25.9 63.7 26.7 63.5 27.5 63.2 28.2 62.9 28.8 62.4 29.4 61.9 29.8 61.3 30 60.7 30.3 60.1 30.5 59.1 30.6 57.9 30.6 57.1 30.6 56.3 30.5 55.5 30.4 54.7 30.3 53.7 30 52.3 29.8 51 29.6 50 29.5 49.3 28.5 49.5 27.5 49.6 26.4 49.5 24.6 49.4 22.9 48.9 21.3 48 19.7 47.2 18.4 46 17.2 44.6 16.1 43.2 15.3 41.6 14.7 39.9 14.1 38.1 13.9 36.4 14 34.5 14.2 32.8 14.6 31.2 15.3 29.7 16.1 28.2 16.9 26.8 18 25.5 19 24.2 20.1 23 21.2 22 22.3 20.9 23.8 19.6 25.6 18 z';

// Bass (F) clef in the same staff units: the head sits on the F line (y=20),
// the two dots straddle it.
const BASS_CLEF_PATH =
  'M 14.5 19 C 15 12.5 21 9.8 25.5 10.2 C 31 10.8 34 15 33.8 20.5 C 33.5 30 25 40.5 12.5 47.5 '
  + 'L 12.3 46.6 C 22 39.5 28.5 30 28.4 21 C 28.3 15.5 26.3 12.2 23.2 12.1 C 19.8 12 17.5 14.2 17.3 16.6 Z '
  + 'M 20.4 20 A 3.4 3.4 0 1 1 13.6 20 A 3.4 3.4 0 1 1 20.4 20 Z '
  + 'M 39.7 15 A 1.9 1.9 0 1 1 35.9 15 A 1.9 1.9 0 1 1 39.7 15 Z '
  + 'M 39.7 25 A 1.9 1.9 0 1 1 35.9 25 A 1.9 1.9 0 1 1 39.7 25 Z';

// The brace that ties a grand staff's two staves together, from the treble's
// top line to the bass's bottom line.
const GRAND_BRACE_PATH =
  'M -4 10 C -10 14 -6 58 -12 70 C -6 82 -10 126 -4 130 C -7 124 -2 84 -9 70 C -2 56 -7 16 -4 10 Z';

/** How a clef reads its staff and draws itself. */
interface ClefShape {
  path: string;
  fillRule: 'evenodd' | 'nonzero';
  /** Diatonic steps added to a treble position; the bass clef's G2 sits where the treble's E4 does. */
  shift: number;
  /** Where the key signature sits against a treble staff's: a bass clef writes it a line lower. */
  keyOffset: number;
  /** The line the clef names (G or F), which a smaller clef change stays centred on. */
  line: number;
}

const CLEFS: Record<Clef, ClefShape> = {
  treble: { path: TREBLE_CLEF_PATH, fillRule: 'evenodd', shift: 0, keyOffset: 0, line: 40 },
  bass: { path: BASS_CLEF_PATH, fillRule: 'nonzero', shift: 12, keyOffset: -2, line: 20 },
};

const CLEF_LABELS: Record<Clef, string> = { treble: 'Treble (G)', bass: 'Bass (F)' };

/** A key signature's first accidental, after the clef, and the room each one takes. */
const KEY_X = 46;
const KEY_SPACING = 9;

/** ♯ (1), ♭ (-1) or ♮ (0), centred on (cx, y) in staff units, where a space is 10 high. */
const accidentalGlyph = (alteration: number, cx: number, y: number): React.ReactNode => {
  if (alteration < 0) {
    return (
      <path
        d={`M ${cx - 2.5} ${y - 12} L ${cx - 2.5} ${y + 3} C ${cx + 5} ${y - 1} ${cx + 4} ${y - 6} ${cx - 2.5} ${y - 2}`}
        className="glyph-ink-stroke"
        strokeWidth="1.4"
        fill="none"
        pointerEvents="none"
      />
    );
  }
  const [left, right] = alteration > 0 ? [[-6, 6], [-8, 4]] : [[-9, 3.5], [-3.5, 9]];
  const half = alteration > 0 ? 4.5 : 2;
  return (
    <g className="glyph-ink-stroke" strokeWidth="1.3" pointerEvents="none">
      <line x1={cx - 1.5} y1={y + left[0]} x2={cx - 1.5} y2={y + left[1]} />
      <line x1={cx + 1.5} y1={y + right[0]} x2={cx + 1.5} y2={y + right[1]} />
      <line x1={cx - half} y1={y - 2.5} x2={cx + half} y2={y - 4} strokeWidth="1.8" />
      <line x1={cx - half} y1={y + 2.5} x2={cx + half} y2={y + 1} strokeWidth="1.8" />
    </g>
  );
};

/** Key signatures from seven flats to seven sharps, as the Key menu lists them: major / relative minor. */
const KEY_OPTIONS = [
  ['C♭', 'A♭'], ['G♭', 'E♭'], ['D♭', 'B♭'], ['A♭', 'F'], ['E♭', 'C'], ['B♭', 'G'], ['F', 'D'], ['C', 'A'],
  ['G', 'E'], ['D', 'B'], ['A', 'F♯'], ['E', 'C♯'], ['B', 'G♯'], ['F♯', 'D♯'], ['C♯', 'A♯'],
].map(([major, minor], i) => {
  const key = i - 7;
  const count = key === 0 ? '' : ` · ${Math.abs(key)}${key > 0 ? '♯' : '♭'}`;
  return { key, label: `${major} / ${minor}m${count}` };
});

/** Which hand of a grand staff: the treble staff's track is the right. */
type Hand = 'right' | 'left';

const HAND_LABELS: Record<Hand, string> = { right: 'Right hand', left: 'Left hand' };

/** One drawn staff: how far below the row's origin it sits, the track whose bars it carries, and its clef at every bar. */
interface Staff {
  top: number;
  track: number;
  clefs: Clef[];
}

const STAFF_LABELS: Record<StaffDisplay, string> = {
  both: 'Both', notation: 'Notes', tab: 'TAB',
};

// Keyboard span for pitched tracks, which have no tuning to derive one from.
const PITCHED_KEYBOARD_LOW = 36;  // C2
const PITCHED_KEYBOARD_HIGH = 84; // C6

const INSTRUMENT_OPTIONS = Object.entries(INSTRUMENTS).map(([id, voice]) => ({
  id: id as InstrumentId,
  label: voice.label,
}));

interface TabSheetEditorProps {
  /** The song's listing entry: its folder, and the caller's role before the socket says. */
  meta: LibraryEntry;
  channel: SongChannel;
}

export const TabSheetEditor: React.FC<TabSheetEditorProps> = ({ meta, channel }) => {
  // --- STATE ---

  // The settings playback and panel state start from, read once per session.
  const [settings] = useState(loadSettings);
  const navigate = useNavigate();
  const live = useSyncExternalStore(channel.subscribe, channel.getState);
  const role = live.role ?? meta.role;

  const [song, setSong] = useState<TabSong>(() => channel.snapshot() ?? createEmptySong());
  const [activeTrackIndex, setActiveTrackIndex] = useState<number>(0);
  const [activeMeasureIndex, setActiveMeasureIndex] = useState<number>(0);
  const [activeBeatIndex, setActiveBeatIndex] = useState<number>(0);
  const [activeStringIndex, setActiveStringIndex] = useState<number>(0);
  // Which bar's tempo mark is open for editing in the score, if any. The
  // transport field keeps its own draft, so the two never fight over one value.
  const [bpmEditIndex, setBpmEditIndex] = useState<number | null>(null);
  // While a tempo box is being typed in, the draft wins; null shows the song.
  const [bpmDraft, setBpmDraft] = useState<string | null>(null);
  // The far end of a Shift-selection, by id so a collaborator's edit cannot move it.
  const [anchor, setAnchor] = useState<{ measureId: string; beatId: string } | null>(null);
  const clip = useSyncExternalStore(subscribeClip, getClip);

  // Everything the score and the input panels read comes from the active
  // track, so the rest of the component works one track at a time. A grand
  // staff draws the active track's partner too, one hand per staff.
  const activeTrack = song.tracks[activeTrackIndex] ?? song.tracks[0];
  const measures = activeTrack.measures;
  const tuning = activeTrack.tuning ?? [];
  const stringCount = tuning.length;
  const isFrettedTrack = isFretted(activeTrack);
  const showTab = isFrettedTrack && activeTrack.display !== 'notation';
  const showNotation = activeTrack.display !== 'tab';
  const grand = grandStaffOf(song.tracks, activeTrackIndex);
  const grandStaff = grand !== null;
  /** A staff reads its track's clefs, opening in `opening` when the track sets none. */
  const staffOf = (track: number, top: number, opening: Clef): Staff =>
    ({ top, track, clefs: getEffectiveClefs(song.tracks[track], opening) });
  const staves: Staff[] = grand
    ? [staffOf(grand.treble, 0, 'treble'), staffOf(grand.bass, GRAND_BASS_TOP, 'bass')]
    : [staffOf(activeTrackIndex, 0, 'treble')];
  const activeStaff = staves.find(s => s.track === activeTrackIndex) ?? staves[0];
  // A grand staff is one part with two hands: two tracks underneath, so each hand
  // keeps its own rhythm, but one chip, one name, one sound everywhere but the score.
  const activeHand: Hand = grand?.bass === activeTrackIndex ? 'left' : 'right';
  const otherHandIndex = grand ? (activeHand === 'left' ? grand.treble : grand.bass) : null;
  /** The tracks a part is made of: the one, or both hands of a grand staff. */
  const handsOf = (index: number): number[] => {
    const pair = grandStaffOf(song.tracks, index);
    return pair ? [pair.treble, pair.bass] : [index];
  };
  const hands = handsOf(activeTrackIndex);
  /** The track the strip and the track settings show for the active part. */
  const part = song.tracks[hands[0]] ?? activeTrack;

  const noteMidi = (note: TabNote, staff: Staff = activeStaff): number =>
    resolveNoteMidi(note, song.tracks[staff.track]) ?? NaN;
  /** A staff's key signature: its own track's, so a grand staff's hands could even differ. */
  const keyOf = (staff: Staff): number => song.tracks[staff.track].keySignature ?? 0;
  /** A pitch as a staff writes it, spelled in that staff's key. */
  const spell = (midi: number, staff: Staff) => spellPitch(midi, song.tracks[staff.track].transpose, keyOf(staff));
  /** The clef a staff is in at a bar. */
  const clefAt = (staff: Staff, mIdx: number): ClefShape => CLEFS[staff.clefs[mIdx] ?? 'treble'];
  /** Where a pitch sits on a staff at a bar, in the treble's steps (2 = bottom line, 10 = top line). */
  const staffStep = (midi: number, staff: Staff, mIdx: number): number =>
    spell(midi, staff).diatonicStep + clefAt(staff, mIdx).shift;
  /** The bar a staff draws at an index: its own track's. */
  const barOf = (staff: Staff, mIdx: number): TabMeasure => song.tracks[staff.track].measures[mIdx];

  const [durationSelect, setDurationSelect] = useState<Duration>('4');
  const [dotSelect, setDotSelect] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(settings.masterVolume);
  const [viewMode, setViewMode] = useState<boolean>(settings.readOnly);
  const [showFretboard, setShowFretboard] = useState<boolean>(settings.showToolPanel);
  const [midiInput, setMidiInput] = useState<boolean>(settings.midiInput);
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);
  const [showNoteOptions, setShowNoteOptions] = useState<boolean>(false);
  const [openBottomMenu, setOpenBottomMenu] = useState<'song' | 'edit' | 'output' | 'view' | 'track' | null>(null);

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(settings.playbackSpeed);
  const [loopPlayback, setLoopPlayback] = useState<boolean>(settings.loopPlayback);

  // Import/Export Modal state
  const [modalOpen, setModalOpen] = useState<'import' | 'export' | null>(null);
  const [jsonText, setJsonText] = useState<string>('');
  const [modalStatus, setModalStatus] = useState<string>('');

  // Keyboard navigation & double-digit entry ref

  const lastKeyTimeRef = useRef<number>(0);
  const lastKeyStringRef = useRef<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  const playback = usePlayback(
    { song, volume, loop: loopPlayback, speed: playbackSpeed, activeTrackIndex, otherHandIndex },
    (position) => {
      setActiveMeasureIndex(position.measureIndex);
      setActiveBeatIndex(position.beatIndex);
    },
  );

  const [notice, setNotice] = useState<string | null>(null);
  const readOnly = viewMode || role === 'viewer';

  /** Every local edit goes through here, so a read-only session never changes the song. */
  const editSong = (update: React.SetStateAction<TabSong>): void => {
    if (!readOnly) setSong(update);
  };

  // --- LIVE SYNC ---

  // The song as last received, so publishing never echoes a remote change back. The
  // song opened with counts as received: opening a song is not an edit you can undo.
  const lastRemote = useRef<TabSong | null>(song);
  const activeMeasureId = measures[activeMeasureIndex]?.id ?? null;
  const activeBeatId = measures[activeMeasureIndex]?.beats[activeBeatIndex]?.id ?? null;
  const cursor: CursorIds & CursorIndices = {
    trackId: activeTrack.id,
    measureId: activeMeasureId,
    beatId: activeBeatId,
    trackIndex: activeTrackIndex,
    measureIndex: activeMeasureIndex,
    beatIndex: activeBeatIndex,
  };
  // Read by the remote-song listener, which outlives any one render.
  const cursorRef = useRef(cursor);
  useEffect(() => {
    cursorRef.current = cursor;
  });

  // A collaborator's change replaces the song, and the cursor follows its bar and
  // beat by id, so bars inserted above it do not shift what you are editing. An undo
  // or redo takes the cursor back to where that edit was made.
  useEffect(() => channel.onRemoteSong((fresh, stepAt) => {
    lastRemote.current = fresh;
    setSong(fresh);
    const at = locateCursor(fresh, stepAt ?? cursorRef.current, cursorRef.current);
    setActiveTrackIndex(at.trackIndex);
    setActiveMeasureIndex(at.measureIndex);
    setActiveBeatIndex(at.beatIndex);
  }), [channel]);

  useEffect(() => {
    if (song !== lastRemote.current) channel.publish(song);
  }, [channel, song]);

  useEffect(() => {
    if (activeMeasureId !== null && activeBeatId !== null) {
      channel.sendCursor({ trackId: activeTrack.id, measureId: activeMeasureId, beatId: activeBeatId });
    }
  }, [channel, activeTrack.id, activeMeasureId, activeBeatId]);

  // --- TRACK EDITORS ---

  const updateTrack = (trackIndex: number, patch: Partial<TabTrack>) => {
    editSong(prev => ({
      ...prev,
      tracks: prev.tracks.map((t, i) => (i === trackIndex ? { ...t, ...patch } : t)),
    }));
  };

  const updateActiveTrack = (patch: Partial<TabTrack>) => updateTrack(activeTrackIndex, patch);

  /** Retunes the active track; notes on strings it no longer has are dropped. */
  const setTuning = (next: number[]) => {
    updateActiveTrack({ tuning: next });
    setActiveStringIndex(prev => Math.min(prev, next.length - 1));
    setMeasures(prev => pruneNotesToStringCount(prev, next.length));
  };

  const presets = tuningPresets(activeTrack.instrument);
  const presetName = Object.keys(presets).find(name => presets[name].join() === tuning.join()) ?? '';

  /** Picks a part from the strip; picking the part you are on keeps your hand. */
  const selectTrack = (index: number) => {
    if (handsOf(index).includes(activeTrackIndex)) return;
    setActiveTrackIndex(index);
    setShowNoteOptions(false);
    // Bar counts are shared, but beat counts are not, so re-clamp the cursor.
    const target = song.tracks[index];
    if (!target) return;
    const beats = target.measures[activeMeasureIndex]?.beats.length ?? 0;
    if (activeBeatIndex >= beats) setActiveBeatIndex(Math.max(0, beats - 1));
    const slots = isFretted(target) ? (target.tuning?.length ?? 6) : 1;
    setActiveStringIndex(prev => Math.min(prev, slots - 1));
  };

  /** Moves input to the other hand, onto its beat sounding at the cursor's moment. */
  const switchHand = (hand: Hand) => {
    if (!grand || hand === activeHand) return;
    const target = hand === 'left' ? grand.bass : grand.treble;
    const bar = song.tracks[target].measures[activeMeasureIndex];
    const here = measures[activeMeasureIndex];
    const beat = bar && here ? beatAt(bar, beatOnset(here, activeBeatIndex)) : -1;
    setActiveTrackIndex(target);
    setActiveBeatIndex(beat === -1 ? Math.max(0, (bar?.beats.length ?? 1) - 1) : beat);
    setAnchor(null);
    setShowNoteOptions(false);
  };

  /** Changes every track of the part `index` belongs to: a grand staff mutes, solos and sounds as one. */
  const updatePart = (index: number, patch: (track: TabTrack) => Partial<TabTrack>) => {
    const members = handsOf(index);
    editSong(prev => ({
      ...prev,
      tracks: prev.tracks.map((t, i) => (members.includes(i) ? { ...t, ...patch(t) } : t)),
    }));
  };

  const addTrack = () => {
    if (readOnly) return;
    const track = createTrack('guitar', measures.length);
    editSong(prev => ({ ...prev, tracks: normalizeTrackLengths([...prev.tracks, track]) }));
    setActiveTrackIndex(song.tracks.length);
    setActiveBeatIndex(0);
    setActiveStringIndex(0);
    setOpenBottomMenu('track');
  };

  /** Copies the active part, both hands of a grand staff linked to each other, right after it. */
  const duplicateActiveTrack = () => {
    const after = hands[hands.length - 1] + 1;
    editSong(prev => {
      const copies = hands.map((i): TabTrack => {
        const source = prev.tracks[i];
        const copy: TabTrack = {
          ...source,
          id: createId(),
          name: `${source.name} copy`,
          soloed: false,
          measures: source.measures.map(m => ({
            ...m,
            id: createId(),
            beats: m.beats.map(b => ({ ...b, id: createId(), notes: b.notes.map(n => ({ ...n })) })),
          })),
        };
        delete copy.bassTrack;
        return copy;
      });
      if (copies.length === 2) copies[0].bassTrack = copies[1].id;
      const tracks = [...prev.tracks];
      tracks.splice(after, 0, ...copies);
      return { ...prev, tracks };
    });
    setActiveTrackIndex(after);
  };

  /** Deletes the active part, both hands of a grand staff together. */
  const deleteActiveTrack = () => {
    if (song.tracks.length <= hands.length) return; // A song always has one part
    editSong(prev => ({ ...prev, tracks: prev.tracks.filter((_, i) => !hands.includes(i)) }));
    setActiveTrackIndex(Math.max(0, hands[0] - 1));
    setActiveBeatIndex(0);
    setActiveStringIndex(0);
    setOpenBottomMenu(null);
  };

  /** On splits the active pitched track into two hands; off keeps both tracks, just no longer braced. */
  const setGrandStaff = (on: boolean) => {
    if (on) {
      editSong(prev => addBassStaff(prev, activeTrackIndex));
      return;
    }
    if (!grand) return;
    editSong(prev => ({
      ...prev,
      tracks: prev.tracks.map((t, i) => {
        if (i !== grand.treble) return t;
        const next = { ...t };
        delete next.bassTrack;
        return next;
      }),
    }));
  };

  /** Rewrites only one track's bars: the active one unless a click on the other hand's staff names it. */
  const setMeasures = (updater: (measures: TabMeasure[]) => TabMeasure[], trackIndex: number = activeTrackIndex) => {
    editSong(prev => ({
      ...prev,
      tracks: prev.tracks.map((t, i) => (i === trackIndex ? { ...t, measures: updater(t.measures) } : t)),
    }));
  };

  /**
   * Bar-count changes must hit every track or the score falls out of
   * alignment, so they all go through here.
   */
  const setAllTrackMeasures = (updater: (measures: TabMeasure[], track: TabTrack) => TabMeasure[]) => {
    editSong(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => ({ ...t, measures: updater(t.measures, t) })),
    }));
  };

  const startPlaybackFromCursor = () =>
    playback.start({ measureIndex: activeMeasureIndex, beatIndex: activeBeatIndex });

  // Playback and panel choices made here are the same values the settings page
  // shows, so they are written back as they change.
  useEffect(() => {
    updateSettings({
      masterVolume: volume,
      playbackSpeed,
      loopPlayback,
      showToolPanel: showFretboard,
      readOnly: viewMode,
      midiInput,
    });
  }, [volume, playbackSpeed, loopPlayback, showFretboard, viewMode, midiInput]);

  // --- STATE EDITORS ---

  const getActiveBeat = (): TabBeat | undefined => {
    return measures[activeMeasureIndex]?.beats[activeBeatIndex];
  };

  /** Tempo and metre are song-wide, so the overrides live on track 0. */
  const setConductorMeasure = (index: number, patch: (measure: TabMeasure) => TabMeasure) => {
    editSong(prev => ({
      ...prev,
      tracks: prev.tracks.map((t, i) => (i === 0
        ? { ...t, measures: t.measures.map((m, idx) => (idx === index ? patch(m) : m)) }
        : t)),
    }));
  };

  /**
   * Bar 1 sets the song tempo; every later bar stores an override. The score
   * tempo marks edit an arbitrary bar, so the index is a parameter rather than
   * the cursor - clicking bar 9 must never retune whichever bar is selected.
   */
  const setMeasureBpm = (index: number, bpm: number) => {
    const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
    if (index === 0) {
      editSong(prev => ({ ...prev, bpm: clamped }));
      setConductorMeasure(0, measure => {
        const normalized = { ...measure };
        delete normalized.bpm;
        return normalized;
      });
      return;
    }
    setConductorMeasure(index, measure => ({ ...measure, bpm: clamped }));
  };

  /**
   * Tempo boxes hold a text draft while you type, so a half-typed "3" on the
   * way to "300" is never clamped up to the minimum. Blank or junk reverts.
   */
  const commitBpmDraft = (index: number) => {
    // Number() over parseInt(): "90bpm" reverts instead of committing as 90.
    const parsed = Number((bpmDraft ?? '').trim() || NaN);
    if (Number.isFinite(parsed)) setMeasureBpm(index, parsed);
    setBpmDraft(null);
  };

  const setActiveMeasureTimeSignature = (field: 'numerator' | 'denominator', value: number) => {
    const effective = getEffectiveTimeSignature(song, activeMeasureIndex);
    const nextTimeSignature = { ...effective, [field]: value };
    if (activeMeasureIndex === 0) {
      editSong(prev => ({ ...prev, timeSignature: nextTimeSignature }));
      setConductorMeasure(activeMeasureIndex, measure => {
        const normalized = { ...measure };
        delete normalized.timeSignature;
        return normalized;
      });
      return;
    }
    setConductorMeasure(activeMeasureIndex, measure => ({ ...measure, timeSignature: nextTimeSignature }));
  };

  const toggleRepeatStart = () => setConductorMeasure(activeMeasureIndex, measure => {
    const next = { ...measure };
    if (next.repeatStart) delete next.repeatStart;
    else next.repeatStart = true;
    return next;
  });

  /** How many times the section ending at the cursor's bar plays; null removes the :‖. */
  const setRepeatEnd = (times: number | null) => setConductorMeasure(activeMeasureIndex, measure => {
    const next = { ...measure };
    delete next.repeatEnd;
    if (times !== null) next.repeatEnd = Math.max(MIN_REPEAT, Math.min(MAX_REPEAT, times));
    return next;
  });

  /**
   * A staff's clef from the cursor's bar on. Bar 1 sets the track's own clef; a later bar
   * stores a change, and picking the clef the bar before is already in removes it.
   */
  const setClef = (staff: Staff, clef: Clef) => {
    const index = activeMeasureIndex;
    if (index === 0) updateTrack(staff.track, { clef });
    setMeasures(prev => prev.map((measure, i) => {
      if (i !== index) return measure;
      const next = { ...measure };
      if (index === 0 || staff.clefs[index - 1] === clef) delete next.clef;
      else next.clef = clef;
      return next;
    }), staff.track);
  };

  /** Rewrites one beat's notes: the cursor's, unless a click names another beat, and on a grand staff maybe the other hand's track. */
  const updateActiveBeatNotes = (
    updateFn: (notes: TabNote[]) => TabNote[],
    at: BeatPosition = { measureIndex: activeMeasureIndex, beatIndex: activeBeatIndex },
    trackIndex?: number,
  ) => {
    setMeasures(prev => prev.map((m, mIdx) => {
      if (mIdx !== at.measureIndex) return m;
      return {
        ...m,
        beats: m.beats.map((b, bIdx) => {
          if (bIdx !== at.beatIndex) return b;
          const newNotes = updateFn(b.notes);
          return { ...b, notes: newNotes, isRest: newNotes.length === 0 };
        })
      };
    }), trackIndex);
  };

  const setFretForActiveNote = (stringIndex: number, fret: number, at?: BeatPosition) => {
    // A pitched staff has no strings; a fret written to one has no pitch at all.
    if (!isFrettedTrack) return;
    updateActiveBeatNotes(currentNotes => {
      const onString = (n: TabNote) => isFrettedNote(n) && n.stringIndex === stringIndex;
      const existing = currentNotes.find(onString);
      const filtered = currentNotes.filter(n => !onString(n));
      if (fret >= 0) {
        filtered.push({ ...(existing ?? {}), stringIndex, fret });
        // Play instant auditory preview
        const midi = tuning[stringIndex] + fret;
        playback.playTone(midi);
      }
      return filtered;
    }, at);
    // Set active string
    setActiveStringIndex(stringIndex);
  };

  /** Adds or replaces an absolute pitch on the active beat (pitched tracks). */
  const setPitchForActiveNote = (midi: number, at?: BeatPosition, trackIndex?: number) => {
    updateActiveBeatNotes(currentNotes => {
      const existing = currentNotes.find(n => !isFrettedNote(n) && n.midi === midi);
      if (existing) return currentNotes;
      playback.playTone(midi);
      return [...currentNotes, { midi }];
    }, at, trackIndex);
  };

  // Pick the most comfortable string/fret for a pitch: prefer frets near the
  // 3rd position and strings near the one already under the cursor.
  const findBestStringFret = (
    targetMidi: number,
    excludeStrings?: Set<number>,
  ): { stringIndex: number; fret: number } | null => {
    let bestString = activeStringIndex;
    let bestFret = -1;
    let minCost = Infinity;

    for (let s = 0; s < stringCount; s++) {
      if (excludeStrings?.has(s)) continue;
      const fret = targetMidi - tuning[s];
      if (fret >= 0 && fret <= 22) {
        const cost = Math.abs(fret - 3) * 0.4 + Math.abs(s - activeStringIndex) * 1.0;
        if (cost < minCost) {
          minCost = cost;
          bestString = s;
          bestFret = fret;
        }
      }
    }

    return bestFret === -1 ? null : { stringIndex: bestString, fret: bestFret };
  };

  /**
   * Which note the cursor is on. Fretted tracks address it by string; pitched
   * tracks have no strings, so the cursor walks the chord from the top down.
   */
  const cursorNoteIndex = (notes: TabNote[]): number => {
    if (isFrettedTrack) {
      return notes.findIndex(n => isFrettedNote(n) && n.stringIndex === activeStringIndex);
    }
    const byPitch = [...notes].sort((a, b) => (b as PitchedNote).midi - (a as PitchedNote).midi);
    const target = byPitch[Math.min(activeStringIndex, byPitch.length - 1)];
    return target ? notes.indexOf(target) : -1;
  };

  const getCursorNote = (): TabNote | undefined => {
    const notes = getActiveBeat()?.notes ?? [];
    const idx = cursorNoteIndex(notes);
    return idx === -1 ? undefined : notes[idx];
  };

  // Shift the selected note by a number of semitones. A fretted note stays on
  // its string while the fret fits and is re-voiced onto another string when it
  // doesn't; a pitched note simply moves. Techniques ride along either way.
  const transposeActiveNote = (semitones: number) => {
    const beat = getActiveBeat();
    if (!beat) return;
    const idx = cursorNoteIndex(beat.notes);
    if (idx === -1) return;
    const note = beat.notes[idx];

    if (!isFrettedNote(note)) {
      const targetMidi = note.midi + semitones;
      if (targetMidi < 0 || targetMidi > 127) return;
      updateActiveBeatNotes(notes => notes.map((n, i) => (i === idx ? { ...n, midi: targetMidi } : n)));
      playback.playTone(targetMidi);
      return;
    }

    const targetMidi = (resolveNoteMidi(note, activeTrack) ?? NaN) + semitones;
    const sameStringFret = targetMidi - tuning[note.stringIndex];

    if (sameStringFret >= 0 && sameStringFret <= 22) {
      updateActiveBeatNotes(notes => notes.map((n, i) => (i === idx ? { ...n, fret: sameStringFret } : n)));
      playback.playTone(targetMidi);
      return;
    }

    const occupied = new Set(
      beat.notes.filter((n, i) => i !== idx && isFrettedNote(n)).map(n => (n as FrettedNote).stringIndex),
    );
    const placement = findBestStringFret(targetMidi, occupied);
    if (!placement) return;

    updateActiveBeatNotes(notes => [
      ...notes.filter((n, i) => i !== idx && !(isFrettedNote(n) && n.stringIndex === placement.stringIndex)),
      { ...note, stringIndex: placement.stringIndex, fret: placement.fret },
    ]);
    setActiveStringIndex(placement.stringIndex);
    playback.playTone(targetMidi);
  };

  const toggleNoteTechnique = (technique: keyof NoteTechniques) => {
    updateActiveBeatNotes(currentNotes => {
      const idx = cursorNoteIndex(currentNotes);
      if (idx === -1) return currentNotes;
      return currentNotes.map((n, i) => (i === idx ? { ...n, [technique]: !n[technique] } : n));
    });
  };

  /** Removes the note under the cursor, whichever kind of track this is. */
  const removeCursorNote = () => {
    updateActiveBeatNotes(currentNotes => {
      const idx = cursorNoteIndex(currentNotes);
      return idx === -1 ? currentNotes : currentNotes.filter((_, i) => i !== idx);
    });
  };

  const removeActiveNoteOnString = (stringIndex: number) => {
    updateActiveBeatNotes(currentNotes =>
      currentNotes.filter(n => !(isFrettedNote(n) && n.stringIndex === stringIndex)),
    );
  };

  const updateActiveBeat = (patch: (beat: TabBeat) => TabBeat) => {
    setMeasures(prev => prev.map((m, mIdx) => {
      if (mIdx !== activeMeasureIndex) return m;
      return { ...m, beats: m.beats.map((b, bIdx) => (bIdx === activeBeatIndex ? patch(b) : b)) };
    }));
  };

  const toggleActiveBeatRest = () => {
    updateActiveBeat(b => {
      const newRest = !b.isRest;
      // Keep notes but make them inactive when it's a rest
      return { ...b, isRest: newRest, notes: newRest ? [] : b.notes };
    });
  };

  const setDurationForActiveBeat = (dur: Duration) => {
    updateActiveBeat(b => ({ ...b, duration: dur }));
  };

  const toggleDotForActiveBeat = () => {
    updateActiveBeat(b => ({ ...b, dot: !b.dot }));
    setDotSelect(prev => !prev);
  };

  // Grid/beat manipulation. Beats belong to one track; bars belong to all of
  // them, so bar operations go through setAllTrackMeasures to keep the score
  // aligned.
  const insertBeatAfterActive = () => {
    setMeasures(prev => prev.map((m, mIdx) => {
      if (mIdx !== activeMeasureIndex) return m;
      const newBeat: TabBeat = {
        id: createId(),
        duration: durationSelect,
        dot: dotSelect,
        notes: [],
        isRest: true
      };
      const nextBeats = [...m.beats];
      nextBeats.splice(activeBeatIndex + 1, 0, newBeat);
      return { ...m, beats: nextBeats };
    }));
    // Move cursor to new beat
    setActiveBeatIndex(prev => prev + 1);
  };

  const deleteActiveBeat = () => {
    const measure = measures[activeMeasureIndex];
    if (!measure) return;

    // Never leave a bar with no beats: clear the last one instead of removing
    // it, which would desynchronise this track's bar count from the others.
    if (measure.beats.length <= 1) {
      updateActiveBeatNotes(() => []);
      return;
    }

    setMeasures(prev => prev.map((m, mIdx) => {
      if (mIdx !== activeMeasureIndex) return m;
      return { ...m, beats: m.beats.filter((_, idx) => idx !== activeBeatIndex) };
    }));
    setActiveBeatIndex(prev => Math.max(0, prev - 1));
  };

  const addMeasure = () => {
    setAllTrackMeasures(list => [...list, createEmptyMeasure()]);
    setActiveMeasureIndex(measures.length);
    setActiveBeatIndex(0);
  };

  const insertMeasureAfterActive = () => {
    setAllTrackMeasures(list => {
      const next = [...list];
      next.splice(activeMeasureIndex + 1, 0, createEmptyMeasure());
      return next;
    });
    setActiveMeasureIndex(prev => prev + 1);
    setActiveBeatIndex(0);
  };

  const deleteActiveMeasure = () => {
    if (measures.length <= 1) return; // Keep at least one
    setAllTrackMeasures(list => list.filter((_, idx) => idx !== activeMeasureIndex));
    setActiveMeasureIndex(prev => Math.max(0, prev - 1));
    setActiveBeatIndex(0);
    setAnchor(null);
  };

  const duplicateActiveMeasure = () => {
    if (!measures[activeMeasureIndex]) return;

    setAllTrackMeasures(list => {
      const source = list[activeMeasureIndex];
      if (!source) return list;
      // Spread the source so measure-level bpm / time signature overrides survive.
      const copy: TabMeasure = {
        ...source,
        id: createId(),
        beats: source.beats.map(b => ({
          ...b,
          id: createId(),
          notes: b.notes.map(n => ({ ...n }))
        }))
      };
      const next = [...list];
      next.splice(activeMeasureIndex + 1, 0, copy);
      return next;
    });
    setActiveMeasureIndex(prev => prev + 1);
    setActiveBeatIndex(0);
  };

  const clearSong = () => {
    playback.stop();
    editSong(createEmptySong());
    setActiveMeasureIndex(0);
    setActiveBeatIndex(0);
    setActiveStringIndex(0);
  };

  const startNewSong = async (): Promise<void> => {
    playback.stop();
    setOpenBottomMenu(null);
    setNotice(null);
    try {
      // A new song lands in the folder the open one lives in, when you may add to it.
      const created = await createSong(
        { ...createEmptySong(), bpm: settings.defaultBpm },
        canEdit(role) ? meta.folderId : null,
      );
      navigate(`/songs/${created.id}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The new song could not be created.');
    }
  };

  // --- SELECTION & CLIPBOARD ---

  const cursorPosition = { measureIndex: activeMeasureIndex, beatIndex: activeBeatIndex };
  const anchorMeasureIndex = measures.findIndex(m => m.id === anchor?.measureId);
  const anchorBeatIndex = measures[anchorMeasureIndex]?.beats.findIndex(b => b.id === anchor?.beatId) ?? -1;
  const [selectionFrom, selectionTo] = orderRange(
    anchorBeatIndex === -1 ? cursorPosition : { measureIndex: anchorMeasureIndex, beatIndex: anchorBeatIndex },
    cursorPosition,
  );
  const hasSelection = selectionFrom.measureIndex !== selectionTo.measureIndex
    || selectionFrom.beatIndex !== selectionTo.beatIndex;

  /** Shift-moves grow a selection from where the cursor was; any other move drops it. */
  const markSelection = (extend: boolean) => {
    if (!extend) setAnchor(null);
    else if (anchorBeatIndex === -1 && activeMeasureId !== null && activeBeatId !== null) {
      setAnchor({ measureId: activeMeasureId, beatId: activeBeatId });
    }
  };

  const moveCursorTo = (measureIndex: number, beatIndex: number, extend: boolean) => {
    markSelection(extend);
    setActiveMeasureIndex(measureIndex);
    setActiveBeatIndex(beatIndex);
  };

  /** Copies the selection, or just the cursor's beat when nothing is selected. */
  const copySelection = () => {
    setClip(copyBeats(activeTrack, selectionFrom, selectionTo));
  };

  const deleteSelection = () => {
    const next = removeBeats(song, activeTrackIndex, selectionFrom, selectionTo);
    editSong(next);
    const bars = next.tracks[activeTrackIndex].measures;
    const measureIndex = Math.min(selectionFrom.measureIndex, bars.length - 1);
    setActiveMeasureIndex(measureIndex);
    setActiveBeatIndex(Math.min(selectionFrom.beatIndex, bars[measureIndex].beats.length - 1));
    setAnchor(null);
  };

  const cutSelection = () => {
    copySelection();
    deleteSelection();
  };

  const pasteClipboard = () => {
    if (!clip) return;
    const pasted = pasteClip(song, activeTrackIndex, cursorPosition, clip);
    editSong(pasted.song);
    setActiveMeasureIndex(pasted.cursor.measureIndex);
    setActiveBeatIndex(pasted.cursor.beatIndex);
    setAnchor(null);
  };

  /** Steps to the next beat: an unfilled bar gets a rest, the last bar a new bar after it. */
  const advanceCursor = () => {
    const measure = measures[activeMeasureIndex];
    if (!measure) return;
    const beat = measure.beats[activeBeatIndex];
    const measureDur = measure.beats.reduce((acc, b) => acc + getDurationVal(b.duration, b.dot), 0);
    const timeSignature = getEffectiveTimeSignature(song, activeMeasureIndex);
    const targetDur = timeSignature.numerator * (4 / timeSignature.denominator);

    if (activeBeatIndex < measure.beats.length - 1) {
      setActiveBeatIndex(prev => prev + 1);
    } else if (measureDur < targetDur - 0.001) {
      // Bar is not filled yet, create a new beat with same length
      const newBeat: TabBeat = {
        id: createId(),
        duration: beat ? beat.duration : durationSelect,
        notes: [],
        isRest: true
      };
      setMeasures(list => list.map((m, mIdx) => (
        mIdx === activeMeasureIndex ? { ...m, beats: [...m.beats, newBeat] } : m
      )));
      setActiveBeatIndex(prev => prev + 1);
    } else if (activeMeasureIndex < measures.length - 1) {
      setActiveMeasureIndex(prev => prev + 1);
      setActiveBeatIndex(0);
    } else {
      const newMeasure: TabMeasure = {
        id: createId(),
        beats: [{
          id: createId(),
          duration: beat ? beat.duration : durationSelect,
          notes: [],
          isRest: true
        }]
      };
      // A new bar has to appear on every track, not just this one.
      setAllTrackMeasures((list, track) => [
        ...list,
        track === activeTrack ? newMeasure : createEmptyMeasure(),
      ]);
      setActiveMeasureIndex(prev => prev + 1);
      setActiveBeatIndex(0);
    }
  };

  // --- MIDI KEYBOARD ---

  /** The first key of a chord replaces the cursor beat's notes; keys pressed while it is held join it. */
  const pressMidiKey = (midi: number, chord: boolean) => {
    if (!chord) setAnchor(null);
    updateActiveBeatNotes(current => {
      const notes = chord ? current : [];
      if (notes.some(n => resolveNoteMidi(n, activeTrack) === midi)) return notes;
      if (!isFrettedTrack) return [...notes, { midi }];
      // Voiced inside the update, so the keys of a chord see each other before any render.
      const occupied = new Set(notes.filter(isFrettedNote).map(n => n.stringIndex));
      const placement = findBestStringFret(midi, occupied);
      return placement ? [...notes, placement] : current;
    });
  };

  const midiDevices = useMidiInput(
    midiInput && !readOnly,
    pressMidiKey,
    // Rendered at once, so the next key lands on the new beat and not on the one just written.
    () => flushSync(advanceCursor),
  );
  const midiStatus = !midiSupported()
    ? 'This browser has no Web MIDI. Chrome, Edge and Firefox do, over HTTPS or on localhost.'
    : !midiInput
      ? 'Play into the score from a MIDI keyboard. Keys held together make a chord.'
      : midiDevices === 'denied'
        ? 'MIDI access was blocked. Allow it in the site settings.'
        : midiDevices === null
          ? 'Waiting for permission…'
          : midiDevices.length === 0
            ? 'No MIDI device connected.'
            : `Listening to ${midiDevices.join(', ')}`;

  // --- KEYBOARD CONTROLS ---

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // If typing in input fields, ignore shortcuts
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    if (readOnly) return;

    const measure = measures[activeMeasureIndex];
    if (!measure) return;
    const beat = measure.beats[activeBeatIndex];

    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'v', 'z', 'y'].includes(key)) {
      e.preventDefault();
      if (key === 'c') copySelection();
      else if (key === 'x') cutSelection();
      else if (key === 'v') pasteClipboard();
      else if (key === 'z' && !e.shiftKey) channel.undo();
      else channel.redo();
      return;
    }

    switch (e.key) {
      // Arrow navigation — with Shift held, the arrows retune the selected note
      // instead of moving the cursor (Shift+Ctrl/Cmd for whole octaves).
      case 'ArrowUp':
        e.preventDefault();
        if (e.shiftKey) {
          transposeActiveNote(e.ctrlKey || e.metaKey ? 12 : 1);
        } else {
          setActiveStringIndex(prev => Math.max(0, prev - 1));
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (e.shiftKey) {
          transposeActiveNote(e.ctrlKey || e.metaKey ? -12 : -1);
        } else {
          setActiveStringIndex(prev => Math.min(stringCount - 1, prev + 1));
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        markSelection(e.shiftKey);
        if (activeBeatIndex > 0) {
          setActiveBeatIndex(prev => prev - 1);
        } else if (activeMeasureIndex > 0) {
          const prevMIdx = activeMeasureIndex - 1;
          setActiveMeasureIndex(prevMIdx);
          setActiveBeatIndex(measures[prevMIdx].beats.length - 1);
        }
        break;
      case 'ArrowRight': {
        e.preventDefault();
        markSelection(e.shiftKey);
        if (e.shiftKey) {
          // Selecting walks the beats that exist; it never writes new ones.
          const next = nextBeatPosition(measures, cursorPosition, false);
          if (next) {
            setActiveMeasureIndex(next.measureIndex);
            setActiveBeatIndex(next.beatIndex);
          }
          break;
        }
        advanceCursor();
        break;
      }

      case 'Escape':
        setAnchor(null);
        break;

      // Spacebar toggles playback
      case ' ':
        e.preventDefault();
        if (playback.isPlaying) {
          playback.stop();
        } else {
          startPlaybackFromCursor();
        }
        break;

      // Note technique shortcuts (when note options panel is open)
      case 'h':
      case 'H':
        e.preventDefault();
        toggleNoteTechnique('slur');
        break;
      case 's':
      case 'S':
        e.preventDefault();
        toggleNoteTechnique('legatoSlide');
        break;
      case 'v':
      case 'V':
        e.preventDefault();
        toggleNoteTechnique('vibrato');
        break;
      case 'b':
      case 'B':
        e.preventDefault();
        toggleNoteTechnique('bend');
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        toggleNoteTechnique('palmMute');
        break;
      case 'l':
      case 'L':
        e.preventDefault();
        toggleNoteTechnique('letRing');
        break;
      case 'o':
      case 'O':
        e.preventDefault();
        toggleNoteTechnique('harmonic');
        break;
      case 'g':
      case 'G':
        e.preventDefault();
        toggleNoteTechnique('ghostNote');
        break;

      // Delete / Backspace removes a note, or deletes the beat if it's a rest
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          deleteActiveMeasure();
        } else if (hasSelection) {
          deleteSelection();
        } else if (beat?.isRest) {
          deleteActiveBeat();
        } else if (showNoteOptions) {
          removeCursorNote();
          setShowNoteOptions(false);
        } else {
          removeCursorNote();
        }
        break;

      // Rest hotkey (or toggle + close panel)
      case 'r':
      case 'R':
        e.preventDefault();
        toggleActiveBeatRest();
        if (showNoteOptions) setShowNoteOptions(false);
        break;

      // Dot hotkey to toggle dotted note
      case '.':
        e.preventDefault();
        toggleDotForActiveBeat();
        if (showNoteOptions) setShowNoteOptions(false);
        break;

      // Plus / Equals / Minus to change duration (increase/decrease)
      case '=':
      case '+': {
        e.preventDefault();
        const durOrder: Duration[] = ['32', '16', '8', '4', '2', '1'];
        const currentDur = beat ? beat.duration : durationSelect;
        const currentIndex = durOrder.indexOf(currentDur);
        const nextIndex = Math.min(durOrder.length - 1, currentIndex + 1);
        const newDur = durOrder[nextIndex];
        setDurationForActiveBeat(newDur);
        setDurationSelect(newDur);
        break;
      }
      case '-':
      case '_': {
        e.preventDefault();
        const durOrder: Duration[] = ['32', '16', '8', '4', '2', '1'];
        const currentDur = beat ? beat.duration : durationSelect;
        const currentIndex = durOrder.indexOf(currentDur);
        const nextIndex = Math.max(0, currentIndex - 1);
        const newDur = durOrder[nextIndex];
        setDurationForActiveBeat(newDur);
        setDurationSelect(newDur);
        break;
      }

      default:
        // Handle number entry (0 to 9) with multi-digit parsing (e.g. typing 1 then 2 = fret 12)
        if (/[0-9]/.test(e.key)) {
          e.preventDefault();
          const now = e.timeStamp;
          let fretVal = parseInt(e.key);

          // If the last key was pressed less than 800ms ago and was a number
          if (now - lastKeyTimeRef.current < 800 && /[0-9]/.test(lastKeyStringRef.current)) {
            const combinedStr = lastKeyStringRef.current + e.key;
            const combinedVal = parseInt(combinedStr);
            if (combinedVal <= 24) {
              fretVal = combinedVal;
              lastKeyStringRef.current = combinedStr;
            } else {
              lastKeyStringRef.current = e.key;
            }
          } else {
            lastKeyStringRef.current = e.key;
          }
          lastKeyTimeRef.current = now;
          setFretForActiveNote(activeStringIndex, fretVal);
        }
        break;
    }
  };

  // Focus the container so it captures keys immediately. Never during playback
  // (the cursor moves every beat) and never while a form control has focus,
  // otherwise the title, bpm and tuning inputs become untypeable.
  useEffect(() => {
    if (playback.isPlaying) return;
    const el = containerRef.current;
    if (!el) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    ) return;
    el.focus();
  }, [activeBeatIndex, activeMeasureIndex, playback.isPlaying]);

  useEffect(() => {
    if (!showShortcuts && !openBottomMenu && !showNoteOptions) return;

    const handleOverlayKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowShortcuts(false);
        setOpenBottomMenu(null);
        setShowNoteOptions(false);
      }
    };

    window.addEventListener('keydown', handleOverlayKeyDown);
    return () => window.removeEventListener('keydown', handleOverlayKeyDown);
  }, [showShortcuts, openBottomMenu, showNoteOptions]);

  // --- SVG MEASUREMENT & LAYOUT CALCULATION ---

  const ROW_HEIGHT = computeRowHeight(stringCount, showTab, showNotation, grandStaff);
  const tabTop = getTabStaffTop(showNotation);

  // Tempo, metre and repeat marks are song-wide, so they are read off the conductor.
  const conductorMeasures = song.tracks[0]?.measures ?? [];
  // Bars drawn one above another share their spacing, so a grand staff's hands line up in time.
  const aligned = measures.map((_, mIdx) => alignBars(staves.map(staff => barOf(staff, mIdx))));
  // Every row opens with the key signature after the clef; the widest staff's sets the room.
  const keyAccidentals = showNotation ? Math.max(...staves.map(staff => Math.abs(keyOf(staff)))) : 0;
  const keyRoom = keyAccidentals === 0 ? 0 : keyAccidentals * KEY_SPACING + 4;
  // A staff that changes clef partway through a row writes the new clef, smaller, where it changes.
  const clefChanges = measures.map((_, mIdx) =>
    showNotation && mIdx > 0 && staves.some(staff => staff.clefs[mIdx] !== staff.clefs[mIdx - 1]));
  const measureLayouts: MLayout[] = computeMeasureLayouts(
    aligned.map(a => a.minWidth), conductorMeasures, keyRoom, clefChanges,
  );

  // Per-measure shift for notes below the lowest notation staff: pushes the TAB
  // down, or with the TAB hidden grows the row. Irrelevant with no notation staff.
  const lowestStaff = staves[staves.length - 1];
  const measureTabOffsets: number[] = measures.map((_, mIdx) => {
    if (!showNotation) return 0;
    let minStep = 4;
    for (const beat of barOf(lowestStaff, mIdx).beats) {
      if (beat.isRest) continue;
      for (const note of beat.notes) {
        const step = staffStep(noteMidi(note, lowestStaff), lowestStaff, mIdx);
        if (step < minStep) minStep = step;
      }
    }
    const overlap = -minStep * 5 + 8;
    return overlap > 0 ? Math.ceil(overlap / 10) * 10 : 0;
  });

  // Per-row max offset for TAB shift
  const rowExtra: number[] = [];
  measureLayouts.forEach((l, i) => {
    const r = l.row;
    rowExtra[r] = Math.max(rowExtra[r] || 0, measureTabOffsets[i]);
  });

  // Per-row extra top padding for very high notes (stems/beams above the staff)
  const rowHighExtra: number[] = [];
  measures.forEach((_, mIdx) => {
    const r = measureLayouts[mIdx]?.row ?? 0;
    let minNoteY = 0;
    if (!showNotation) return;
    // Only the top staff can climb into the row above.
    const top = staves[0];
    for (const beat of barOf(top, mIdx).beats) {
      if (beat.isRest || beat.notes.length === 0) continue;
      for (const note of beat.notes) {
        const y = Y_of_step(staffStep(noteMidi(note, top), top, mIdx));
        if (y < minNoteY) minNoteY = y;
      }
    }
    if (minNoteY < 0) {
      const stemTop = minNoteY - 32;
      const need = -stemTop;
      const extra = Math.max(0, need - STEM_TOP_PAD);
      if (extra > 0) rowHighExtra[r] = Math.max(rowHighExtra[r] || 0, extra);
    }
  });

  // Row Y cumulative offset (base row height + extra spacing)
  const rowYOffsets: number[] = [];
  let cumY = STEM_TOP_PAD;
  for (let r = 0; r < Math.max(rowExtra.length, rowHighExtra.length); r++) {
    cumY += rowHighExtra[r] || 0;
    rowYOffsets[r] = cumY;
    cumY += ROW_HEIGHT + (rowExtra[r] || 0);
  }

  const getRowY = (index: number): number => {
    const r = measureLayouts[index]?.row ?? 0;
    return rowYOffsets[r] ?? STEM_TOP_PAD;
  };

  /* The last row needs no headroom for a row that never follows it. */
  const totalSVGHeight = cumY + 10 - STEM_TOP_PAD;

  const getMeasureWidth = (index: number): number => measureLayouts[index]?.width ?? 0;
  const getMeasurePadding = (index: number): number => measureLayouts[index]?.padding ?? 18;
  const getMeasureX = (index: number): number => measureLayouts[index]?.x ?? 0;
  const getRowShift = (index: number): number => {
    const r = measureLayouts[index]?.row ?? 0;
    return rowExtra[r] || 0;
  };

  // Bottom boundary (offset from rowY) used for bar lines, selection highlight,
  // and the playback cursor. With the TAB staff hidden this is just below the
  // lowest standard staff instead of the bottom TAB line; name a staff for just its own.
  const getStaffBottom = (ts: number, staff: Staff = lowestStaff): number =>
    showTab ? tabTop + ts + stringCount * TAB_STAFF_HEIGHT_PX - 10 : staff.top + 50;

  /** Top boundary of the drawn staff block, or of one staff of a grand staff. */
  const getStaffTop = (ts: number, staff: Staff = staves[0]): number => (showNotation ? staff.top + 10 : tabTop + ts);

  const fretboardNeckHeight = computeFretboardNeckHeight(stringCount);

  const getFretboardStringY = (stringIdx: number): number =>
    getFretboardStringYFromLayout(stringIdx, stringCount);

  /** Where a beat of a staff's bar sits: on the onsets every staff of the row shares. */
  const getBeatCoordinates = (mIdx: number, bIdx: number, staff: Staff = activeStaff): number => {
    const padding = getMeasurePadding(mIdx);
    const usableWidth = getMeasureWidth(mIdx) - padding - 20;
    const at = aligned[mIdx]?.positions[staves.indexOf(staff)]?.[bIdx] ?? 0;
    return getMeasureX(mIdx) + padding + at * usableWidth;
  };

  // Determine the unified stem direction for a beam group in a staff's bar `mIdx`.
  const getBeamStemUp = (mIdx: number, beamGroup: BeamGroup, staff: Staff): boolean => {
    const measure = barOf(staff, mIdx);
    let anyBelow = false;
    let anyAbove = false;
    let maxDist = 0;
    let dirUp = true;
    for (let i = beamGroup.startIdx; i <= beamGroup.endIdx; i++) {
      const beat = measure.beats[i];
      if (!beat) continue;
      for (const note of beat.notes) {
        const diatonicStep = staffStep(noteMidi(note, staff), staff, mIdx);
        if (diatonicStep < 0) anyBelow = true;
        if (diatonicStep > 12) anyAbove = true;
        const dist = Math.abs(diatonicStep - 6);
        if (dist > maxDist) {
          maxDist = dist;
          dirUp = diatonicStep < 6;
        }
      }
    }
    if (anyBelow && !anyAbove) return true;
    if (anyAbove && !anyBelow) return false;
    return dirUp;
  };

  // Calculate beam Y position for a beam group (standard notation); `staffY` is
  // the row's origin plus the staff's offset.
  const getBeamY = (mIdx: number, beamGroup: BeamGroup, stemUp: boolean, staff: Staff, staffY: number): number => {
    const measure = barOf(staff, mIdx);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = beamGroup.startIdx; i <= beamGroup.endIdx; i++) {
      const b = measure.beats[i];
      if (!b || b.isRest || b.notes.length === 0) continue;
      for (const n of b.notes) {
        const y = staffY + Y_of_step(staffStep(noteMidi(n, staff), staff, mIdx));
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (stemUp) return (minY === Infinity ? 0 : minY) - 30;
    return (maxY === -Infinity ? 0 : maxY) + 30;
  };

  // Keeps the bar being edited or played on screen: below the sticky app header and
  // above the panels floating over the bottom of the page. A bar that leaves that
  // band comes back by the shortest scroll while editing; while playing it goes to
  // the top of the band, so the music that follows it is on screen too.
  useEffect(() => {
    const root = containerRef.current;
    const marker = root?.querySelector(playback.isPlaying ? '.playback-line' : '.selection-ring');
    // The panel comes before the command bar in the page, so this finds the panel
    // while it shows and the command bar once it is hidden.
    const cover = root?.querySelector('.sheetor-fretboard, .bottom-command-bar');
    if (!root || !marker || !cover) return;
    const box = marker.getBoundingClientRect();
    // Headroom above the staff keeps the bar number and tempo mark in sight.
    const top = parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) + 40;
    const bottom = cover.getBoundingClientRect().top - 16;
    if (box.top < top || (playback.isPlaying && box.bottom > bottom)) {
      window.scrollBy({ top: box.top - top, behavior: 'smooth' });
    } else if (box.bottom > bottom) {
      window.scrollBy({ top: box.bottom - bottom, behavior: 'smooth' });
    }
    // A narrow window scrolls the score sideways instead.
    const canvas = root.querySelector('.sheetor-canvas-container');
    const view = canvas?.getBoundingClientRect();
    if (canvas && view && (box.left < view.left || box.right > view.right)) {
      canvas.scrollBy({ left: box.left - view.left - view.width / 3, behavior: 'smooth' });
    }
  }, [activeMeasureIndex, activeBeatIndex, activeTrackIndex, playback.playbackBeat, playback.isPlaying, showFretboard, showTab, showNotation, grandStaff]);

  // A click on the staff writes the pitch under the pointer into the beat that was
  // clicked, on that staff's track: a click on a grand staff's other hand switches
  // to it. The cursor moves there too, but only on the next render, so the write
  // names the beat and the track itself.
  const handleStandardStaffClick = (at: BeatPosition, clickY: number, staff: Staff) => {
    const track = song.tracks[staff.track];
    const step = Math.round((60 - clickY) / 5) - clefAt(staff, at.measureIndex).shift;
    const clicked = staffStepToSoundingMidi(step, track.transpose, keyOf(staff));
    setActiveTrackIndex(staff.track);
    moveCursorTo(at.measureIndex, at.beatIndex, false);
    if (!isFretted(track)) {
      setPitchForActiveNote(clicked, at, staff.track);
      return;
    }
    // Clamp to what the tuning can voice, so a click above or below the reachable
    // range still lands on the nearest playable pitch.
    const lowestMidi = Math.min(...tuning);
    const highestMidi = Math.max(...tuning) + 22;
    const placement = findBestStringFret(Math.max(lowestMidi, Math.min(highestMidi, clicked)));
    if (placement) setFretForActiveNote(placement.stringIndex, placement.fret, at);
  };

  // Clicking a piano key places (or removes) that pitch on the active beat.
  // On a fretted track, strings already voicing another note are off-limits, so
  // stacking keys builds a chord instead of overwriting what was there.
  const toggleNoteAtMidi = (targetMidi: number) => {
    const beatNotes = getActiveBeat()?.notes ?? [];
    const existingIdx = beatNotes.findIndex(n => resolveNoteMidi(n, activeTrack) === targetMidi);
    if (existingIdx !== -1) {
      updateActiveBeatNotes(notes => notes.filter((_, i) => i !== existingIdx));
      return;
    }
    if (!isFrettedTrack) {
      setPitchForActiveNote(targetMidi);
      return;
    }
    const occupied = new Set(
      beatNotes.filter(isFrettedNote).map(n => n.stringIndex),
    );
    const placement = findBestStringFret(targetMidi, occupied);
    if (placement) setFretForActiveNote(placement.stringIndex, placement.fret);
  };

  // --- EXPORT / IMPORT LOGIC ---

  const handleExport = () => {
    setJsonText(JSON.stringify(song, null, 2));
    setModalOpen('export');
    setModalStatus('');
  };

  const handleImport = () => {
    setJsonText('');
    setModalOpen('import');
    setModalStatus('');
  };

  const copyToClipboard = () => {
    const clearStatusSoon = () => setTimeout(() => setModalStatus(''), 2000);
    if (!navigator.clipboard) {
      setModalStatus('Copy failed — select the text and copy manually.');
      clearStatusSoon();
      return;
    }
    navigator.clipboard.writeText(jsonText)
      .then(() => {
        setModalStatus('JSON copied to clipboard!');
        clearStatusSoon();
      })
      .catch(() => {
        setModalStatus('Copy failed — select the text and copy manually.');
        clearStatusSoon();
      });
  };

  const downloadJsonFile = () => {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${song.title.toLowerCase().replace(/\s+/g, '_')}_tab.json`;
    a.click();
    URL.revokeObjectURL(url);
    setModalStatus('File downloaded!');
    setTimeout(() => setModalStatus(''), 2000);
  };

  const executeImport = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      setModalStatus(`Error: ${err instanceof Error ? err.message : 'Invalid JSON format'}`);
      return;
    }

    const result = parseSong(parsed);
    if (!result.ok) {
      setModalStatus(`Error: ${result.error}`);
      return;
    }

    editSong(result.song);
    setActiveTrackIndex(0);
    setActiveMeasureIndex(0);
    setActiveBeatIndex(0);
    setActiveStringIndex(0);
    setModalOpen(null);
  };



  // --- RENDER HELPERS ---

  const activeBeat = getActiveBeat();
  const selectedNotes = activeBeat?.notes ?? [];
  const activeNote = getCursorNote();
  const activeMeasureBpm = getEffectiveBpm(song, activeMeasureIndex);
  // Only one tempo box can have focus, so one draft serves both. The score box
  // owns it whenever it is open; otherwise it belongs to the transport field.
  const transportBpmText = bpmEditIndex === null && bpmDraft !== null
    ? bpmDraft
    : String(activeMeasureBpm);
  const activeMeasureTimeSignature = getEffectiveTimeSignature(song, activeMeasureIndex);
  const activeRepeat = conductorMeasures[activeMeasureIndex]?.repeatEnd;

  // Piano keyboard geometry & highlighting. A fretted track's keyboard spans
  // what its tuning can reach; a pitched track gets a fixed practical range.
  const keyboardMidis = isFrettedTrack
    ? computeKeyboardRange(tuning, fretCount)
    : computeKeyboardRange([PITCHED_KEYBOARD_LOW], PITCHED_KEYBOARD_HIGH - PITCHED_KEYBOARD_LOW);
  const whiteKeyMidis = keyboardMidis.filter(isWhiteKey);
  const blackKeys = keyboardMidis
    .filter(midi => !isWhiteKey(midi))
    .map(midi => {
      // Sit each black key on the seam between its two neighbouring white keys.
      const whitesBefore = whiteKeyMidis.filter(w => w < midi).length;
      return { midi, leftPct: (whitesBefore / whiteKeyMidis.length) * 100 };
    });

  const blackKeyWidthPct = (100 / whiteKeyMidis.length) * 0.62;

  const activeMidis = new Set(selectedNotes.map(n => (resolveNoteMidi(n, activeTrack) ?? NaN)));
  const playbackBeatObj = playback.playbackBeat
    ? measures[playback.playbackBeat.measureIndex]?.beats[playback.playbackBeat.beatIndex]
    : undefined;
  const playbackMidis = new Set(
    playbackBeatObj && !playbackBeatObj.isRest
      ? playbackBeatObj.notes.map(n => (resolveNoteMidi(n, activeTrack) ?? NaN))
      : [],
  );

  // On a grand staff the keyboard shows both hands, each in its own colour: the
  // other hand as it sounds at the cursor's moment, or as it plays.
  const otherHandMidis = ((): Set<number> => {
    if (otherHandIndex === null) return new Set();
    const other = song.tracks[otherHandIndex];
    const pb = playback.otherHandBeat;
    const bar = other.measures[activeMeasureIndex];
    const here = measures[activeMeasureIndex];
    const beat = playback.isPlaying
      ? (pb ? other.measures[pb.measureIndex]?.beats[pb.beatIndex] : undefined)
      : (bar && here ? bar.beats[beatAt(bar, beatOnset(here, activeBeatIndex))] : undefined);
    return new Set(beat?.notes.map(n => resolveNoteMidi(n, other) ?? NaN));
  })();

  /** A key's highlight. On a grand staff the hand you write to is lit in the accent, the other hand in a pale tint of it. */
  const keyClass = (midi: number): string => {
    if (grand) return activeMidis.has(midi) ? ' active' : otherHandMidis.has(midi) ? ' other-hand' : '';
    return `${activeMidis.has(midi) ? ' active' : ''}${playbackMidis.has(midi) ? ' playback-active' : ''}`;
  };

  /**
   * The cursor slot a note occupies: its string on a fretted track, its rank
   * from the top of the chord on a pitched one.
   */
  const cursorSlotOf = (note: TabNote, notes: TabNote[]): number => {
    if (isFrettedNote(note)) return note.stringIndex;
    const byPitch = [...notes].sort((a, b) => (b as PitchedNote).midi - (a as PitchedNote).midi);
    return Math.max(0, byPitch.indexOf(note));
  };

  const isCursorNote = (mIdx: number, bIdx: number, noteIndex: number, notes: TabNote[], track: number = activeTrackIndex): boolean =>
    track === activeTrackIndex && activeMeasureIndex === mIdx && activeBeatIndex === bIdx && cursorNoteIndex(notes) === noteIndex;

  /** Clicking a note of a grand staff's other hand switches to it; a selection never spans hands. */
  const selectNote = (mIdx: number, bIdx: number, noteIndex: number, notes: TabNote[], extend: boolean, track: number = activeTrackIndex) => {
    const wasSelected = isCursorNote(mIdx, bIdx, noteIndex, notes, track);
    const note = notes[noteIndex];
    const extending = extend && track === activeTrackIndex;
    setActiveTrackIndex(track);
    moveCursorTo(mIdx, bIdx, extending);
    if (note) setActiveStringIndex(cursorSlotOf(note, notes));
    setShowNoteOptions(wasSelected && !extending && !readOnly);
  };

  /** Dots of a repeat sign sit in the two spaces either side of each staff's middle. */
  const repeatDotYs = (ts: number): number[] => {
    const ys = showNotation ? [25, 35] : [];
    if (showTab) {
      const middle = tabTop + ts + (stringCount - 1) * 5;
      const offset = stringCount % 2 === 0 ? 10 : 5;
      ys.push(middle - offset, middle + offset);
    }
    return ys;
  };

  /** ‖: when `side` is 1, :‖ when it is -1 — thick line outside, dots facing the music. */
  const repeatSign = (x: number, side: 1 | -1, rowY: number, ts: number) => (
    <g pointerEvents="none">
      <line x1={x + side * 1.25} y1={rowY + getStaffTop(ts)} x2={x + side * 1.25} y2={rowY + getStaffBottom(ts)} className="bar-line-end" />
      <line x1={x + side * 5} y1={rowY + getStaffTop(ts)} x2={x + side * 5} y2={rowY + getStaffBottom(ts)} className="bar-line" />
      {repeatDotYs(ts).map(y => (
        <circle key={y} cx={x + side * 8.5} cy={rowY + y} r="1.8" className="glyph-ink" />
      ))}
    </g>
  );

  const durationButtons = (['1', '2', '4', '8', '16', '32'] as const).map((dur) => (
    <button
      key={dur}
      className={`duration-btn ${durationSelect === dur ? 'active' : ''}`}
      onClick={() => {
        setDurationSelect(dur);
        setDurationForActiveBeat(dur);
      }}
      title={`Set note length: ${dur === '1' ? 'Whole' : dur === '2' ? 'Half' : dur === '4' ? 'Quarter' : dur === '8' ? 'Eighth' : dur === '16' ? 'Sixteenth' : 'Thirty-Second'}`}
    >
      {dur === '1' && (
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
          <ellipse cx="12" cy="12" rx="6" ry="4" transform="rotate(-20 12 12)" />
        </svg>
      )}
      {dur === '2' && (
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
          <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
          <line x1="15" y1="14" x2="15" y2="4" strokeWidth="2.2" />
        </svg>
      )}
      {dur === '4' && (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
          <line x1="15" y1="14" x2="15" y2="4" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      )}
      {dur === '8' && (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
          <line x1="15" y1="14" x2="15" y2="4" stroke="currentColor" strokeWidth="2.2" />
          <path d="M 15 4 C 18 6, 20 10, 18 13 C 17.5 10, 16 7, 15 6" />
        </svg>
      )}
      {dur === '16' && (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
          <line x1="15" y1="14" x2="15" y2="4" stroke="currentColor" strokeWidth="2.2" />
          <path d="M 15 4 C 18 6, 20 10, 18 13 C 17.5 10, 16 7, 15 6" />
          <path d="M 15 7.5 C 18 9.5, 20 13.5, 18 16.5 C 17.5 13.5, 16 10.5, 15 9.5" />
        </svg>
      )}
      {dur === '32' && (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
          <line x1="15" y1="14" x2="15" y2="4" stroke="currentColor" strokeWidth="2.2" />
          <path d="M 15 4 C 18 6, 20 10, 18 13 C 17.5 10, 16 7, 15 6" />
          <path d="M 15 7.5 C 18 9.5, 20 13.5, 18 16.5 C 17.5 13.5, 16 10.5, 15 9.5" />
          <path d="M 15 11 C 18 13, 20 17, 18 20 C 17.5 17, 16 14, 15 13" />
        </svg>
      )}
      <span className="duration-label">
        {dur === '1' ? '1/1' : dur === '2' ? '1/2' : dur === '4' ? '1/4' : dur === '8' ? '1/8' : dur === '16' ? '1/16' : '1/32'}
      </span>
    </button>
  ));

  const dotButton = (
    <button
      className={`duration-btn ${(activeBeat?.dot ?? dotSelect) ? 'active' : ''}`}
      onClick={() => {
        toggleDotForActiveBeat();
      }}
      title="Dotted note"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <circle cx="18" cy="18" r="3" />
        <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />
        <line x1="15" y1="14" x2="15" y2="4" stroke="currentColor" strokeWidth="2.2" />
      </svg>
      <span className="duration-label">.</span>
    </button>
  );

  // The View menu's Fretboard/Keyboard toggle brings the panel back.
  const hidePanelButton = (
    <button
      className="panel-hide"
      onClick={() => setShowFretboard(false)}
      title="Hide (View menu shows it again)"
      aria-label={`Hide the ${showTab ? 'fretboard' : 'keyboard'}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );

  return (
    <div 
      className="sheetor-container"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Top Header */}
      <div className="sheetor-header">
        <div className="sheetor-title-section">
          <input
            className="sheetor-title-input"
            value={song.title}
            readOnly={readOnly}
            onChange={(e) => editSong({ ...song, title: e.target.value })}
            placeholder="Song Title"
          />
          <input
            className="sheetor-artist-input"
            value={song.artist}
            readOnly={readOnly}
            onChange={(e) => editSong({ ...song, artist: e.target.value })}
            placeholder="Artist"
          />
          {notice !== null && (
            <p className="editor-notice" role="alert">
              {notice}
            </p>
          )}
        </div>

        <div className="presence">
          <span className={`presence-status is-${live.status}`}>
            {live.status === 'live' ? 'Live' : live.status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
            {role === 'viewer' && ' · view only'}
          </span>
          {live.peers.map((peer) => (
            <span
              key={peer.connectionId}
              className={`presence-chip peer-${peer.userId % 6}`}
              title={`${peer.name} · ${peer.role}`}
            >
              {deriveInitials(peer.name)}
            </span>
          ))}
        </div>

        <dl className="selection-readout">
          <div className="readout-chip">
            <dt>Measure</dt>
            <dd>{activeMeasureIndex + 1} / {measures.length}</dd>
          </div>
          <div className="readout-chip">
            <dt>Beat</dt>
            <dd>{activeBeatIndex + 1} / {measures[activeMeasureIndex]?.beats.length ?? 0}</dd>
          </div>
          {showTab ? (
            <div className="readout-chip">
              <dt>String</dt>
              <dd>{activeStringIndex + 1} · {midiToNoteName(tuning[activeStringIndex] ?? 0)}</dd>
            </div>
          ) : (
            <div className="readout-chip">
              <dt>Notes</dt>
              <dd>
                {activeBeat?.isRest || selectedNotes.length === 0
                  ? '—'
                  : selectedNotes
                      .map(n => (resolveNoteMidi(n, activeTrack) ?? NaN))
                      .sort((a, b) => a - b)
                      .map(midiToNoteOctave)
                      .join(' ')}
              </dd>
            </div>
          )}
          <div className="readout-chip is-accent">
            <dt>Cursor</dt>
            <dd>
              {activeBeat?.isRest
                ? 'Rest'
                : !activeNote
                  ? 'Empty'
                  : showTab && isFrettedNote(activeNote)
                    ? `Fret ${activeNote.fret}`
                    : midiToNoteOctave(resolveNoteMidi(activeNote, activeTrack) ?? 0)}
            </dd>
          </div>
          <div className="readout-chip">
            <dt>Time</dt>
            <dd>{activeMeasureTimeSignature.numerator}/{activeMeasureTimeSignature.denominator}</dd>
          </div>
        </dl>
      </div>

      {/* Track strip — picks which track the score and input panel edit */}
      <TrackStrip
        tracks={song.tracks}
        activeTrackIndex={activeTrackIndex}
        onSelect={selectTrack}
        onToggleMute={(i) => updatePart(i, () => ({ muted: !song.tracks[i].muted }))}
        onToggleSolo={(i) => updatePart(i, () => ({ soloed: !song.tracks[i].soloed }))}
        onAddTrack={addTrack}
        onOpenSettings={() => setOpenBottomMenu(prev => (prev === 'track' ? null : 'track'))}
        settingsOpen={openBottomMenu === 'track'}
      >
        {openBottomMenu === 'track' && (
          <div className="bottom-popover track-popover">
            <span className="popover-title">Track settings</span>
            <label className="compact-field wide-field">
              <span>Name</span>
              <input
                className="control-input"
                value={part.name}
                onChange={(e) => updateTrack(hands[0], { name: e.target.value })}
              />
            </label>
            <label className="compact-field wide-field">
              <span>Sound</span>
              <select
                className="control-select"
                value={activeTrack.instrument}
                onChange={(e) => {
                  const instrument = e.target.value as InstrumentId;
                  // The instrument decides whether this is a TAB staff, so
                  // switching it can add or remove strings and rewrites the
                  // notes through their sounding pitch.
                  updatePart(activeTrackIndex, track => retuneTrack(track, instrument));
                  const slots = retuneTrack(activeTrack, instrument).tuning?.length ?? 1;
                  setActiveStringIndex(prev => Math.min(prev, Math.max(slots, 1) - 1));
                }}
              >
                {INSTRUMENT_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="compact-field wide-field">
              <span>Key</span>
              <select
                className="control-select"
                value={part.keySignature ?? 0}
                onChange={(e) => {
                  const key = Number(e.target.value);
                  // A grand staff's hands share their key; C major is stored as no key at all.
                  updatePart(activeTrackIndex, () => ({ keySignature: key === 0 ? undefined : key }));
                }}
              >
                {KEY_OPTIONS.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="compact-field wide-field">
              <span>Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={part.volume}
                onChange={(e) => updatePart(activeTrackIndex, () => ({ volume: parseFloat(e.target.value) }))}
              />
            </label>

            {isFrettedTrack && (
              <>
                <div className="popover-divider" />
                <span className="popover-title">Tuning</span>
                <label className="compact-field wide-field">
                  <span>Preset</span>
                  <select
                    className="control-select"
                    value={presetName}
                    onChange={(e) => {
                      const pitches = presets[e.target.value];
                      if (pitches) setTuning([...pitches]);
                    }}
                  >
                    {presetName === '' && <option value="">Custom</option>}
                    {Object.keys(presets).map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <label className="compact-field wide-field">
                  <span>Strings</span>
                  <select
                    className="control-select"
                    value={stringCount}
                    onChange={(e) => setTuning(resizeTuning(tuning, Number(e.target.value)))}
                  >
                    {[4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <div className="tuning-grid">
                  {tuning.map((pitch, i) => (
                    <label key={i} className="tuning-string">
                      <span>{i + 1}</span>
                      <select
                        className="control-select"
                        value={midiToNoteOctave(pitch)}
                        onChange={(e) => setTuning(tuning.map((p, j) => (j === i ? noteOctaveToMidi(e.target.value) : p)))}
                      >
                        {GUITAR_NOTE_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </>
            )}

            <div className="popover-divider" />
            <button className="btn" onClick={duplicateActiveTrack}>Duplicate track</button>
            <button
              className="btn btn-danger"
              onClick={deleteActiveTrack}
              disabled={song.tracks.length <= hands.length}
            >
              Delete track
            </button>
          </div>
        )}
      </TrackStrip>

      {/* Editor Canvas */}
      <div
        className="sheetor-canvas-container"
        onClick={() => {
          // Refocus the editor on click
          containerRef.current?.focus();
        }}
      >
        <svg 
          viewBox={`-25 0 ${MAX_ROW_WIDTH + 25} ${totalSVGHeight}`}
          className="music-svg"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          {/* Background Interactivity Catcher */}
          <rect 
            x="-25"
            width={MAX_ROW_WIDTH + 25} 
            height={totalSVGHeight} 
            fill="transparent" 
            className="svg-interactive-bg"
            onClick={() => containerRef.current?.focus()}
          />

          {/* Render Staff & Measure Lines */}
          {measures.map((measure, mIdx) => {
            const measureX = getMeasureX(mIdx);
            const measureW = getMeasureWidth(mIdx);
            const measureEnd = measureX + measureW;
            const isLast = mIdx === measures.length - 1;
            const rowY = getRowY(mIdx);
            const ts = getRowShift(mIdx);
            const effectiveTimeSignature = getEffectiveTimeSignature(song, mIdx);
            const effectiveBpm = getEffectiveBpm(song, mIdx);
            const marks = conductorMeasures[mIdx];
            const showTimingChange = mIdx === 0 || typeof marks?.bpm === 'number' || !!marks?.timeSignature;
            // A clef change partway through a row comes first, so a metre change moves right of it.
            const clefChange = clefChanges[mIdx] && measureLayouts[mIdx]?.x !== 0;
            const timeSignatureX = measureX + 12 + (clefChange ? CLEF_CHANGE_ROOM : 0);
            // A ‖: stands in for a plain bar line, but follows a clef or metre that opens the bar.
            const repeatStartX = measureLayouts[mIdx]?.x === 0 || showTimingChange || clefChange
              ? measureX + getMeasurePadding(mIdx) - REPEAT_PADDING - 6
              : measureX;

            const { isValid, actual, expected } = checkMeasureBeats(measure, mIdx, (i) => getEffectiveTimeSignature(song, i));

            return (
              <g key={measure.id}>
                {/* An over/under-filled bar is flagged in the margin, never on top
                    of the notes: a hairline tint plus an amber rule and count. */}
                {!isValid && (
                  <rect
                    x={measureX}
                    y={rowY + 2}
                    width={measureW}
                    height={getStaffBottom(ts) - 2 + 8}
                    className="measure-wash"
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {/* Standard notation: five lines per staff, a second (bass) staff on a grand staff */}
                {showNotation && staves.flatMap(staff => Array.from({ length: 5 }, (_, lineIdx) => {
                  const y = rowY + staff.top + 10 + lineIdx * 10;
                  return (
                    <line
                      key={`sl-${staff.top}-${lineIdx}`}
                      x1={measureX}
                      y1={y}
                      x2={measureEnd}
                      y2={y}
                      className="staff-line"
                    />
                  );
                }))}

                {/* TAB lines (TAB staff) */}
                {showTab && Array.from({ length: stringCount }).map((_, lineIdx) => {
                  const y = rowY + tabTop + ts + lineIdx * 10;
                  return (
                    <line
                      key={`tl-${lineIdx}`}
                      x1={measureX}
                      y1={y}
                      x2={measureEnd}
                      y2={y}
                      className="staff-line"
                    />
                  );
                })}

                {/* Bar line start / divider */}
                <line
                  x1={measureX}
                  y1={rowY + getStaffTop(ts)}
                  x2={measureX}
                  y2={rowY + getStaffBottom(ts)}
                  className="bar-line"
                />

                {/* Bar line end */}
                <line
                  x1={measureEnd}
                  y1={rowY + getStaffTop(ts)}
                  x2={measureEnd}
                  y2={rowY + getStaffBottom(ts)}
                  className={isLast ? "bar-line-end" : "bar-line"}
                />

                {marks?.repeatStart && repeatSign(repeatStartX, 1, rowY, ts)}
                {marks?.repeatEnd !== undefined && repeatSign(measureEnd, -1, rowY, ts)}
                {/* A plain repeat plays twice; engravers only write the count beyond that. */}
                {(marks?.repeatEnd ?? 0) > 2 && (
                  <text
                    x={measureEnd - 2}
                    y={rowY - 6}
                    textAnchor="end"
                    className="music-text"
                    fontSize="9"
                    style={{ pointerEvents: 'none' }}
                  >
                    ×{marks?.repeatEnd}
                  </text>
                )}

                {showTimingChange && (bpmEditIndex === mIdx ? (
                  // An HTML input inside the SVG: foreignObject coordinates are
                  // user units, so the box tracks the tempo mark at any zoom
                  // without mapping screen pixels back into the viewBox.
                  <foreignObject x={measureX + 14} y={rowY - 18} width="62" height="18">
                    <input
                      className="tempo-input"
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      aria-label={`Tempo for bar ${mIdx + 1}`}
                      value={bpmDraft ?? String(effectiveBpm)}
                      onChange={(e) => setBpmDraft(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => { commitBpmDraft(mIdx); setBpmEditIndex(null); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') { setBpmDraft(null); setBpmEditIndex(null); }
                      }}
                    />
                  </foreignObject>
                ) : (
                  <text
                    x={measureX + 18}
                    y={rowY - 6}
                    className="music-text tempo-mark"
                    fontSize="10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBpmDraft(null);
                      if (!readOnly) setBpmEditIndex(mIdx);
                    }}
                  >
                    <title>Click to set the tempo for bar {mIdx + 1}</title>
                    {`♩=${effectiveBpm}`}
                  </text>
                ))}

                {/* Measure number */}
                <text
                  x={measureX + 4}
                  y={rowY - 6}
                  className="measure-number"
                  fontSize="8"
                  style={{ pointerEvents: 'none' }}
                >
                  {mIdx + 1}
                </text>

                {!isValid && (
                  <g>
                    <text
                      className="measure-warning-text"
                      x={measureEnd - 12}
                      y={rowY + 9}
                      fontSize="7.5"
                      textAnchor="end"
                      style={{ pointerEvents: 'none' }}
                    >
                      {actual > expected ? 'over' : 'short'} {Math.round(Math.abs(actual - expected) * 100) / 100}
                    </text>
                    <title>
                      {`Bar length mismatch: ${actual} quarter notes, expected ${expected}.`}
                    </title>
                  </g>
                )}

                {/* Clef, TAB, tuning labels (rendered on the first measure of every row) */}
                {(measureLayouts[mIdx]?.x === 0) && (
                  <g transform={`translate(${measureX}, ${rowY})`}>
                    {showNotation && staves.map(staff => {
                      const clef = clefAt(staff, mIdx);
                      return (
                        <path
                          key={`clef-${staff.top}`}
                          d={clef.path}
                          fillRule={clef.fillRule}
                          transform={`translate(0, ${staff.top})`}
                          className="glyph-ink"
                        />
                      );
                    })}
                    {grandStaff && <path d={GRAND_BRACE_PATH} className="glyph-ink" />}

                    {/* Key signature, on every staff of the row */}
                    {showNotation && staves.flatMap(staff => keySignatureSteps(keyOf(staff)).map((step, i) => (
                      <React.Fragment key={`key-${staff.top}-${i}`}>
                        {accidentalGlyph(Math.sign(keyOf(staff)), KEY_X + i * KEY_SPACING, staff.top + Y_of_step(step + clefAt(staff, mIdx).keyOffset))}
                      </React.Fragment>
                    )))}

                    {/* Stacked TAB text */}
                    {showTab && (
                      <>
                        <text x="18" y={tabTop + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 - 14} className="music-text" fontSize="13" letterSpacing="0">T</text>
                        <text x="18" y={tabTop + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 2} className="music-text" fontSize="13" letterSpacing="0">A</text>
                        <text x="18" y={tabTop + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 18} className="music-text" fontSize="13" letterSpacing="0">B</text>
                      </>
                    )}

                    {/* Tuning labels to the left of the TAB text */}
                    {showTab && Array.from({ length: stringCount }).map((_, i) => {
                      const pitch = tuning[i];
                      const name = midiToNoteName(pitch);
                      return (
                        <text
                          key={i}
                          x="-8"
                          y={tabTop + ts + i * TAB_STAFF_HEIGHT_PX}
                          dominantBaseline="central"
                          className="glyph-label"
                          fontFamily="'Inter', sans-serif"
                          fontSize="7"
                          fontWeight="600"
                          textAnchor="end"
                          style={{ pointerEvents: 'none' }}
                        >
                          {name}
                        </text>
                      );
                    })}

                    {/* Time Signature (first-of-row measures) */}
                    {showTimingChange && (
                      <g>
                        {showNotation && staves.map(staff => (
                          <React.Fragment key={staff.top}>
                            <text x={50 + keyRoom} y={staff.top + 25} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                            <text x={50 + keyRoom} y={staff.top + 45} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                          </React.Fragment>
                        ))}

                        {showTab && (
                          <>
                            <text x={50 + keyRoom} y={tabTop + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 - 8} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                            <text x={50 + keyRoom} y={tabTop + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 12} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                          </>
                        )}
                      </g>
                    )}
                  </g>
                )}

                {/* A clef change partway through a row reprints every staff's clef, the unchanged
                    hand's too, so both are readable at a glance: smaller, kept on the line each names. */}
                {clefChange && staves.map(staff => {
                  const clef = clefAt(staff, mIdx);
                  return (
                    <path
                      key={`clef-change-${staff.top}`}
                      d={clef.path}
                      fillRule={clef.fillRule}
                      transform={`translate(${measureX + 3}, ${rowY + staff.top + clef.line}) scale(0.7) translate(-12, ${-clef.line})`}
                      className="glyph-ink"
                      pointerEvents="none"
                    />
                  );
                })}

                {/* Big Time Signature for timing changes (non-first-of-row measures) */}
                {showTimingChange && mIdx > 0 && measureLayouts[mIdx]?.x !== 0 && (
                  <g>
                    {showNotation && staves.map(staff => (
                      <React.Fragment key={staff.top}>
                        <text x={timeSignatureX} y={rowY + staff.top + 25} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                        <text x={timeSignatureX} y={rowY + staff.top + 45} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                      </React.Fragment>
                    ))}
                    {showTab && (
                      <>
                        <text x={timeSignatureX} y={rowY + tabTop + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 - 8} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                        <text x={timeSignatureX} y={rowY + tabTop + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 12} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                      </>
                    )}
                  </g>
                )}

                {/* Clicking a notation staff places the pitch under the pointer, read in that
                    staff's clef, on that staff's own beats: a grand staff's hands keep their own rhythm. */}
                {!readOnly && showNotation && staves.map(staff => barOf(staff, mIdx).beats.map((b, bIdx) => (
                  <rect
                    key={`click-${staff.top}-${b.id}`}
                    x={getBeatCoordinates(mIdx, bIdx, staff) - 10}
                    y={rowY + staff.top}
                    width="20"
                    height="65"
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        // A selection belongs to one track, so it never reaches across hands.
                        if (staff.track === activeTrackIndex) moveCursorTo(mIdx, bIdx, true);
                        return;
                      }
                      const rect = e.currentTarget.getBoundingClientRect();
                      const relativeY = e.clientY - rect.top;
                      const designY = relativeY * (65 / rect.height);
                      handleStandardStaffClick({ measureIndex: mIdx, beatIndex: bIdx }, designY, staff);
                    }}
                  />
                )))}

                {/* Clicking TAB staff region changes active beat/string */}
                {!readOnly && showTab && measure.beats.map((b, bIdx) => Array.from({ length: stringCount }).map((_, stringIdx) => (
                  <rect
                    key={`click-string-${b.id}-${stringIdx}`}
                    x={getBeatCoordinates(mIdx, bIdx) - 10}
                    y={rowY + tabTop + ts + stringIdx * 10 - 5}
                    width="20"
                    height="10"
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      moveCursorTo(mIdx, bIdx, e.shiftKey);
                      setActiveStringIndex(stringIdx);
                      setShowNoteOptions(false);
                    }}
                  />
                )))}
              </g>
            );
          })}

          {/* Shift-selection: one band per bar it touches, under the notes, on the active hand's staff */}
          {hasSelection && measures.map((measure, mIdx) => {
            if (mIdx < selectionFrom.measureIndex || mIdx > selectionTo.measureIndex) return null;
            const [first, last] = beatSpan(mIdx, measure.beats.length, selectionFrom, selectionTo);
            const ts = getRowShift(mIdx);
            const left = getBeatCoordinates(mIdx, first) - 11;
            return (
              <rect
                key={`range-${measure.id}`}
                x={left}
                y={getRowY(mIdx) + getStaffTop(ts, activeStaff) - 5}
                width={getBeatCoordinates(mIdx, last) + 11 - left}
                height={getStaffBottom(ts, activeStaff) - getStaffTop(ts, activeStaff) + 10}
                rx="4"
                className="selection-range"
                pointerEvents="none"
              />
            );
          })}

          {/* Render Active Beat Highlight & Playback Cursor. Each staff marks its own
              track's beats: the cursor sits on the active hand's staff, collaborators on
              whichever hand they are on, and the playhead runs through the whole system. */}
          {staves.map(staff => song.tracks[staff.track].measures.map((measure, mIdx) => {
            const rowY = getRowY(mIdx);
            const ts = getRowShift(mIdx);
            const own = staff.track === activeTrackIndex;
            const top = getStaffTop(ts, staff);
            const bottom = getStaffBottom(ts, staff);
            return measure.beats.map((b, bIdx) => {
              const beatX = getBeatCoordinates(mIdx, bIdx, staff);

              const isSelected = own && activeMeasureIndex === mIdx && activeBeatIndex === bIdx;
              const pb = playback.playbackBeat;
              const isPlayback = own && pb && pb.measureIndex === mIdx && pb.beatIndex === bIdx;

              return (
                <g key={`highlight-${b.id}`}>
                  {/* Collaborators' cursors, one outline per person on this beat */}
                  {live.peers
                    .filter((peer) => peer.cursor?.trackId === song.tracks[staff.track].id
                      && peer.cursor.measureId === measure.id
                      && peer.cursor.beatId === b.id)
                    .map((peer) => (
                      <g key={peer.connectionId} className={`peer-cursor peer-${peer.userId % 6}`} pointerEvents="none">
                        <rect
                          x={beatX - 11}
                          y={rowY + top - 6}
                          width="22"
                          height={bottom - top + 12}
                          fill="none"
                          strokeWidth="1.5"
                          rx="5"
                        />
                        <text className="peer-label" x={beatX - 11} y={rowY + top - 9} fontSize="8">
                          {peer.name}
                        </text>
                      </g>
                    ))}

                  {/* Selected Cursor Highlight */}
                  {!readOnly && isSelected && (
                    <g>
                      <rect
                        x={beatX - 10}
                        y={rowY + top - 5}
                        width="20"
                        height={bottom - top + 10}
                        className="selection-ring"
                        strokeWidth="1.5"
                        rx="4"
                        pointerEvents="none"
                      />
                      {/* Fret/string tiny dot cursor in TAB */}
                      {showTab && (
                        <circle
                          cx={beatX}
                          cy={rowY + tabTop + ts + activeStringIndex * 10}
                          r="5.5"
                          fill="transparent"
                          className="cursor-ring"
                          strokeWidth="1.5"
                          pointerEvents="none"
                        />
                      )}
                    </g>
                  )}

                  {/* Playback Cursor (Green line) */}
                  {isPlayback && (
                    <line
                      x1={beatX}
                      y1={rowY + getStaffTop(ts) - 8}
                      x2={beatX}
                      y2={rowY + getStaffBottom(ts) + 10}
                      className="playback-line"
                      strokeWidth="2.5"
                      strokeDasharray="2"
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            });
          }))}

          {/* Render Notes & Rests, once per staff: each staff draws its own track's bars. */}
          {staves.map(staff => song.tracks[staff.track].measures.map((measure, mIdx) => {
            const rowY = getRowY(mIdx);
            const staffY = rowY + staff.top;
            const ts = getRowShift(mIdx);
            const beamGroups = computeBeamGroups(measure.beats, getEffectiveTimeSignature(song, mIdx));
            // Each note's ♯/♭/♮: only where neither the key nor an earlier note in the bar already says it.
            const accidentals = barAccidentals(
              measure.beats.map(b => (b.isRest ? [] : b.notes.map(n => spell(noteMidi(n, staff), staff)))),
              keyOf(staff),
            );
            return (
              <g key={`measure-${measure.id}-${staff.top}`}>
              {measure.beats.map((b, bIdx) => {
              const beatX = getBeatCoordinates(mIdx, bIdx, staff);
              const beamInfo = beamGroups.find(g => g.startIdx <= bIdx && bIdx <= g.endIdx);
              const beatNotes = b.notes;

              // 1. Rests. They are decoration painted over the staff's click
              // targets, so they must not swallow clicks meant to place a note.
              if (b.isRest || b.notes.length === 0) {
                const dur = b.duration;
                return (
                  <g key={`rest-${b.id}`} transform={`translate(0, ${staffY})`} style={{ pointerEvents: 'none' }}>
                    {showNotation && (<>
                    {/* Render Rest on Standard Staff */}
                    {dur === '1' && (
                      // Whole rest: hanging rectangle on line 4 (y=20)
                      <rect x={beatX - 6} y="20" width="12" height="6" className="glyph-ink" />
                    )}
                    {dur === '2' && (
                      // Half rest: sitting rectangle on line 3 (y=30)
                      <rect x={beatX - 6} y="24" width="12" height="6" className="glyph-ink" />
                    )}
                    {dur === '4' && (
                      // Quarter rest: classic squiggle (rendered as path)
                      <path
                        d={`M ${beatX - 1.5} ${30 - 10} l 3 3 c -1.5 1.5, -3 3, -0.75 4.5 c 1.5 1.5, 0.75 3, -2.25 4.5 c -1.5 -0.75, -2.25 -1.5, -0.75 -2.25 c 1.5 -0.75, 0.75 -1.5, 0 -2.25 c -1.5 -0.75, -1.1 -2.25, 0.75 -3.3 Z`}
                        className="glyph-ink glyph-ink-stroke"
                        strokeWidth="1.5"
                      />
                    )}
                    {(dur === '8' || dur === '16' || dur === '32') && (
                      // Eighth / Sixteenth / Thirty-Second rest: slash with hooks
                      <g>
                        <line x1={beatX + 2} y1={22} x2={beatX - 3} y2={35} className="glyph-ink-stroke" strokeWidth="1.5" />
                        <circle cx={beatX - 3} cy={24} r="2.2" className="glyph-ink" />
                        {dur === '16' && (
                          <circle cx={beatX - 5} cy={29} r="2.2" className="glyph-ink" />
                        )}
                        {dur === '32' && (
                          <>
                            <circle cx={beatX - 5} cy={29} r="2.2" className="glyph-ink" />
                            <circle cx={beatX - 7} cy={34} r="2.2" className="glyph-ink" />
                          </>
                        )}
                      </g>
                    )}
                    {/* Dotted rest dot */}
                    {b.dot && (
                      <circle cx={beatX + 10} cy={dur === '1' ? 23 : dur === '2' ? 27 : 25} r="2.2" className="glyph-ink" pointerEvents="none" />
                    )}
                    </>)}
                  </g>
                );
              }

              // 2. Chords & Melodic Notes
              // Precalculate diatonic positions for standard staff rendering.
              // noteIndex is the note's slot in the beat, which is what the
              // cursor addresses on a pitched track (there is no string there).
              const calculatedNotes = beatNotes.map((n, noteIndex) => {
                const midi = noteMidi(n, staff);
                const step = staffStep(midi, staff, mIdx);
                return {
                  note: n,
                  noteIndex,
                  midi,
                  dot: b.dot,
                  step,
                  accidental: accidentals[bIdx]?.[noteIndex] ?? null,
                  y: staffY + Y_of_step(step)
                };
              });

              // Sort notes by pitch to determine stems easily (ascending order, i.e., lowest y is highest pitch)
              calculatedNotes.sort((x, y) => x.y - y.y);

              const lowestY = calculatedNotes[calculatedNotes.length - 1].y;
              const highestY = calculatedNotes[0].y;
              const avgStep = calculatedNotes.reduce((acc, curr) => acc + curr.step, 0) / calculatedNotes.length;
              
              // Stem direction: unified direction for beam groups, per-beat otherwise
              const stemUp = beamInfo ? getBeamStemUp(mIdx, beamInfo, staff) : avgStep < 6;
              const isWhole = b.duration === '1';
              const hasStem = !isWhole;

              // Stem position for beaming
              const stemX = hasStem ? (stemUp ? beatX + 4 : beatX - 4) : 0;
              const rawStemY = hasStem
                ? (beamInfo
                  ? (stemUp
                    ? getBeamY(mIdx, beamInfo, stemUp, staff, staffY) - 2
                    : getBeamY(mIdx, beamInfo, stemUp, staff, staffY) + 2)
                  : (stemUp ? highestY - 30 : lowestY + 30))
                : 0;
              const stemEndY = rawStemY;

              return (
                <g key={`notes-${b.id}`}>
                  {/* A. Standard Notation noteheads & stems */}
                  {showNotation && calculatedNotes.map((n) => {
                    const isSelected = isCursorNote(mIdx, bIdx, n.noteIndex, beatNotes, staff.track);

                    // Skip notes that would render below the TAB staff area (or,
                    // with the TAB hidden, below the row's reserved space)
                    if (showTab && n.y > rowY + tabTop + ts - 8) return null;
                    if (!showTab && n.y > rowY + ROW_HEIGHT + ts - 10) return null;

                    return (
                      <g key={`note-${mIdx}-${bIdx}-${n.noteIndex}`}>
                        {/* Ledger Lines if note lies outside the 5-line staff */}
                        {(() => {
                          const lines = [];
                          if (n.step <= 0) {
                            const bound = n.step % 2 === 0 ? n.step : n.step + 1;
                            for (let s = 0; s >= bound; s -= 2) {
                              lines.push(s);
                            }
                          } else if (n.step >= 12) {
                            const bound = n.step % 2 === 0 ? n.step : n.step - 1;
                            for (let s = 12; s <= bound; s += 2) {
                              lines.push(s);
                            }
                          }
                          return lines.map(lineStep => {
                            const lineY = staffY + Y_of_step(lineStep);
                            return (
                              <line
                                key={`ledg-${lineStep}`}
                                x1={beatX - 7}
                                y1={lineY}
                                x2={beatX + 7}
                                y2={lineY}
                                className="staff-ledger-line"
                                style={{ pointerEvents: 'none' }}
                              />
                            );
                          });
                        })()}

                        {n.accidental !== null && accidentalGlyph(n.accidental, beatX - 11.5, n.y)}

                        {/* Notehead */}
                        <ellipse
                          cx={beatX}
                          cy={n.y}
                          rx="4.5"
                          ry="3.0"
                          transform={`rotate(-20 ${beatX} ${n.y})`}
                          strokeWidth="1.4"
                          className={`notehead${isSelected ? ' is-selected' : ''}${b.duration === '1' || b.duration === '2' ? ' is-hollow' : ''}`}
                          onClick={(e) => {
                            selectNote(mIdx, bIdx, n.noteIndex, beatNotes, e.shiftKey, staff.track);
                          }}
                        />
                        {/* Dotted note dot */}
                        {b.dot && (
                          <circle cx={beatX + 8} cy={n.y} r="2.2" className="glyph-ink" pointerEvents="none" />
                        )}
                      </g>
                    );
                  })}

                  {/* Shared stem for chord */}
                  {showNotation && hasStem && (
                    <g>
                      <line
                        x1={stemX}
                        y1={stemUp ? lowestY : highestY}
                        x2={stemX}
                        y2={stemEndY}
                        className="glyph-ink-stroke"
                        strokeWidth="1.5"
                      />

                      {/* Individual flag for ungrouped 8th/16th */}
                      {!beamInfo && b.duration === '8' && (
                        <path
                          d={stemUp 
                            ? `M ${stemX} ${stemEndY} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                            : `M ${stemX} ${stemEndY} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                          }
                          className="glyph-ink"
                        />
                      )}
                      {!beamInfo && b.duration === '16' && (
                        <g className="glyph-ink">
                          <path
                            d={stemUp 
                              ? `M ${stemX} ${stemEndY} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                              : `M ${stemX} ${stemEndY} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                            }
                          />
                          <path
                            d={stemUp 
                              ? `M ${stemX} ${stemEndY + 5} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                              : `M ${stemX} ${stemEndY - 5} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                            }
                          />
                        </g>
                      )}
                      {!beamInfo && b.duration === '32' && (
                        <g className="glyph-ink">
                          <path
                            d={stemUp 
                              ? `M ${stemX} ${stemEndY} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                              : `M ${stemX} ${stemEndY} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                            }
                          />
                          <path
                            d={stemUp 
                              ? `M ${stemX} ${stemEndY + 5} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                              : `M ${stemX} ${stemEndY - 5} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                            }
                          />
                          <path
                            d={stemUp 
                              ? `M ${stemX} ${stemEndY + 10} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                              : `M ${stemX} ${stemEndY - 10} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                            }
                          />
                        </g>
                      )}
                    </g>
                  )}

                  {/* B. TAB numbers (fret digits over strings) */}
                  {showTab && b.notes.map((rawNote, noteIndex) => {
                    if (!isFrettedNote(rawNote)) return null;
                    const n = rawNote;
                    const stringY = rowY + tabTop + ts + n.stringIndex * 10;
                    const isSelected = isCursorNote(mIdx, bIdx, noteIndex, b.notes);

                    const fretDisplay = (note: FrettedNote): string => {
                      if (note.ghostNote) return 'x';
                      let text = note.harmonic ? `<${note.fret}>` : `${note.fret}`;
                      if (note.bend) text += 'b';
                      if (note.vibrato) text += '~';
                      return text;
                    };

                    const displayText = fretDisplay(n);
                    const bgWidth = Math.max(10, displayText.length * 6 + 4);

                    return (
                      <g
                        key={`tab-note-${mIdx}-${bIdx}-${n.stringIndex}`}
                        className={`tab-fret-container ${isSelected ? 'active-note' : ''}`}
                        onClick={(e) => {
                          selectNote(mIdx, bIdx, noteIndex, b.notes, e.shiftKey);
                        }}
                      >
                        {/* Background rectangle to block staff line behind fret number */}
                        <rect
                          x={beatX - bgWidth / 2}
                          y={stringY - TAB_FRET_FONT_SIZE / 2}
                          width={bgWidth}
                          height={TAB_FRET_FONT_SIZE}
                          rx="2"
                          className="tab-fret-bg"
                        />
                        <text
                          x={beatX}
                          y={stringY}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={TAB_FRET_FONT_SIZE}
                          className="tab-fret-text"
                        >
                          {displayText}
                        </text>
                        {(n.slur || n.legatoSlide) && (() => {
                          let prevPos: { x: number; y: number } | null = null;
                          for (let i = bIdx - 1; i >= 0; i--) {
                            const prevBeat = measure.beats[i];
                            const prevNote = prevBeat?.notes.find(nn => isFrettedNote(nn) && nn.stringIndex === n.stringIndex);
                            if (prevNote) {
                              prevPos = {
                                x: getBeatCoordinates(mIdx, i, staff),
                                y: getRowY(mIdx) + tabTop + ts + n.stringIndex * 10,
                              };
                              break;
                            }
                          }
                          if (!prevPos) return null;
                          if (n.slur) {
                            const dx = beatX - prevPos.x;
                            const cy = Math.min(prevPos.y, stringY) - 6;
                            return (
                              <path
                                d={`M ${prevPos.x} ${prevPos.y - 3} C ${prevPos.x + dx * 0.35} ${cy - 6}, ${beatX - dx * 0.35} ${cy - 6}, ${beatX} ${stringY - 3}`}
                                fill="none"
                                className="slur-line"
                                strokeWidth="1.2"
                                style={{ pointerEvents: 'none' }}
                              />
                            );
                          }
                          if (n.legatoSlide) {
                            return (
                              <line
                                x1={prevPos.x + 7}
                                y1={prevPos.y}
                                x2={beatX - 7}
                                y2={stringY}
                                className="slur-line"
                                strokeWidth="1"
                                style={{ pointerEvents: 'none' }}
                              />
                            );
                          }
                          return null;
                        })()}
                      </g>
                    );
                  })}

                  {/* TAB rhythm stem (duration indicator below TAB staff) */}
                  {showTab && hasStem && (
                    <line
                      x1={stemUp ? beatX + 4 : beatX - 4}
                      y1={rowY + tabTop + ts + stringCount * 10 + 2}
                      x2={stemUp ? beatX + 4 : beatX - 4}
                      y2={rowY + tabTop + ts + stringCount * 10 + 2 + (beamInfo ? 11.5 : 10)}
                      className="tab-stem"
                      strokeWidth="1.2"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Palm mute / let ring indicators */}
                  {showTab && b.notes.some(n => n.palmMute) && (
                    <text x={beatX - 12} y={rowY + tabTop + ts - 4} className="music-text technique-pm" fontSize="8" style={{ pointerEvents: 'none' }}>
                      P.M.
                    </text>
                  )}
                  {showTab && b.notes.some(n => n.letRing) && (
                    <text x={beatX - 12} y={rowY + tabTop + ts - 14} className="music-text technique-ring" fontSize="8" style={{ pointerEvents: 'none' }}>
                      let ring
                    </text>
                  )}
                </g>
              );
              })}

              {/* Beams for standard notation */}
              {showNotation && beamGroups.map((g, gi) => {
                const firstX = getBeatCoordinates(mIdx, g.startIdx, staff);
                const lastX = getBeatCoordinates(mIdx, g.endIdx, staff);
                const mainStemUp = getBeamStemUp(mIdx, g, staff);
                const beamY = getBeamY(mIdx, g, mainStemUp, staff, staffY);
                const beamDir = mainStemUp ? 1 : -1;
                const firstSX = mainStemUp ? firstX + 4 - 0.75 : firstX - 4 - 0.75;
                const lastSX = mainStemUp ? lastX + 4 + 0.75 : lastX - 4 + 0.75;

                // Find contiguous runs of 16th+32nd notes (secondary beam)
                const secondarySegments: { start: number; end: number }[] = [];
                for (let si = g.startIdx; si <= g.endIdx; ) {
                  const beat = measure.beats[si];
                  if (!beat || beat.isRest || beat.notes.length === 0 || beat.duration === '8') { si++; continue; }
                  const segStart = si;
                  while (si <= g.endIdx) {
                    const b = measure.beats[si];
                    if (!b || b.isRest || b.notes.length === 0 || b.duration === '8') break;
                    si++;
                  }
                  const segEnd = si - 1;
                  if (segEnd >= segStart) secondarySegments.push({ start: segStart, end: segEnd });
                }

                // Find contiguous 32nd-note runs (tertiary beam)
                const tertiarySegments: { start: number; end: number }[] = [];
                for (let si = g.startIdx; si <= g.endIdx; ) {
                  const beat = measure.beats[si];
                  if (!beat || beat.isRest || beat.notes.length === 0 || beat.duration !== '32') { si++; continue; }
                  const segStart = si;
                  while (si <= g.endIdx && measure.beats[si]?.duration === '32' && !(measure.beats[si]?.isRest)) si++;
                  const segEnd = si - 1;
                  if (segEnd >= segStart) tertiarySegments.push({ start: segStart, end: segEnd });
                }

                return (
                  <g key={`beam-${gi}`} style={{ pointerEvents: 'none' }}>
                    {/* Primary beam: spans the full group */}
                    <rect x={firstSX} y={beamY - 2} width={Math.max(lastSX - firstSX, 2)} height="4" className="glyph-ink" />
                    {/* Secondary beam: over 16th+32nd runs, extended 1/4 way to adjacent 8ths */}
                    {secondarySegments.map((seg, si) => {
                      const segFirstX = getBeatCoordinates(mIdx, seg.start, staff);
                      const segLastX = getBeatCoordinates(mIdx, seg.end, staff);
                      let leftX = segFirstX;
                      let rightX = segLastX;
                      if (seg.start > g.startIdx) {
                        const pb = measure.beats[seg.start - 1];
                        if (pb && !pb.isRest && pb.notes.length > 0 && pb.duration === '8') {
                          const prevX = getBeatCoordinates(mIdx, seg.start - 1, staff);
                          leftX = (prevX + 3 * segFirstX) / 4;
                        }
                      }
                      if (seg.end < g.endIdx) {
                        const nb = measure.beats[seg.end + 1];
                        if (nb && !nb.isRest && nb.notes.length > 0 && nb.duration === '8') {
                          const nextX = getBeatCoordinates(mIdx, seg.end + 1, staff);
                          rightX = (3 * segLastX + nextX) / 4;
                        }
                      }
                      const leftSX = mainStemUp ? leftX + 4 - 0.75 : leftX - 4 - 0.75;
                      const rightSX = mainStemUp ? rightX + 4 + 0.75 : rightX - 4 + 0.75;
                      return (
                        <rect key={`beam16-${gi}-${si}`} x={leftSX} y={beamY - 2 + beamDir * 5} width={Math.max(rightSX - leftSX, 2)} height="4" className="glyph-ink" />
                      );
                    })}
                    {/* Tertiary beam: over 32nd runs, extended 1/4 way to adjacent 16ths/8ths */}
                    {tertiarySegments.map((seg, si) => {
                      const segFirstX = getBeatCoordinates(mIdx, seg.start, staff);
                      const segLastX = getBeatCoordinates(mIdx, seg.end, staff);
                      let leftX = segFirstX;
                      let rightX = segLastX;
                      if (seg.start > g.startIdx) {
                        const pb = measure.beats[seg.start - 1];
                        if (pb && !pb.isRest && pb.notes.length > 0 && pb.duration !== '32') {
                          const prevX = getBeatCoordinates(mIdx, seg.start - 1, staff);
                          leftX = (prevX + 3 * segFirstX) / 4;
                        }
                      }
                      if (seg.end < g.endIdx) {
                        const nb = measure.beats[seg.end + 1];
                        if (nb && !nb.isRest && nb.notes.length > 0 && nb.duration !== '32') {
                          const nextX = getBeatCoordinates(mIdx, seg.end + 1, staff);
                          rightX = (3 * segLastX + nextX) / 4;
                        }
                      }
                      const leftSX = mainStemUp ? leftX + 4 - 0.75 : leftX - 4 - 0.75;
                      const rightSX = mainStemUp ? rightX + 4 + 0.75 : rightX - 4 + 0.75;
                      return (
                        <rect key={`beam32-${gi}-${si}`} x={leftSX} y={beamY - 2 + beamDir * 10} width={Math.max(rightSX - leftSX, 2)} height="4" className="glyph-ink" />
                      );
                    })}
                  </g>
                );
              })}

              {/* TAB rhythm beams (connecting the stems below TAB staff) */}
              {showTab && beamGroups.map((g, gi) => {
                const firstX = getBeatCoordinates(mIdx, g.startIdx, staff);
                const lastX = getBeatCoordinates(mIdx, g.endIdx, staff);
                const mainStemUp = getBeamStemUp(mIdx, g, staff);
                const rhythmY = rowY + tabTop + ts + stringCount * 10 + 2 + 10;
                const firstSX = mainStemUp ? firstX + 4 - 0.6 : firstX - 4 - 0.6;
                const lastSX = mainStemUp ? lastX + 4 + 0.6 : lastX - 4 + 0.6;

                // Find contiguous runs of 16th+32nd notes for secondary beam
                const secondarySegments: { start: number; end: number }[] = [];
                for (let si = g.startIdx; si <= g.endIdx; ) {
                  const beat = measure.beats[si];
                  if (!beat || beat.isRest || beat.notes.length === 0 || beat.duration === '8') { si++; continue; }
                  const segStart = si;
                  while (si <= g.endIdx) {
                    const b = measure.beats[si];
                    if (!b || b.isRest || b.notes.length === 0 || b.duration === '8') break;
                    si++;
                  }
                  const segEnd = si - 1;
                  if (segEnd >= segStart) secondarySegments.push({ start: segStart, end: segEnd });
                }

                // Find contiguous 32nd-note runs for tertiary beam
                const tertiarySegments: { start: number; end: number }[] = [];
                for (let si = g.startIdx; si <= g.endIdx; ) {
                  const beat = measure.beats[si];
                  if (!beat || beat.isRest || beat.notes.length === 0 || beat.duration !== '32') { si++; continue; }
                  const segStart = si;
                  while (si <= g.endIdx && measure.beats[si]?.duration === '32' && !(measure.beats[si]?.isRest)) si++;
                  const segEnd = si - 1;
                  if (segEnd >= segStart) tertiarySegments.push({ start: segStart, end: segEnd });
                }

                return (
                  <g key={`tab-beam-${gi}`} style={{ pointerEvents: 'none' }}>
                    <rect
                      x={firstSX}
                      y={rhythmY - 1.5}
                      width={Math.max(lastSX - firstSX, 2)}
                      height="3"
                      className="tab-beam"
                    />
                    {secondarySegments.map((seg, si) => {
                      const segFirstX = getBeatCoordinates(mIdx, seg.start, staff);
                      const segLastX = getBeatCoordinates(mIdx, seg.end, staff);
                      let leftX = segFirstX;
                      let rightX = segLastX;
                      if (seg.start > g.startIdx) {
                        const pb = measure.beats[seg.start - 1];
                        if (pb && !pb.isRest && pb.notes.length > 0 && pb.duration === '8') {
                          const prevX = getBeatCoordinates(mIdx, seg.start - 1, staff);
                          leftX = (prevX + 3 * segFirstX) / 4;
                        }
                      }
                      if (seg.end < g.endIdx) {
                        const nb = measure.beats[seg.end + 1];
                        if (nb && !nb.isRest && nb.notes.length > 0 && nb.duration === '8') {
                          const nextX = getBeatCoordinates(mIdx, seg.end + 1, staff);
                          rightX = (3 * segLastX + nextX) / 4;
                        }
                      }
                      const leftSX = mainStemUp ? leftX + 4 - 0.6 : leftX - 4 - 0.6;
                      const rightSX = mainStemUp ? rightX + 4 + 0.6 : rightX - 4 + 0.6;
                      return (
                        <rect
                          key={`tab-beam16-${gi}-${si}`}
                          x={leftSX}
                          y={rhythmY - 1.5 - 4}
                          width={Math.max(rightSX - leftSX, 2)}
                          height="3"
                          className="tab-beam"
                        />
                      );
                    })}
                    {tertiarySegments.map((seg, si) => {
                      const segFirstX = getBeatCoordinates(mIdx, seg.start, staff);
                      const segLastX = getBeatCoordinates(mIdx, seg.end, staff);
                      let leftX = segFirstX;
                      let rightX = segLastX;
                      if (seg.start > g.startIdx) {
                        const pb = measure.beats[seg.start - 1];
                        if (pb && !pb.isRest && pb.notes.length > 0 && pb.duration !== '32') {
                          const prevX = getBeatCoordinates(mIdx, seg.start - 1, staff);
                          leftX = (prevX + 3 * segFirstX) / 4;
                        }
                      }
                      if (seg.end < g.endIdx) {
                        const nb = measure.beats[seg.end + 1];
                        if (nb && !nb.isRest && nb.notes.length > 0 && nb.duration !== '32') {
                          const nextX = getBeatCoordinates(mIdx, seg.end + 1, staff);
                          rightX = (3 * segLastX + nextX) / 4;
                        }
                      }
                      const leftSX = mainStemUp ? leftX + 4 - 0.6 : leftX - 4 - 0.6;
                      const rightSX = mainStemUp ? rightX + 4 + 0.6 : rightX - 4 + 0.6;
                      return (
                        <rect
                          key={`tab-beam32-${gi}-${si}`}
                          x={leftSX}
                          y={rhythmY - 1.5 - 8}
                          width={Math.max(rightSX - leftSX, 2)}
                          height="3"
                          className="tab-beam"
                        />
                      );
                    })}
                  </g>
                );
              })}
              </g>
            );
          }))}
        </svg>
      </div>

      {/* Piano keyboard — replaces the fretboard in sheet-only mode, where
          string/fret input makes no sense but pitch input does. */}
      {showFretboard && !showTab && (
        <div className="sheetor-fretboard">
          <div className="fretboard-header">
            <div className="fretboard-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v9M15 4v9" />
              </svg>
              Keyboard
            </div>
            {grand && (
              // Which hand the keys, the keyboard and MIDI write to: its keys are the solid ones.
              <div className="control-group" role="group" aria-label="Hand">
                {(['left', 'right'] as const).map(hand => (
                  <button
                    key={hand}
                    className={`btn ${activeHand === hand ? 'btn-active' : ''}`}
                    onClick={() => switchHand(hand)}
                    aria-pressed={activeHand === hand}
                  >
                    {HAND_LABELS[hand]}
                  </button>
                ))}
              </div>
            )}
            <div className="sheet-controls">
              <div className="duration-selector">{durationButtons}{dotButton}</div>
              <button
                className={`btn ${activeBeat?.isRest ? 'btn-active' : ''}`}
                onClick={toggleActiveBeatRest}
                title="Toggle rest on the selected beat"
              >
                Rest
              </button>
              <button
                className="btn btn-danger"
                onClick={() => updateActiveBeatNotes(() => [])}
                title="Clear every note on the selected beat"
              >
                Clear
              </button>
            </div>
            {hidePanelButton}
          </div>

          <div className="piano-keyboard">
            <div className="piano-white-row">
              {whiteKeyMidis.map((midi) => (
                <button
                  key={`wk-${midi}`}
                  className={`piano-key white${keyClass(midi)}`}
                  onClick={() => toggleNoteAtMidi(midi)}
                  title={midiToNoteOctave(midi)}
                >
                  <span className="piano-key-label">{midiToNoteOctave(midi)}</span>
                </button>
              ))}
            </div>
            {blackKeys.map(({ midi, leftPct }) => (
              <button
                key={`bk-${midi}`}
                className={`piano-key black${keyClass(midi)}`}
                style={{
                  left: `${leftPct}%`,
                  width: `${blackKeyWidthPct}%`,
                  marginLeft: `-${blackKeyWidthPct / 2}%`,
                }}
                onClick={() => toggleNoteAtMidi(midi)}
                title={midiToNoteOctave(midi)}
              />
            ))}
          </div>

          <span className="fretboard-hint">
            {grand
              ? `Click a key to add or remove that pitch on the ${HAND_LABELS[activeHand].toLowerCase()}'s selected beat`
              : 'Click a key to add or remove that pitch on the selected beat'}
          </span>
        </div>
      )}

      {/* Virtual Fretboard */}
      {showFretboard && showTab && (
        <div className="sheetor-fretboard">
          <div className="fretboard-header">
            <div className="fretboard-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                <path d="M12 2a3 3 0 0 0-3 3v2.5c0 .5-.2 1-.6 1.4L5 12.5V16l1.5.5L5 21h14l-1.5-4.5L19 16v-3.5l-3.4-3.6c-.4-.4-.6-.9-.6-1.4V5a3 3 0 0 0-3-3Z" />
                <circle cx="8" cy="18" r="1" />
              </svg>
              Fretboard
            </div>
            <span className="fretboard-hint">
              Click a fret to place a note on the selected beat
            </span>
            {hidePanelButton}
          </div>

          <div className="fretboard-neck-container" style={{ height: `${fretboardNeckHeight}px` }}>
            {/* The Nut */}
            <div className="fretboard-nut" />

            {/* Fret marker dots on standard positions (3, 5, 7, 9, 12, 15) */}
            {[3, 5, 7, 9, 12, 15].map((fret) => {
              const leftPos = getFretLeftPercentage(fret - 1) + (getFretLeftPercentage(fret) - getFretLeftPercentage(fret - 1)) / 2;
              
              if (fret === 12) {
                // Double dots
                return (
                  <React.Fragment key={`mark-${fret}`}>
                    <div className="fretboard-marker double-1" style={{ left: `calc(30px + (100% - 30px) * ${leftPos / 100})` }} />
                    <div className="fretboard-marker double-2" style={{ left: `calc(30px + (100% - 30px) * ${leftPos / 100})` }} />
                  </React.Fragment>
                );
              }
              // Single dot
              return (
                <div 
                  key={`mark-${fret}`}
                  className="fretboard-marker single" 
                  style={{ left: `calc(30px + (100% - 30px) * ${leftPos / 100})` }} 
                />
              );
            })}

            {/* Nickel Frets vertical bars */}
            {Array.from({ length: fretCount }).map((_, idx) => {
              const fretNum = idx + 1;
              const leftPos = getFretLeftPercentage(fretNum);
              return (
                <div 
                  key={`fret-${fretNum}`}
                  className="fretboard-fret-line"
                  style={{ left: `calc(30px + (100% - 30px) * ${leftPos / 100})` }}
                />
              );
            })}

            {/* Horizontal Strings (rendered with scaling thicknesses) */}
            {Array.from({ length: stringCount }).map((_, stringIdx) => {
              const y = getFretboardStringY(stringIdx);
              const thickness = 1.0 + ((stringCount - 1) - stringIdx) * (2.5 / Math.max(stringCount - 1, 1));
              
              return (
                <div 
                  key={`fb-str-${stringIdx}`}
                  className="fretboard-string"
                  style={{ 
                    top: `${y}px`, 
                    height: `${thickness}px`,
                    opacity: 0.85
                  }}
                />
              );
            })}

            {/* Clickable fretboard note triggers & glowing bubbles */}
            {Array.from({ length: stringCount }).map((_, stringIdx) => {
              const stringY = getFretboardStringY(stringIdx);

              return Array.from({ length: fretCount + 1 }).map((_, fretNum) => {
                const leftPct = getFretCellLeft(fretNum);
                const widthPct = getFretCellWidth(fretNum);

                // Note name on this coordinate
                const noteMidi = tuning[stringIdx] + fretNum;
                const noteName = midiToNoteName(noteMidi);

                // Check if this fret is currently selected in the active beat
                const isSelectedNote = activeBeat && activeBeat.notes.some(
                  n => isFrettedNote(n) && n.stringIndex === stringIdx && n.fret === fretNum
                );

                // Check if playback cursor is currently playing this note
                let isPlaybackNote = false;
                const pb = playback.playbackBeat;
                if (pb) {
                  const pbBeatObj = measures[pb.measureIndex]?.beats[pb.beatIndex];
                  isPlaybackNote = pbBeatObj ? pbBeatObj.notes.some(
                    n => isFrettedNote(n) && n.stringIndex === stringIdx && n.fret === fretNum && !pbBeatObj.isRest
                  ) : false;
                }

                return (
                  <div
                    key={`cell-${stringIdx}-${fretNum}`}
                    className="fretboard-fret-cell"
                    style={{
                      top: `${stringY - 12}px`,
                      left: fretNum === 0 ? '0px' : `calc(30px + (100% - 30px) * ${leftPct / 100})`,
                      width: fretNum === 0 ? '30px' : `calc((100% - 30px) * ${widthPct / 100})`,
                      height: '25px',
                    }}
                    onClick={() => {
                      if (isSelectedNote) {
                        // Toggle it off
                        removeActiveNoteOnString(stringIdx);
                        setShowNoteOptions(false);
                      } else {
                        // Select it
                        setFretForActiveNote(stringIdx, fretNum);
                        setShowNoteOptions(false);
                      }
                    }}
                  >
                    <div className={`fretboard-note-bubble ${isSelectedNote ? 'active' : ''} ${isPlaybackNote ? 'playback-active' : ''}`}>
                      {fretNum === 0 ? `0 (${noteName})` : noteName}
                    </div>
                  </div>
                );
              });
            })}
          </div>

          {/* Fret Numbers Header bottom row */}
          <div className="fret-labels">
            {Array.from({ length: fretCount + 1 }).map((_, fretNum) => {
              const widthPct = getFretCellWidth(fretNum);
              return (
                <div 
                  key={`fret-lbl-${fretNum}`}
                  className="fret-label"
                  style={{
                    width: fretNum === 0 ? '30px' : `calc((100% - 30px) * ${widthPct / 100})`,
                  }}
                >
                  {fretNum === 0 ? 'Nut' : fretNum}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNoteOptions && (
        <div className="note-options-overlay" onClick={() => setShowNoteOptions(false)}>
        <div className="note-options-panel" onClick={(e) => e.stopPropagation()}>
          <div className="note-options-summary">
            <strong>
              {!activeNote
                ? `Beat ${activeBeatIndex + 1}`
                : isFrettedNote(activeNote)
                  ? `String ${activeNote.stringIndex + 1}, fret ${activeNote.fret}`
                  : midiToNoteOctave(activeNote.midi)}
            </strong>
            <span>{activeBeat?.isRest ? 'Rest' : `${selectedNotes.length} note${selectedNotes.length === 1 ? '' : 's'}`}</span>
          </div>
          <div className="duration-selector">{durationButtons}{dotButton}</div>
          {activeNote && (
            <div className="technique-row">
              <button
                className={`technique-btn ${activeNote?.harmonic ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('harmonic')}
                title="Harmonic"
              >&lt;/&gt;</button>
              <button
                className={`technique-btn ${activeNote?.palmMute ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('palmMute')}
                title="Palm mute"
              >P.M.</button>
              <button
                className={`technique-btn ${activeNote?.letRing ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('letRing')}
                title="Let ring"
              >Ring</button>
              <button
                className={`technique-btn ${activeNote?.vibrato ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('vibrato')}
                title="Vibrato"
              >~~</button>
              <button
                className={`technique-btn ${activeNote?.ghostNote ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('ghostNote')}
                title="Ghost note"
              >(x)</button>
              <button
                className={`technique-btn ${activeNote?.slur ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('slur')}
                title="Slur (hammer-on/pull-off)"
              >⌢</button>
              <button
                className={`technique-btn ${activeNote?.legatoSlide ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('legatoSlide')}
                title="Legato slide"
              >╱</button>
              <button
                className={`technique-btn ${activeNote?.bend ? 'active' : ''}`}
                onClick={() => toggleNoteTechnique('bend')}
                title="Bend"
              >b</button>
            </div>
          )}
          <button className="btn" onClick={toggleActiveBeatRest}>
            {activeBeat?.isRest ? 'Make playable' : 'Make rest'}
          </button>
          <button className="btn btn-danger" onClick={() => {
            removeCursorNote();
            setShowNoteOptions(false);
          }}>
            Remove note
          </button>
          <button className="btn" onClick={() => setShowNoteOptions(false)}>Close</button>
        </div>
        </div>
      )}

      {openBottomMenu && (
        <div className="popover-scrim" onClick={() => setOpenBottomMenu(null)} />
      )}

      <div className="bottom-command-bar">
        {/* Transport: everything that affects playback */}
        <div className="bottom-cluster">
          {playback.isPlaying ? (
            <button className="btn btn-danger" onClick={playback.stop}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={startPlaybackFromCursor}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
          )}
          <div className="transport-field">
            <label htmlFor="transport-bpm">BPM</label>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn"
                onClick={() => setMeasureBpm(activeMeasureIndex, activeMeasureBpm - 1)}
                disabled={activeMeasureBpm <= MIN_BPM}
                aria-label="Slower by one"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14" />
                </svg>
              </button>
              <input
                id="transport-bpm"
                type="text"
                inputMode="numeric"
                className="control-input stepper-input"
                value={transportBpmText}
                onChange={(e) => setBpmDraft(e.target.value)}
                onFocus={(e) => e.target.select()}
                onBlur={() => commitBpmDraft(activeMeasureIndex)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') { setBpmDraft(null); e.currentTarget.blur(); }
                }}
              />
              <button
                type="button"
                className="stepper-btn"
                onClick={() => setMeasureBpm(activeMeasureIndex, activeMeasureBpm + 1)}
                disabled={activeMeasureBpm >= MAX_BPM}
                aria-label="Faster by one"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>
          <div className="bottom-menu">
            <button
              className={`bottom-menu-trigger ${openBottomMenu === 'output' ? 'active' : ''}`}
              onClick={() => setOpenBottomMenu(prev => prev === 'output' ? null : 'output')}
              title="Speed, master volume and looping"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {playbackSpeed}x
            </button>
            {openBottomMenu === 'output' && (
              <div className="bottom-popover" style={{ left: 0, right: 'auto', minWidth: 200 }}>
                <span className="popover-title">Speed</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                    <button
                      key={speed}
                      className={`btn ${playbackSpeed === speed ? 'btn-active' : ''}`}
                      onClick={() => setPlaybackSpeed(speed)}
                      style={{ flex: 1, minWidth: 48 }}
                    >{speed}x</button>
                  ))}
                </div>
                <div className="popover-divider" />
                <label className="compact-field wide-field">
                  <span>Master</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                  />
                </label>
                <div className="popover-divider" />
                <button
                  className={`btn ${loopPlayback ? 'btn-active' : ''}`}
                  onClick={() => setLoopPlayback(prev => !prev)}
                >
                  {loopPlayback ? 'Loop on' : 'Loop off'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="cmd-spacer" />

        <div className="bottom-cluster">
          <div className="bottom-menu">
            <button
              className={`bottom-menu-trigger ${openBottomMenu === 'song' ? 'active' : ''}`}
              onClick={() => setOpenBottomMenu(prev => prev === 'song' ? null : 'song')}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 3H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z" />
                <path d="M19 3h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z" />
                <path d="M9 13H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z" />
                <path d="M19 13h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z" />
              </svg>
              Song
            </button>
            {openBottomMenu === 'song' && (
              <div className="bottom-popover">
              {!readOnly && (
              <>
              <span className="popover-title">Measure {activeMeasureIndex + 1}</span>
              <div className="control-group">
                <span className="control-label">Sig</span>
                <select
                  className="control-select"
                  value={activeMeasureTimeSignature.numerator}
                  onChange={(e) => {
                    const num = parseInt(e.target.value) || 4;
                    setActiveMeasureTimeSignature('numerator', num);
                  }}
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 12].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>/</span>
                <select
                  className="control-select"
                  value={activeMeasureTimeSignature.denominator}
                  onChange={(e) => {
                    const den = parseInt(e.target.value) || 4;
                    setActiveMeasureTimeSignature('denominator', den);
                  }}
                >
                  {[2, 4, 8, 16].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              {/* Each staff's clef from this bar on: a grand staff's hands are set apart. */}
              {showNotation && staves.map((staff, i) => (
                <div className="control-group" key={`clef-${staff.top}`}>
                  <span className="control-label">{grand ? `${i === 0 ? 'R.H.' : 'L.H.'} clef` : 'Clef'}</span>
                  {(['treble', 'bass'] as const).map(clef => (
                    <button
                      key={clef}
                      className={`btn ${staff.clefs[activeMeasureIndex] === clef ? 'btn-active' : ''}`}
                      onClick={() => setClef(staff, clef)}
                      aria-pressed={staff.clefs[activeMeasureIndex] === clef}
                    >
                      {CLEF_LABELS[clef]}
                    </button>
                  ))}
                </div>
              ))}
              <div className="control-group">
                <span className="control-label">Repeat</span>
                <button
                  className={`btn ${conductorMeasures[activeMeasureIndex]?.repeatStart ? 'btn-active' : ''}`}
                  onClick={toggleRepeatStart}
                  title="Start a repeated section at this bar"
                >
                  Start
                </button>
                <button
                  className={`btn ${activeRepeat !== undefined ? 'btn-active' : ''}`}
                  onClick={() => setRepeatEnd(activeRepeat !== undefined ? null : MIN_REPEAT)}
                  title="End a repeated section at this bar"
                >
                  End
                </button>
              </div>
              {activeRepeat !== undefined && (
                <div className="control-group">
                  <span className="control-label">Plays</span>
                  <div className="stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setRepeatEnd(activeRepeat - 1)}
                      disabled={activeRepeat <= MIN_REPEAT}
                      aria-label="Play the section one time fewer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                    <output className="stepper-value">×{activeRepeat}</output>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setRepeatEnd(activeRepeat + 1)}
                      disabled={activeRepeat >= MAX_REPEAT}
                      aria-label="Play the section one time more"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              <div className="popover-divider" />
              </>
              )}
              <span className="popover-title">Library</span>
              <button className="btn btn-primary" onClick={() => void startNewSong()}>New song</button>
              <Link className="btn" to="/library" onClick={() => setOpenBottomMenu(null)}>
                Open library
              </Link>
              <div className="popover-divider" />
              <span className="popover-title">Song file</span>
              <button className="btn" onClick={handleExport}>Export JSON</button>
              {!readOnly && <button className="btn" onClick={handleImport}>Import JSON</button>}
              {!readOnly && <div className="popover-divider" />}
              {!readOnly && <button className="btn btn-danger" onClick={clearSong}>Clear song</button>}
            </div>
            )}
          </div>

          {!readOnly && (
          <div className="bottom-menu">
            <button
              className={`bottom-menu-trigger ${openBottomMenu === 'edit' ? 'active' : ''}`}
              onClick={() => setOpenBottomMenu(prev => prev === 'edit' ? null : 'edit')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
              Edit
            </button>
            {openBottomMenu === 'edit' && (
              <div className="bottom-popover">
              <span className="popover-title">History</span>
              <div className="control-group">
                <button className="btn" onClick={channel.undo} disabled={!live.canUndo} style={{ flex: 1 }}>Undo</button>
                <button className="btn" onClick={channel.redo} disabled={!live.canRedo} style={{ flex: 1 }}>Redo</button>
              </div>
              <div className="popover-divider" />
              <span className="popover-title">Clipboard</span>
              <div className="control-group">
                <button className="btn" onClick={copySelection} style={{ flex: 1 }}>Copy</button>
                <button className="btn" onClick={cutSelection} style={{ flex: 1 }}>Cut</button>
                <button className="btn" onClick={pasteClipboard} disabled={!clip} style={{ flex: 1 }}>Paste</button>
              </div>
              <div className="popover-divider" />
              <span className="popover-title">Beat {activeBeatIndex + 1}</span>
              <button className="btn btn-primary" onClick={insertBeatAfterActive}>Insert beat</button>
              <button className="btn btn-danger" onClick={deleteActiveBeat}>Delete beat</button>
              <div className="popover-divider" />
              <span className="popover-title">Measure {activeMeasureIndex + 1}</span>
              <button className="btn" onClick={addMeasure}>Add measure</button>
              <button className="btn" onClick={insertMeasureAfterActive}>Insert measure</button>
              <button className="btn" onClick={duplicateActiveMeasure}>Duplicate measure</button>
              <button className="btn btn-danger" onClick={deleteActiveMeasure}>Delete measure</button>
              <div className="popover-divider" />
              <span className="popover-title">MIDI keyboard</span>
              <button
                className={`btn ${midiInput ? 'btn-active' : ''}`}
                onClick={() => setMidiInput(prev => !prev)}
                disabled={!midiSupported()}
              >
                {midiInput ? 'MIDI input on' : 'MIDI input off'}
              </button>
              <span className="popover-hint">{midiStatus}</span>
            </div>
            )}
          </div>
          )}

          <div className="cmd-divider" />

          <div className="bottom-menu">
            <button
              className={`bottom-menu-trigger ${openBottomMenu === 'view' ? 'active' : ''}`}
              onClick={() => setOpenBottomMenu(prev => prev === 'view' ? null : 'view')}
              title="View options"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              View
            </button>
            {openBottomMenu === 'view' && (
              <div className="bottom-popover">
                <span className="popover-title">Staff — {part.name}</span>
                <div className="control-group">
                  {STAFF_DISPLAYS[trackKind(activeTrack.instrument)].map(mode => (
                    <button
                      key={mode}
                      className={`btn ${activeTrack.display === mode && !grand ? 'btn-active' : ''}`}
                      onClick={() => {
                        setGrandStaff(false);
                        updateActiveTrack({ display: mode });
                      }}
                      style={{ flex: 1 }}
                    >
                      {STAFF_LABELS[mode]}
                    </button>
                  ))}
                  {!isFrettedTrack && (
                    <button
                      className={`btn ${grand ? 'btn-active' : ''}`}
                      onClick={() => setGrandStaff(true)}
                      title="Treble and bass clef, one track per hand: the notes below middle C move to a new left-hand track with its own rhythm"
                      style={{ flex: 1 }}
                    >
                      Grand staff
                    </button>
                  )}
                </div>
                <div className="popover-divider" />
                <button
                  className={`btn ${showFretboard ? 'btn-active' : ''}`}
                  onClick={() => setShowFretboard(prev => !prev)}
                >
                  {showTab ? 'Fretboard' : 'Keyboard'}
                </button>
                {role === 'viewer' ? (
                  <button className="btn btn-active" disabled>
                    View only
                  </button>
                ) : (
                  <button
                    className={`btn ${viewMode ? 'btn-active' : ''}`}
                    onClick={() => {
                      setViewMode(prev => {
                        if (!prev) {
                          setShowNoteOptions(false);
                          setOpenBottomMenu(null);
                        }
                        return !prev;
                      });
                    }}
                  >
                    {viewMode ? 'Read-only on' : 'Read-only off'}
                  </button>
                )}
                <div className="popover-divider" />
                <button className="btn" onClick={() => {
                  setOpenBottomMenu(null);
                  setShowShortcuts(true);
                }}>
                  Keyboard shortcuts
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showShortcuts && (
        <div className="shortcut-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcut-panel" onClick={(e) => e.stopPropagation()}>
            <div className="shortcut-panel-header">
              <strong>Keyboard</strong>
              <button className="btn" onClick={() => setShowShortcuts(false)}>Close</button>
            </div>
            <div className="shortcut-button-grid">
              <span><kbd>←</kbd><kbd>→</kbd> Beat</span>
              <span><kbd>↑</kbd><kbd>↓</kbd> String</span>
              <span><kbd>Shift</kbd><kbd>↑</kbd><kbd>↓</kbd> Pitch ±semitone</span>
              <span><kbd>Shift</kbd><kbd>Ctrl</kbd><kbd>↑</kbd><kbd>↓</kbd> Pitch ±octave</span>
              <span><kbd>0</kbd>-<kbd>9</kbd> Fret</span>
              <span><kbd>Delete</kbd> Remove</span>
              <span><kbd>Ctrl</kbd><kbd>Delete</kbd> Delete bar</span>
              <span><kbd>Space</kbd> Play</span>
              <span><kbd>R</kbd> Rest</span>
              <span><kbd>+</kbd><kbd>-</kbd> Duration</span>
              <span><kbd>Shift</kbd><kbd>←</kbd><kbd>→</kbd> Select beats</span>
              <span><kbd>Ctrl</kbd><kbd>C</kbd><kbd>X</kbd><kbd>V</kbd> Copy, cut, paste</span>
              <span><kbd>Ctrl</kbd><kbd>Z</kbd> Undo</span>
              <span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Z</kbd> Redo</span>
              <span className="shortcut-divider">Note techniques</span>
              <span><kbd>H</kbd> Slur</span>
              <span><kbd>S</kbd> Legato slide</span>
              <span><kbd>V</kbd> Vibrato</span>
              <span><kbd>B</kbd> Bend</span>
              <span><kbd>M</kbd> Palm mute</span>
              <span><kbd>L</kbd> Let ring</span>
              <span><kbd>O</kbd> Harmonic</span>
              <span><kbd>G</kbd> Ghost note</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Import/Export */}
      {modalOpen && (
        <div className="sheetor-modal-backdrop" onClick={() => setModalOpen(null)}>
          <div className="sheetor-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sheetor-modal-header">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                  {modalOpen === 'export' ? (
                    <>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </>
                  ) : (
                    <>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </>
                  )}
                </svg>
                {modalOpen === 'export' ? 'Export song' : 'Import song'}
              </span>
              <button className="sheetor-modal-close" onClick={() => setModalOpen(null)}>&times;</button>
            </h3>
            
            <p className="sheetor-modal-desc">
              {modalOpen === 'export'
                ? 'Copy this JSON to share your song, or download it as a file.'
                : 'Paste song JSON here, then import it. This replaces the song you have open.'}
            </p>

            <textarea
              className="sheetor-modal-textarea"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              readOnly={modalOpen === 'export'}
              placeholder='{ "title": "My Song", ... }'
            />

            {modalStatus && (
              <div className="sheetor-modal-status">{modalStatus}</div>
            )}

            <div className="sheetor-modal-footer">
              {modalOpen === 'export' ? (
                <>
                  <button className="btn" onClick={copyToClipboard}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy JSON
                  </button>
                  <button className="btn btn-primary" onClick={downloadJsonFile}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download file
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={executeImport}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Import song
                </button>
              )}
              <button className="btn" onClick={() => setModalOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TabSheetEditor;
