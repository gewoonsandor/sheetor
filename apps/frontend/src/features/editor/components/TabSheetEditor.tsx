import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import './TabSheetEditor.css';

import type {
  BeatPosition, Clef, Duration, FrettedNote, InstrumentId, NoteTechniques,
  Staff, TabNote, TabBeat, TabMeasure, TabSong, TabTrack, BeamGroup, MLayout,
} from './types';
import {
  barTicks,
  beatTicks,
  nextTuplet,
  tupletGroups,
  computeBeamGroups,
  createTrack,
  isFretted,
  isFrettedNote,
  midiToNoteName,
  midiToNoteOctave,
  normalizeTrackLengths,
  MAX_BPM,
  MIN_BPM,
  resolveNoteMidi,
  retuneTrack,
  trackKind,
  tuningPresets,
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
  conductorChanges,
  sameTimeSignature,
  beatRuns,
  BEND_LABELS,
  withNextBend,
  withNextSlideIn,
  withNextSlideOut,
  previousNoteOnString,
  techniqueBlocked,
} from './songUtils';
import type { CursorIds, CursorIndices } from './songUtils';
import { getClip, setClip } from '../clipboard';
import { midiSupported, useMidiInput } from '../midiInput';
import { TrackStrip } from './TrackStrip';
import { CommandBar } from './CommandBar';
import type { MenuId } from './CommandBar';
import { NoteToolbar } from './NoteToolbar';
import { KeyboardPanel } from './KeyboardPanel';
import type { Hand } from './KeyboardPanel';
import { FretboardPanel } from './FretboardPanel';
import { TrackSettings } from './TrackSettings';
import { ShortcutsDialog } from './ShortcutsDialog';
import { JsonDialog } from './JsonDialog';
import { TECHNIQUE_SHORTCUTS, typeFretDigit } from '../shortcuts';
import type { FretEntry, TechniqueId } from '../shortcuts';
import { parseSong } from './songSchema';
import { canEdit } from '../../library/libraryStore';
import type { LibraryEntry } from '../../library/libraryStore';
import { createSong } from '../../library/libraryApi';
import type { SongChannel } from '../songChannel';
import { deriveInitials, getUserSnapshot, subscribeUser } from '../../user/userStore';
import { saveAppearance } from '../../user/authApi';
import { loadSettings, updateSettings } from '../../settings/settingsStore';
import { usePlayback } from './usePlayback';
import {
  computeRowHeight,
  computeMeasureLayouts,
  checkMeasureBeats,
  isWhiteKey,
  computeKeyboardRange,
  FRET_COUNT as fretCount,
  MAX_ROW_WIDTH,
  SCORE_GUTTER,
  scoreRowWidth,
  STEM_TOP_PAD,
  getTabStaffTop,
  TAB_STAFF_HEIGHT_PX,
  TAB_FRET_FONT_SIZE,
  REPEAT_PADDING,
  GRAND_BASS_TOP,
  alignBars,
  CLEF_CHANGE_ROOM,
  vibratoPath,
  vibratoHeight,
  marksTop,
  runHeight,
  TAB_MARK_ROOM,
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
  /** The glyph's box with 3 units to spare on every side: a click anywhere in it edits the clef. */
  hit: { x: number; y: number; width: number; height: number };
}

const CLEFS: Record<Clef, ClefShape> = {
  treble: { path: TREBLE_CLEF_PATH, fillRule: 'evenodd', shift: 0, keyOffset: 0, line: 40, hit: { x: 11, y: -5.5, width: 30, height: 74 } },
  bass: { path: BASS_CLEF_PATH, fillRule: 'nonzero', shift: 12, keyOffset: -2, line: 20, hit: { x: 9, y: 7, width: 34, height: 44 } },
};

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

/** Techniques marked over the TAB per run, on one shared line (a beat holds only one): the label, and where its dashes start. */
const RUN_MARKS = [
  { technique: 'palmMute', label: 'P.M.', dashFrom: 7 },
  { technique: 'letRing', label: 'let ring', dashFrom: 17 },
] as const;

/** A fret number as the TAB prints it: x for a dead note, <n> for a harmonic. */
const fretLabel = (note: FrettedNote): string => (note.ghostNote ? 'x' : note.harmonic ? `<${note.fret}>` : `${note.fret}`);

/** Width of the knockout behind a fret label. */
const fretLabelWidth = (label: string): number => Math.max(10, label.length * 6 + 4);

/** Techniques with more than on and off: their key steps the cursor note through every kind. */
const CYCLES: Partial<Record<keyof NoteTechniques, (note: TabNote) => TabNote>> = {
  bend: withNextBend,
  legatoSlide: withNextSlideIn,
  slideIn: withNextSlideIn,
  slideOut: withNextSlideOut,
};

// How far the notation cursor goes past the staff: three ledger lines either way.
const NOTE_CURSOR_LOW = -5;
const NOTE_CURSOR_HIGH = 17;

// Keyboard span for pitched tracks, which have no tuning to derive one from.
const PITCHED_KEYBOARD_LOW = 36;  // C2
const PITCHED_KEYBOARD_HIGH = 84; // C6

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
  /** The notation cursor's line or space on a pitched track, in treble steps (2 = bottom line, 10 = top line). */
  const [cursorStep, setCursorStep] = useState<number>(6);
  // Which bar's tempo mark is open for editing in the score, if any. The
  // transport field keeps its own draft, so the two never fight over one value.
  const [bpmEditIndex, setBpmEditIndex] = useState<number | null>(null);
  // While a tempo box is being typed in, the draft wins; null shows the song.
  const [bpmDraft, setBpmDraft] = useState<string | null>(null);
  // The far end of a Shift-selection, by id so a collaborator's edit cannot move it.
  const [anchor, setAnchor] = useState<{ measureId: string; beatId: string } | null>(null);
  const user = useSyncExternalStore(subscribeUser, getUserSnapshot);

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
  /** The pitch under the notation cursor, as a click there would write it. */
  const cursorMidi = staffStepToSoundingMidi(
    cursorStep - clefAt(activeStaff, activeMeasureIndex).shift, activeTrack.transpose, keyOf(activeStaff),
  );

  const [durationSelect, setDurationSelect] = useState<Duration>('4');
  const [dotSelect, setDotSelect] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(settings.masterVolume);
  const [viewMode, setViewMode] = useState<boolean>(settings.readOnly);
  const [showFretboard, setShowFretboard] = useState<boolean>(settings.showToolPanel);
  const [midiInput, setMidiInput] = useState<boolean>(settings.midiInput);
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const toggleMenu = (id: MenuId) => setOpenMenu(prev => (prev === id ? null : id));
  /** A grand staff waiting on "delete the left hand?": the instrument the part becomes. */
  const [leavingGrand, setLeavingGrand] = useState<InstrumentId | null>(null);

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(settings.playbackSpeed);
  const [loopPlayback, setLoopPlayback] = useState<boolean>(settings.loopPlayback);

  // Import/Export Modal state
  const [modalOpen, setModalOpen] = useState<'import' | 'export' | null>(null);
  const [jsonText, setJsonText] = useState<string>('');
  const [modalStatus, setModalStatus] = useState<string>('');

  /** The fret being typed; any other key or a cursor move ends it. */
  const fretEntryRef = useRef<FretEntry | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // The score reflows to its card: a narrow screen breaks rows narrower instead of scrolling.
  const [canvasWidth, setCanvasWidth] = useState<number>(MAX_ROW_WIDTH + SCORE_GUTTER);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => setCanvasWidth(entry.contentRect.width));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

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
    setOpenMenu('track');
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
    setOpenMenu(null);
  };

  /**
   * Leaves a grand staff for one staff, the part becoming `instrument`. The left hand is deleted
   * rather than living on as a track of its own; when it holds notes, Track settings asks first
   * unless `confirmed`.
   */
  const leaveGrandStaff = (instrument: InstrumentId, confirmed = false) => {
    if (!grand) return;
    const leftNotes = song.tracks[grand.bass].measures.some(m => m.beats.some(b => b.notes.length > 0));
    if (leftNotes && !confirmed) {
      setLeavingGrand(instrument);
      return;
    }
    setLeavingGrand(null);
    editSong(prev => ({
      ...prev,
      tracks: prev.tracks.flatMap((t, i) => {
        if (i === grand.bass) return [];
        if (i !== grand.treble) return [t];
        const single = { ...t, ...(instrument === t.instrument ? {} : retuneTrack(t, instrument)) };
        delete single.bassTrack;
        return [single];
      }),
    }));
    switchHand('right');
    setActiveTrackIndex(grand.treble - (grand.bass < grand.treble ? 1 : 0));
  };

  /** The warning `leaveGrandStaff` raises, in Track settings. */
  const leftHandWarning = grand && leavingGrand && (
    <>
      <span className="popover-hint">One staff: the left hand and its notes will be deleted.</span>
      <div className="control-group">
        <button className="btn btn-danger" onClick={() => leaveGrandStaff(leavingGrand, true)}>
          Delete left hand
        </button>
        <button className="btn" onClick={() => setLeavingGrand(null)}>Cancel</button>
      </div>
    </>
  );

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
   * Bar 1 sets the song tempo; a later bar stores an override, or drops it when it restates the
   * tempo already in force. The score tempo marks edit an arbitrary bar, so the index is a
   * parameter rather than the cursor - clicking bar 9 must never retune whichever bar is selected.
   */
  const setMeasureBpm = (index: number, bpm: number) => {
    const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
    if (index === 0) editSong(prev => ({ ...prev, bpm: clamped }));
    const restates = index === 0 || getEffectiveBpm(song, index - 1) === clamped;
    setConductorMeasure(index, measure => {
      const next = { ...measure };
      if (restates) delete next.bpm;
      else next.bpm = clamped;
      return next;
    });
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

  /** The metre from the cursor's bar on, by the same rule as `setMeasureBpm`. */
  const setActiveMeasureTimeSignature = (field: 'numerator' | 'denominator', value: number) => {
    const index = activeMeasureIndex;
    const timeSignature = { ...getEffectiveTimeSignature(song, index), [field]: value };
    if (index === 0) editSong(prev => ({ ...prev, timeSignature }));
    const restates = index === 0 || sameTimeSignature(getEffectiveTimeSignature(song, index - 1), timeSignature);
    setConductorMeasure(index, measure => {
      const next = { ...measure };
      if (restates) delete next.timeSignature;
      else next.timeSignature = timeSignature;
      return next;
    });
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
   * Which note the cursor is on: the one on its string on a fretted track, the
   * one on its line or space on a pitched one.
   */
  const cursorNoteIndex = (notes: TabNote[]): number => (isFrettedTrack
    ? notes.findIndex(n => isFrettedNote(n) && n.stringIndex === activeStringIndex)
    : notes.findIndex(n => staffStep(noteMidi(n), activeStaff, activeMeasureIndex) === cursorStep));

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
      setCursorStep(staffStep(targetMidi, activeStaff, activeMeasureIndex));
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

  /** Turns a technique on or off on the cursor note; bends and slides step through their kinds instead. One that conflicts with a set technique stays off. */
  const toggleNoteTechnique = (technique: keyof NoteTechniques) => {
    updateActiveBeatNotes(currentNotes => {
      const idx = cursorNoteIndex(currentNotes);
      if (idx === -1 || techniqueBlocked(currentNotes, currentNotes[idx], technique)) return currentNotes;
      const cycle = CYCLES[technique];
      return currentNotes.map((n, i) => (i !== idx ? n : cycle ? cycle(n) : { ...n, [technique]: !n[technique] }));
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

  /** T steps the cursor beat through a triplet and a sextuplet to neither. */
  const cycleTupletForActiveBeat = () => {
    updateActiveBeat(b => {
      const { tuplet, ...rest } = b;
      const next = nextTuplet(tuplet);
      return next ? { ...rest, tuplet: next } : rest;
    });
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
    setOpenMenu(null);
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

  /** A clef or metre in the score opens the Measure menu on its bar, where both are set. */
  const barMarkProps = (measureIndex: number) => (readOnly ? {} : {
    className: 'bar-mark',
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      moveCursorTo(measureIndex, 0, false);
      setOpenMenu('measure');
    },
  });

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
    const clip = getClip();
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
    const filled = measure.beats.reduce((acc, b) => acc + beatTicks(b), 0);
    // A beat appended after this one keeps its length and its tuplet, so triplets type on.
    const carried = beat?.tuplet ? { tuplet: beat.tuplet } : {};

    if (activeBeatIndex < measure.beats.length - 1) {
      setActiveBeatIndex(prev => prev + 1);
    } else if (filled < barTicks(getEffectiveTimeSignature(song, activeMeasureIndex))) {
      // Bar is not filled yet, create a new beat with same length
      const newBeat: TabBeat = {
        id: createId(),
        duration: beat ? beat.duration : durationSelect,
        ...carried,
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
          ...carried,
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
    // Fields, menus and dialogs keep their keys; a focused button keeps Space and Enter.
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if (target.closest('.popover, dialog')) return;
    if (target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    // Any key but a digit ends the fret being typed: 1, Delete, 2 is fret 2, not 12.
    if (!/^[0-9]$/.test(e.key)) fretEntryRef.current = null;

    if (e.key === '?') {
      e.preventDefault();
      setShowShortcuts(true);
      return;
    }

    const key = e.key.toLowerCase();
    // A read-only song still plays, moves and copies.
    if (readOnly) {
      const browsing = ['ArrowLeft', 'ArrowRight', ' ', 'Escape'].includes(e.key)
        || ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey)
        || ((e.ctrlKey || e.metaKey) && key === 'c');
      if (!browsing) return;
    }

    const measure = measures[activeMeasureIndex];
    if (!measure) return;
    const beat = measure.beats[activeBeatIndex];

    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.shiftKey && key === 'b') {
        e.preventDefault();
        if (getCursorNote()?.bend) toggleNoteTechnique('bendRelease');
        return;
      }
      if (e.shiftKey && key === 's') {
        e.preventDefault();
        toggleNoteTechnique('slideOut');
        return;
      }
      const technique = Object.entries(TECHNIQUE_SHORTCUTS).find(([, k]) => k.toLowerCase() === key);
      if (technique) {
        e.preventDefault();
        toggleNoteTechnique(technique[0] as TechniqueId);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'v', 'z', 'y'].includes(key)) {
      e.preventDefault();
      if (key === 'c') copySelection();
      else if (key === 'x') cutSelection();
      else if (key === 'v') pasteClipboard();
      else if (key === 'z' && !e.shiftKey) channel.undo();
      else channel.redo();
      return;
    }

    /** What Delete and D do: the selection, else a rest beat, else the cursor note. */
    const deleteAtCursor = () => {
      if (hasSelection) deleteSelection();
      else if (beat?.isRest) deleteActiveBeat();
      else removeCursorNote();
    };

    switch (e.key) {
      // Arrow navigation — with Shift held, the arrows retune the selected note
      // instead of moving the cursor (Shift+Ctrl/Cmd for whole octaves).
      case 'ArrowUp':
        e.preventDefault();
        if (e.shiftKey) {
          transposeActiveNote(e.ctrlKey || e.metaKey ? 12 : 1);
        } else {
          if (isFrettedTrack) setActiveStringIndex(prev => Math.max(0, prev - 1));
          else setCursorStep(prev => Math.min(NOTE_CURSOR_HIGH, prev + 1));
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (e.shiftKey) {
          transposeActiveNote(e.ctrlKey || e.metaKey ? -12 : -1);
        } else {
          if (isFrettedTrack) setActiveStringIndex(prev => Math.min(stringCount - 1, prev + 1));
          else setCursorStep(prev => Math.max(NOTE_CURSOR_LOW, prev - 1));
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
        if (e.shiftKey || readOnly) {
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

      // Enter writes the pitch under the circle on a pitched staff, as a click there would.
      case 'Enter':
        if (isFrettedTrack) break;
        e.preventDefault();
        setPitchForActiveNote(cursorMidi);
        break;

      // Delete, Backspace and D remove a note, or delete the beat if it's a rest;
      // Shift deletes the beat, Ctrl the bar, and Ctrl+D stays the browser's bookmark key.
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) deleteActiveMeasure();
        else if (e.shiftKey) deleteActiveBeat();
        else deleteAtCursor();
        break;

      // I inserts a beat after the cursor, Shift+I a bar.
      case 'i':
      case 'I':
        if (e.ctrlKey || e.metaKey) break;
        e.preventDefault();
        if (e.shiftKey) insertMeasureAfterActive();
        else insertBeatAfterActive();
        break;

      case 'd':
      case 'D':
        if (e.ctrlKey || e.metaKey) break;
        e.preventDefault();
        deleteAtCursor();
        break;

      // Rest hotkey
      case 'r':
      case 'R':
        e.preventDefault();
        toggleActiveBeatRest();
        break;

      // Dot hotkey to toggle dotted note
      case '.':
        e.preventDefault();
        toggleDotForActiveBeat();
        break;

      case 't':
        e.preventDefault();
        cycleTupletForActiveBeat();
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
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          const entry = typeFretDigit(fretEntryRef.current, e.key, `${activeMeasureIndex}:${activeBeatIndex}:${activeStringIndex}`, e.timeStamp);
          fretEntryRef.current = entry;
          setFretForActiveNote(activeStringIndex, Number(entry.digits));
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
    // Never scroll for it: focusing the tall editor scrolls its top, the song title and
    // artist, under the sticky header in Chromium, where a click lands on the header's
    // links instead. Scrolling is the keep-in-view effect's alone.
    el.focus({ preventScroll: true });
  }, [activeBeatIndex, activeMeasureIndex, playback.isPlaying]);

  useEffect(() => {
    if (!openMenu) return;
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [openMenu]);

  // --- SVG MEASUREMENT & LAYOUT CALCULATION ---

  const ROW_HEIGHT = computeRowHeight(stringCount, showTab, showNotation, grandStaff);
  const tabTop = getTabStaffTop(showNotation);

  // Tempo, metre and repeat marks are song-wide, so they are read off the conductor; a tempo
  // or metre that restates the one before is no change and is not marked.
  const conductorMeasures = conductorChanges(song);
  // Bars drawn one above another share their spacing, so a grand staff's hands line up in time.
  const aligned = measures.map((_, mIdx) => alignBars(staves.map(staff => barOf(staff, mIdx))));
  // Every row opens with the key signature after the clef; the widest staff's sets the room.
  const keyAccidentals = showNotation ? Math.max(...staves.map(staff => Math.abs(keyOf(staff)))) : 0;
  const keyRoom = keyAccidentals === 0 ? 0 : keyAccidentals * KEY_SPACING + 4;
  // A staff that changes clef partway through a row writes the new clef, smaller, where it changes.
  const clefChanges = measures.map((_, mIdx) =>
    showNotation && mIdx > 0 && staves.some(staff => staff.clefs[mIdx] !== staff.clefs[mIdx - 1]));
  const rowWidth = scoreRowWidth(canvasWidth);
  const measureLayouts: MLayout[] = computeMeasureLayouts(
    aligned.map(a => a.minWidth), conductorMeasures, keyRoom, clefChanges, rowWidth,
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

  // Palm mute and let ring runs, split per row, each line just clear of the highest mark under
  // it. The beat before in the same bar counts too: its vibrato and bend label reach under the
  // run's label. Nothing reaches across a bar line, whose padding keeps them apart.
  const rowOf = (at: BeatPosition): number | undefined => measureLayouts[at.measureIndex]?.row;
  const notesAt = (at: BeatPosition): TabNote[] => measures[at.measureIndex]?.beats[at.beatIndex]?.notes ?? [];
  const runPieces = !showTab ? [] : RUN_MARKS.flatMap(({ technique, label, dashFrom }) =>
    beatRuns(measures, b => !b.isRest && b.notes.some(n => n[technique])).flatMap(run => {
      const pieces: BeatPosition[][] = [];
      for (const at of run) {
        const piece = pieces[pieces.length - 1];
        if (piece && rowOf(piece[0]) === rowOf(at)) piece.push(at);
        else pieces.push([at]);
      }
      return pieces.map((piece, i) => {
        const { measureIndex, beatIndex } = piece[0];
        const under = beatIndex > 0 ? [{ measureIndex, beatIndex: beatIndex - 1 }, ...piece] : piece;
        return {
          technique, label, dashFrom, piece,
          line: run.length > 1,
          // A run that goes on to the next row runs to this row's end, with no closing bar.
          closes: i === pieces.length - 1,
          height: runHeight(Math.max(...under.map(at => marksTop(notesAt(at))))),
        };
      });
    }));

  // Marks reaching above the room every row leaves push that row's TAB down by the difference.
  if (showTab) {
    const tops: number[] = [];
    const reach = (row: number | undefined, top: number) => {
      if (row !== undefined) tops[row] = Math.max(tops[row] ?? 0, top);
    };
    measures.forEach((measure, i) => measure.beats.forEach(b => reach(measureLayouts[i]?.row, marksTop(b.notes))));
    runPieces.forEach(p => reach(rowOf(p.piece[0]), p.height + 7));
    tops.forEach((top, r) => { rowExtra[r] = (rowExtra[r] || 0) + Math.max(0, Math.ceil(top - TAB_MARK_ROOM)); });
  }

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

  // Bar number, tempo and repeat count share one baseline per row, just above the
  // highest ink of its top staff: noteheads with their accidentals and ledger lines,
  // up stems and beams, and the vibrato, bend or tuplet number over them. The row's
  // headroom grows to fit that line, so nothing reaches into the row above.
  const rowLabelY: number[] = [];
  const rowHighExtra: number[] = [];
  measures.forEach((_, mIdx) => {
    const r = measureLayouts[mIdx]?.row ?? 0;
    let inkTop = 0;
    if (showNotation) {
      // Only the top staff can climb into the row above.
      const top = staves[0];
      const bar = barOf(top, mIdx);
      const beamGroups = computeBeamGroups(bar.beats, getEffectiveTimeSignature(song, mIdx));
      bar.beats.forEach((beat, bIdx) => {
        if (beat.isRest || beat.notes.length === 0) return;
        const steps = beat.notes.map(n => staffStep(noteMidi(n, top), top, mIdx));
        const headTop = Y_of_step(Math.max(...steps));
        const group = beamGroups.find(g => g.startIdx <= bIdx && bIdx <= g.endIdx);
        const stemUp = group ? getBeamStemUp(mIdx, group, top) : steps.reduce((a, s) => a + s, 0) / steps.length < 6;
        const stemTop = !stemUp || beat.duration === '1' ? headTop : group ? getBeamY(mIdx, group, true, top, 0) - 2 : headTop - 30;
        const marked = beat.tuplet !== undefined || beat.notes.some(n => n.vibrato || n.bend);
        inkTop = Math.min(inkTop, headTop - 9, stemTop - (marked ? 12 : 0));
      });
    }
    const labelY = Math.min(rowLabelY[r] ?? -6, inkTop - 4);
    rowLabelY[r] = labelY;
    // The tempo box that replaces a mark reaches 13 units above the baseline,
    // past the label's cap height; one more keeps its border inside the score.
    rowHighExtra[r] = Math.max(0, 14 - labelY - STEM_TOP_PAD);
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

  const getLabelY = (index: number): number =>
    getRowY(index) + (rowLabelY[measureLayouts[index]?.row ?? 0] ?? -6);

  /* The last row needs no headroom for a row that never follows it. */
  const totalSVGHeight = cumY + 10 - STEM_TOP_PAD;
  // A single bar wider than the row scales the score down rather than being cut off.
  const contentWidth = Math.max(rowWidth, ...measureLayouts.map(l => l.x + l.width));

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

  /** Where a beat of a staff's bar sits: on the onsets every staff of the row shares. */
  const getBeatCoordinates = (mIdx: number, bIdx: number, staff: Staff = activeStaff): number => {
    const padding = getMeasurePadding(mIdx);
    const usableWidth = getMeasureWidth(mIdx) - padding - 20;
    const at = aligned[mIdx]?.positions[staves.indexOf(staff)]?.[bIdx] ?? 0;
    return getMeasureX(mIdx) + padding + at * usableWidth;
  };

  /** Where a vibrato starting at a beat ends: just before the bar's next beat, or at the bar line. */
  const vibratoEnd = (mIdx: number, bIdx: number, staff: Staff): number =>
    (bIdx + 1 < barOf(staff, mIdx).beats.length
      ? getBeatCoordinates(mIdx, bIdx + 1, staff)
      : getMeasureX(mIdx) + getMeasureWidth(mIdx)) - 4;

  /** A staff's key signature in its clef at bar `mIdx`, the first accidental at `x` from the row's origin. */
  const keySignatureGlyphs = (staff: Staff, mIdx: number, x: number): React.ReactNode[] =>
    keySignatureSteps(keyOf(staff)).map((step, i) => (
      <React.Fragment key={`key-${staff.top}-${i}`}>
        {accidentalGlyph(Math.sign(keyOf(staff)), x + i * KEY_SPACING, staff.top + Y_of_step(step + clefAt(staff, mIdx).keyOffset))}
      </React.Fragment>
    ));

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
    // Headroom below the note toolbar (or the app header) keeps the bar number and tempo mark in sight.
    const toolbar = root.querySelector('.note-toolbar');
    const top = (toolbar?.getBoundingClientRect().bottom
      ?? parseFloat(getComputedStyle(root).getPropertyValue('--header-h'))) + 40;
    const bottom = cover.getBoundingClientRect().top - 16;
    const behavior: ScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (box.top < top || (playback.isPlaying && box.bottom > bottom)) {
      window.scrollBy({ top: box.top - top, behavior });
    } else if (box.bottom > bottom) {
      window.scrollBy({ top: box.bottom - bottom, behavior });
    }
  }, [activeMeasureIndex, activeBeatIndex, activeTrackIndex, playback.playbackBeat, playback.isPlaying, showFretboard, showTab, showNotation, grandStaff]);

  // A click on the staff writes the pitch under the pointer into the beat that was
  // clicked, on that staff's track: a click on a grand staff's other hand switches
  // to it. The cursor moves there too, but only on the next render, so the write
  // names the beat and the track itself.
  const handleStandardStaffClick = (at: BeatPosition, clickY: number, staff: Staff) => {
    const track = song.tracks[staff.track];
    const shown = Math.round((60 - clickY) / 5);
    const step = shown - clefAt(staff, at.measureIndex).shift;
    const clicked = staffStepToSoundingMidi(step, track.transpose, keyOf(staff));
    setActiveTrackIndex(staff.track);
    moveCursorTo(at.measureIndex, at.beatIndex, false);
    if (!isFretted(track)) {
      setCursorStep(shown);
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

  const isCursorNote = (mIdx: number, bIdx: number, noteIndex: number, notes: TabNote[], track: number = activeTrackIndex): boolean =>
    track === activeTrackIndex && activeMeasureIndex === mIdx && activeBeatIndex === bIdx && cursorNoteIndex(notes) === noteIndex;

  /** Clicking a note of a grand staff's other hand switches to it; a selection never spans hands. */
  const selectNote = (mIdx: number, bIdx: number, noteIndex: number, notes: TabNote[], extend: boolean, track: number = activeTrackIndex) => {
    const note = notes[noteIndex];
    const extending = extend && track === activeTrackIndex;
    setActiveTrackIndex(track);
    moveCursorTo(mIdx, bIdx, extending);
    if (note && isFrettedNote(note)) setActiveStringIndex(note.stringIndex);
    else if (note) {
      const staff = staves.find(s => s.track === track) ?? activeStaff;
      setCursorStep(staffStep(noteMidi(note, staff), staff, mIdx));
    }
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

  // Where the cursor is, for the command bar's status line.
  const cursorText = activeBeat?.isRest
    ? 'Rest'
    : !activeNote
      ? (isFrettedTrack ? 'Empty' : `${midiToNoteOctave(cursorMidi)} (empty)`)
      : showTab && isFrettedNote(activeNote)
        ? `Fret ${activeNote.fret}`
        : midiToNoteOctave(resolveNoteMidi(activeNote, activeTrack) ?? 0);
  const notesText = activeBeat?.isRest || selectedNotes.length === 0
    ? '—'
    : selectedNotes
        .map(n => (resolveNoteMidi(n, activeTrack) ?? NaN))
        .sort((a, b) => a - b)
        .map(midiToNoteOctave)
        .join(' ');
  const status = [
    `Bar ${activeMeasureIndex + 1}/${measures.length}`,
    `Beat ${activeBeatIndex + 1}/${measures[activeMeasureIndex]?.beats.length ?? 0}`,
    showTab ? `String ${activeStringIndex + 1} (${midiToNoteName(tuning[activeStringIndex] ?? 0)})` : `Notes ${notesText}`,
    cursorText,
    `${activeMeasureTimeSignature.numerator}/${activeMeasureTimeSignature.denominator}`,
  ].join(' · ');

  /** Changes the part's instrument; a fretted one leaves a grand staff, after asking. */
  const changeInstrument = (instrument: InstrumentId) => {
    if (grand && trackKind(instrument) === 'fretted') {
      leaveGrandStaff(instrument);
      return;
    }
    // The instrument decides whether this is a TAB staff, so switching it can add or
    // remove strings and rewrites the notes through their sounding pitch.
    updatePart(activeTrackIndex, track => retuneTrack(track, instrument));
    const slots = retuneTrack(activeTrack, instrument).tuning?.length ?? 1;
    setActiveStringIndex(prev => Math.min(prev, Math.max(slots, 1) - 1));
  };

  const toggleViewMode = () => {
    if (!viewMode) setOpenMenu(null);
    setViewMode(!viewMode);
  };

  return (
    <div
      className="sheetor-container"
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label={`Score editor: ${song.title || 'Untitled'}`}
      aria-describedby="sheetor-status"
      onKeyDown={handleKeyDown}
    >
      <div className="song-bar">
        <div
          className="song-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') containerRef.current?.focus({ preventScroll: true });
          }}
        >
          <input
            className="song-title-input"
            aria-label="Song title"
            value={song.title}
            disabled={readOnly}
            onChange={(e) => editSong({ ...song, title: e.target.value })}
            placeholder="Song title"
          />
          <input
            className="song-artist-input"
            aria-label="Artist"
            value={song.artist}
            disabled={readOnly}
            onChange={(e) => editSong({ ...song, artist: e.target.value })}
            placeholder="Artist"
          />
        </div>

        <div className="presence">
          <span className={`presence-status is-${live.status}`} role="status">
            {live.status === 'live' ? 'Live' : live.status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
            {role === 'viewer' && ' · view only'}
          </span>
          {live.peers.map((peer) => (
            <span
              key={peer.connectionId}
              role="img"
              className={`presence-chip peer-${peer.userId % 6}`}
              title={`${peer.name} · ${peer.role}`}
              aria-label={`${peer.name} · ${peer.role}`}
            >
              {deriveInitials(peer.name)}
            </span>
          ))}
        </div>

        {notice !== null && (
          <p className="form-error" role="alert">
            {notice}
          </p>
        )}
      </div>

      {/* Track strip — picks which track the score and input panel edit */}
      <TrackStrip
        tracks={song.tracks}
        activeTrackIndex={activeTrackIndex}
        onSelect={selectTrack}
        onToggleMute={(i) => updatePart(i, () => ({ muted: !song.tracks[i].muted }))}
        onToggleSolo={(i) => updatePart(i, () => ({ soloed: !song.tracks[i].soloed }))}
        onAddTrack={addTrack}
        onOpenSettings={() => toggleMenu('track')}
        settingsOpen={openMenu === 'track'}
      >
        <TrackSettings
          part={part}
          activeTrack={activeTrack}
          renamePart={(name) => updateTrack(hands[0], { name })}
          changeInstrument={changeInstrument}
          // A grand staff's hands share their key; C major is stored as no key at all.
          setPartKey={(key) => updatePart(activeTrackIndex, () => ({ keySignature: key === 0 ? undefined : key }))}
          setPartVolume={(trackVolume) => updatePart(activeTrackIndex, () => ({ volume: trackVolume }))}
          leftHandWarning={leftHandWarning}
          grandStaff={grandStaff}
          toggleGrandStaff={() => (grand
            ? leaveGrandStaff(activeTrack.instrument)
            : editSong(prev => addBassStaff(prev, activeTrackIndex)))}
          isFrettedTrack={isFrettedTrack}
          presets={presets}
          presetName={presetName}
          tuning={tuning}
          setTuning={setTuning}
          duplicateActiveTrack={duplicateActiveTrack}
          deleteActiveTrack={deleteActiveTrack}
          canDeleteTrack={song.tracks.length > hands.length}
        />
      </TrackStrip>

      {!readOnly && (
        <NoteToolbar
          duration={activeBeat?.duration ?? durationSelect}
          dotted={activeBeat ? !!activeBeat.dot : dotSelect}
          tuplet={activeBeat?.tuplet}
          onDuration={(dur) => {
            setDurationSelect(dur);
            setDurationForActiveBeat(dur);
          }}
          onToggleDot={toggleDotForActiveBeat}
          onCycleTuplet={cycleTupletForActiveBeat}
          isRest={!!activeBeat?.isRest}
          toggleActiveBeatRest={toggleActiveBeatRest}
          activeNote={activeNote}
          beatNotes={selectedNotes}
          toggleNoteTechnique={toggleNoteTechnique}
          clearBeat={() => updateActiveBeatNotes(() => [])}
          midiInput={midiInput}
          midiAvailable={midiSupported()}
          toggleMidiInput={() => setMidiInput(prev => !prev)}
          midiStatus={midiStatus}
        />
      )}

      {/* Editor Canvas */}
      <div
        ref={canvasRef}
        className="sheetor-canvas-container"
        // A light page in any theme: the light tokens apply to the score card alone.
        data-theme={user.paperScore ? 'light' : undefined}
        onClick={() => {
          // Refocus the editor on click
          containerRef.current?.focus({ preventScroll: true });
        }}
      >
        <svg
          viewBox={`-${SCORE_GUTTER} 0 ${contentWidth + SCORE_GUTTER} ${totalSVGHeight}`}
          className="music-svg"
          aria-hidden={bpmEditIndex === null ? true : undefined}
        >
          {/* Background Interactivity Catcher */}
          <rect
            x={-SCORE_GUTTER}
            width={contentWidth + SCORE_GUTTER}
            height={totalSVGHeight}
            fill="transparent" 
            className="svg-interactive-bg"
            onClick={() => containerRef.current?.focus({ preventScroll: true })}
          />

          {/* Render Staff & Measure Lines */}
          {measures.map((measure, mIdx) => {
            const measureX = getMeasureX(mIdx);
            const measureW = getMeasureWidth(mIdx);
            const measureEnd = measureX + measureW;
            const isLast = mIdx === measures.length - 1;
            const rowY = getRowY(mIdx);
            const labelY = getLabelY(mIdx);
            const ts = getRowShift(mIdx);
            const effectiveTimeSignature = getEffectiveTimeSignature(song, mIdx);
            const effectiveBpm = getEffectiveBpm(song, mIdx);
            const marks = conductorMeasures[mIdx];
            // Each mark shows where it changes something: a new tempo does not restate the metre.
            const showTempo = mIdx === 0 || marks?.bpm !== undefined;
            const showMetre = mIdx === 0 || marks?.timeSignature !== undefined;
            // A clef change partway through a row comes first, then the key, so a metre change moves right of both.
            const clefChange = clefChanges[mIdx] && measureLayouts[mIdx]?.x !== 0;
            const timeSignatureX = measureX + 12 + (clefChange ? CLEF_CHANGE_ROOM + keyRoom : 0);
            // A ‖: stands in for a plain bar line, but follows a clef or metre that opens the bar.
            const repeatStartX = measureLayouts[mIdx]?.x === 0 || showMetre || clefChange
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
                    x={measureEnd - 8}
                    y={labelY}
                    textAnchor="end"
                    className="music-text"
                    fontSize="9"
                    style={{ pointerEvents: 'none' }}
                  >
                    ×{marks?.repeatEnd}
                  </text>
                )}

                {showTempo && bpmEditIndex !== mIdx && (
                  <text
                    x={measureX + 18}
                    y={labelY}
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
                )}

                {/* Measure number */}
                <text
                  x={measureX + 4}
                  y={labelY}
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
                      {`Bar length mismatch: ${Math.round(actual * 100) / 100} quarter notes, expected ${expected}.`}
                    </title>
                  </g>
                )}

                {/* Clef, TAB, tuning labels (rendered on the first measure of every row) */}
                {(measureLayouts[mIdx]?.x === 0) && (
                  <g transform={`translate(${measureX}, ${rowY})`}>
                    {showNotation && <g {...barMarkProps(mIdx)}>{staves.map(staff => {
                      const clef = clefAt(staff, mIdx);
                      return (
                        <g key={`clef-${staff.top}`} transform={`translate(0, ${staff.top})`}>
                          <rect {...clef.hit} className="mark-hit" />
                          <path d={clef.path} fillRule={clef.fillRule} className="glyph-ink" />
                        </g>
                      );
                    })}</g>}
                    {grandStaff && <path d={GRAND_BRACE_PATH} className="glyph-ink" />}

                    {/* Key signature, on every staff of the row */}
                    {showNotation && staves.flatMap(staff => keySignatureGlyphs(staff, mIdx, KEY_X))}

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
                    {showMetre && (
                      <g {...barMarkProps(mIdx)}>
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
                    hand's too, and the key after it: smaller clefs, kept on the line each names. */}
                {clefChange && (
                  <g transform={`translate(${measureX}, ${rowY})`} pointerEvents="none">
                    <g {...barMarkProps(mIdx)} pointerEvents="visiblePainted">{staves.map(staff => {
                      const clef = clefAt(staff, mIdx);
                      return (
                        <g key={`clef-change-${staff.top}`} transform={`translate(3, ${staff.top + clef.line}) scale(0.7) translate(-12, ${-clef.line})`}>
                          <rect {...clef.hit} className="mark-hit" />
                          <path d={clef.path} fillRule={clef.fillRule} className="glyph-ink" />
                        </g>
                      );
                    })}</g>
                    {staves.flatMap(staff => keySignatureGlyphs(staff, mIdx, CLEF_CHANGE_ROOM + 6))}
                  </g>
                )}

                {/* Big Time Signature for metre changes (non-first-of-row measures) */}
                {showMetre && mIdx > 0 && measureLayouts[mIdx]?.x !== 0 && (
                  <g {...barMarkProps(mIdx)}>
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
              // Wide enough for the widest fret label, a harmonic's <12> included.
              const ringWidth = Math.max(20, ...(showTab ? b.notes.filter(isFrettedNote).map(n => fretLabelWidth(fretLabel(n)) + 4) : []));

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
                          x={beatX - ringWidth / 2 - 1}
                          y={rowY + top - 6}
                          width={ringWidth + 2}
                          height={bottom - top + 12}
                          fill="none"
                          strokeWidth="1.5"
                          rx="5"
                        />
                        <text className="peer-label" x={beatX - ringWidth / 2 - 1} y={rowY + top - 9} fontSize="8">
                          {peer.name}
                        </text>
                      </g>
                    ))}

                  {/* Selected Cursor Highlight */}
                  {!readOnly && isSelected && (
                    <g>
                      <rect
                        x={beatX - ringWidth / 2}
                        y={rowY + top - 5}
                        width={ringWidth}
                        height={bottom - top + 10}
                        className="selection-ring"
                        strokeWidth="1.5"
                        rx="4"
                        pointerEvents="none"
                      />
                      {/* Empty-string cursor in the TAB; a note there is highlighted itself */}
                      {showTab && !b.notes.some(n => isFrettedNote(n) && n.stringIndex === activeStringIndex) && (
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
                      {/* Empty-position cursor on a pitched staff; a note there is highlighted itself */}
                      {!isFrettedTrack && showNotation && cursorNoteIndex(b.notes) === -1 && (
                        <circle
                          cx={beatX}
                          cy={rowY + staff.top + Y_of_step(cursorStep)}
                          r="5"
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
                        {/* Bend: a curve from the notehead up to where the bent pitch sits, and
                            for a release back down again, always rising enough to be seen. */}
                        {n.note.bend && (() => {
                          const x0 = beatX + 6;
                          const x1 = Math.min(beatX + 20, vibratoEnd(mIdx, bIdx, staff));
                          const y0 = n.y - 2;
                          const top = Math.min(y0 - 4, staffY + Y_of_step(staffStep(n.midi + n.note.bend, staff, mIdx)));
                          return (
                            <path
                              d={n.note.bendRelease
                                ? `M ${x0} ${y0} Q ${(x0 + x1) / 2} ${2 * top - y0}, ${x1} ${y0}`
                                : `M ${x0} ${y0} Q ${x1} ${y0}, ${x1} ${top}`}
                              fill="none"
                              className="glyph-ink-stroke"
                              strokeWidth="1"
                              style={{ pointerEvents: 'none' }}
                            />
                          );
                        })()}
                      </g>
                    );
                  })}

                  {/* Vibrato: a wavy line over the beat, clear of the staff, the noteheads and an up stem. */}
                  {showNotation && beatNotes.some(n => n.vibrato) && (
                    <path
                      d={vibratoPath(beatX - 4, vibratoEnd(mIdx, bIdx, staff), Math.min(staffY + 10, hasStem && stemUp ? stemEndY : highestY - 4) - 7)}
                      fill="none"
                      className="glyph-ink-stroke"
                      strokeWidth="1"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

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

                  {/* Vibrato over the TAB, raised only over its own beat's bend. */}
                  {showTab && b.notes.some(n => n.vibrato) && (
                    <path
                      d={vibratoPath(beatX - 4, vibratoEnd(mIdx, bIdx, staff), rowY + tabTop + ts - vibratoHeight(b.notes))}
                      fill="none"
                      className="glyph-ink-stroke"
                      strokeWidth="1"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* B. TAB numbers (fret digits over strings) */}
                  {showTab && b.notes.map((rawNote, noteIndex) => {
                    if (!isFrettedNote(rawNote)) return null;
                    const n = rawNote;
                    const stringY = rowY + tabTop + ts + n.stringIndex * 10;
                    const isSelected = isCursorNote(mIdx, bIdx, noteIndex, b.notes);

                    const displayText = fretLabel(n);
                    const bgWidth = fretLabelWidth(displayText);

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
                        {/* Slides in from below or above and out down or up: a short line beside the
                            fret number, slanted the way the pitch moves, like a slide between notes. */}
                        {(n.slideIn || n.slideOut) && (() => {
                          const left = beatX - bgWidth / 2 - 1;
                          const right = beatX + bgWidth / 2 + 1;
                          const inRise = n.slideIn === 'below' ? 3 : -3;
                          const outRise = n.slideOut === 'up' ? 3 : -3;
                          return (
                            <path
                              d={[
                                n.slideIn && `M ${left - 8} ${stringY + inRise} L ${left} ${stringY - inRise}`,
                                n.slideOut && `M ${right} ${stringY + outRise} L ${right + 8} ${stringY - outRise}`,
                              ].filter(Boolean).join(' ')}
                              className="slur-line"
                              strokeWidth="1"
                              style={{ pointerEvents: 'none' }}
                            />
                          );
                        })()}
                        {/* Bend: an arrow from the fret number up above the staff, labelled with its
                            amount once per beat; a release curves back down to the fret number. */}
                        {n.bend && (() => {
                          const x0 = beatX + bgWidth / 2;
                          const ax = x0 + 6;
                          const tip = rowY + tabTop + ts - 14;
                          const labelled = b.notes.findIndex(nn => nn.bend) === noteIndex;
                          const rx = Math.min(ax + 12, vibratoEnd(mIdx, bIdx, staff) - 2);
                          const land = stringY - TAB_FRET_FONT_SIZE / 2;
                          return (
                            <g style={{ pointerEvents: 'none' }}>
                              <path d={`M ${x0} ${stringY} Q ${ax} ${stringY}, ${ax} ${tip + 4}`} fill="none" className="glyph-ink-stroke" strokeWidth="1" />
                              <path d={`M ${ax} ${tip} l 2.5 4.5 h -5 Z`} className="glyph-ink" />
                              {n.bendRelease && (
                                <>
                                  <path d={`M ${ax} ${tip} Q ${rx} ${tip}, ${rx} ${land - 4}`} fill="none" className="glyph-ink-stroke" strokeWidth="1" />
                                  <path d={`M ${rx} ${land} l -2.5 -4.5 h 5 Z`} className="glyph-ink" />
                                </>
                              )}
                              {labelled && <text x={ax} y={tip - 2} textAnchor="middle" fontSize="8" className="music-text glyph-ink">{BEND_LABELS[n.bend]}</text>}
                            </g>
                          );
                        })()}
                        {(n.slur || n.legatoSlide) && (() => {
                          const from = previousNoteOnString(song.tracks[staff.track].measures, { measureIndex: mIdx, beatIndex: bIdx }, n.stringIndex);
                          if (!from) return null;
                          const pm = from.at.measureIndex;
                          const prevX = getBeatCoordinates(pm, from.at.beatIndex, staff);
                          const prevY = getRowY(pm) + tabTop + getRowShift(pm) + n.stringIndex * 10;
                          // A pair split by a row break is drawn in two halves: out to the end of
                          // the earlier row, then in from the start of this one.
                          const split = measureLayouts[pm]?.row !== measureLayouts[mIdx]?.row;
                          const rowEnd = getMeasureX(pm) + getMeasureWidth(pm);
                          const rowStart = getBeatCoordinates(mIdx, 0, staff) - 24;
                          if (n.slur) {
                            const arc = (x1: number, y1: number, x2: number, y2: number): string => {
                              const dx = x2 - x1;
                              const cy = Math.min(y1, y2) - 12;
                              return `M ${x1} ${y1 - 3} C ${x1 + dx * 0.35} ${cy}, ${x2 - dx * 0.35} ${cy}, ${x2} ${y2 - 3}`;
                            };
                            return (
                              <path
                                d={split ? `${arc(prevX, prevY, rowEnd, prevY)} ${arc(rowStart, stringY, beatX, stringY)}` : arc(prevX, prevY, beatX, stringY)}
                                fill="none"
                                className="slur-line"
                                strokeWidth="1.2"
                                style={{ pointerEvents: 'none' }}
                              />
                            );
                          }
                          // Slanted the way the hand moves: up the neck climbs, down it falls.
                          const rise = n.fret >= from.note.fret ? 3 : -3;
                          return (
                            <path
                              d={split
                                ? `M ${prevX + 7} ${prevY + rise} L ${rowEnd} ${prevY} M ${rowStart} ${stringY} L ${beatX - 7} ${stringY - rise}`
                                : `M ${prevX + 7} ${prevY + rise} L ${beatX - 7} ${stringY - rise}`}
                              className="slur-line"
                              strokeWidth="1"
                              style={{ pointerEvents: 'none' }}
                            />
                          );
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

              {/* Tuplets: the count over each group, on a bracket when its notes are not beamed
                  together, clear of the staff, every notehead and every up stem; the TAB repeats
                  the count under its rhythm stems. */}
              {tupletGroups(measure.beats).map(g => {
                const x1 = getBeatCoordinates(mIdx, g.start, staff);
                const x2 = getBeatCoordinates(mIdx, g.end, staff);
                const beamed = beamGroups.find(bg => bg.startIdx <= g.start && g.end <= bg.endIdx);
                const beamUp = beamed ? getBeamStemUp(mIdx, beamed, staff) : false;
                let top = staffY + 10;
                for (let i = g.start; i <= g.end; i++) {
                  const beat = measure.beats[i];
                  if (beat.isRest || beat.notes.length === 0) continue;
                  const steps = beat.notes.map(n => staffStep(noteMidi(n, staff), staff, mIdx));
                  const head = staffY + Y_of_step(Math.max(...steps));
                  const up = beamed ? beamUp : steps.reduce((sum, s) => sum + s, 0) / steps.length < 6;
                  const stemTop = beamed ? getBeamY(mIdx, beamed, true, staff, staffY) - 2 : head - 30;
                  top = Math.min(top, up && beat.duration !== '1' ? stemTop : head - 5);
                }
                const mid = (x1 + x2) / 2 + (beamUp ? 4 : 0);
                const y = top - 5;
                return (
                  <g key={`tuplet-${g.start}`} style={{ pointerEvents: 'none' }}>
                    {showNotation && !beamed && (
                      <path
                        d={`M ${x1 - 4} ${y + 1} V ${y - 3} H ${mid - 6} M ${mid + 6} ${y - 3} H ${x2 + 4} V ${y + 1}`}
                        fill="none"
                        className="glyph-ink-stroke"
                        strokeWidth="1"
                      />
                    )}
                    {showNotation && (
                      <text x={mid} y={y} textAnchor="middle" fontSize="9" fontStyle="italic" className="music-text glyph-ink">{g.tuplet}</text>
                    )}
                    {showTab && (
                      <text x={(x1 + x2) / 2} y={rowY + tabTop + ts + stringCount * 10 + 24} textAnchor="middle" fontSize="8" fontStyle="italic" className="music-text glyph-ink">{g.tuplet}</text>
                    )}
                  </g>
                );
              })}
              </g>
            );
          }))}

          {/* Palm mute and let ring: the label over a lone note; a run of them opens with the label, then a
              dashed line to a bar halfway between its last note and the next. A run that wraps restates it on each row. */}
          {runPieces.map(({ technique, label, dashFrom, piece, line, closes, height }) => {
            const first = piece[0];
            const last = piece[piece.length - 1];
            const y = getRowY(first.measureIndex) + tabTop + getRowShift(first.measureIndex) - height;
            const x = getBeatCoordinates(first.measureIndex, first.beatIndex);
            const lastX = getBeatCoordinates(last.measureIndex, last.beatIndex);
            const barEnd = getMeasureX(last.measureIndex) + getMeasureWidth(last.measureIndex);
            const next = nextBeatPosition(measures, last, false);
            const nextX = next !== null && rowOf(next) === rowOf(last)
              ? getBeatCoordinates(next.measureIndex, next.beatIndex)
              : barEnd;
            const endX = closes ? (lastX + nextX) / 2 : barEnd;
            return (
              <g key={`${technique}-${first.measureIndex}-${first.beatIndex}`} style={{ pointerEvents: 'none' }}>
                <text x={x - 12} y={y} className="music-text technique-mark" fontSize="8">{label}</text>
                {line && (
                  <g className="technique-mark-line" strokeWidth="1">
                    <line x1={x + dashFrom} y1={y - 3} x2={endX} y2={y - 3} strokeDasharray="2 2" />
                    {closes && <line x1={endX} y1={y - 7} x2={endX} y2={y + 1} />}
                  </g>
                )}
              </g>
            );
          })}

          {/* The tempo box paints last, so no note, stem or later bar covers it.
              An HTML input inside the SVG: foreignObject coordinates are user
              units, so the box tracks the tempo mark at any zoom without
              mapping screen pixels back into the viewBox. */}
          {bpmEditIndex !== null && bpmEditIndex < measures.length && (
            <foreignObject x={getMeasureX(bpmEditIndex) + 13} y={getLabelY(bpmEditIndex) - 14} width="64" height="20">
              <input
                className="tempo-input"
                type="text"
                inputMode="numeric"
                autoFocus
                aria-label={`Tempo for bar ${bpmEditIndex + 1}`}
                value={bpmDraft ?? String(getEffectiveBpm(song, bpmEditIndex))}
                onChange={(e) => setBpmDraft(e.target.value)}
                onFocus={(e) => e.target.select()}
                onBlur={() => { commitBpmDraft(bpmEditIndex); setBpmEditIndex(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') { setBpmDraft(null); setBpmEditIndex(null); }
                }}
              />
            </foreignObject>
          )}
        </svg>
      </div>

      {/* Piano keyboard — replaces the fretboard in sheet-only mode, where
          string/fret input makes no sense but pitch input does. */}
      {showFretboard && !showTab && (
        <KeyboardPanel
          grandStaff={grandStaff}
          activeHand={activeHand}
          switchHand={switchHand}
          whiteKeyMidis={whiteKeyMidis}
          blackKeys={blackKeys}
          blackKeyWidthPct={blackKeyWidthPct}
          activeMidis={activeMidis}
          keyClass={keyClass}
          toggleNoteAtMidi={toggleNoteAtMidi}
          onHide={() => { setShowFretboard(false); containerRef.current?.focus({ preventScroll: true }); }}
        />
      )}

      {showFretboard && showTab && (
        <FretboardPanel
          tuning={tuning}
          activeBeat={activeBeat}
          playbackBeat={playbackBeatObj}
          removeActiveNoteOnString={removeActiveNoteOnString}
          setFretForActiveNote={setFretForActiveNote}
          onHide={() => { setShowFretboard(false); containerRef.current?.focus({ preventScroll: true }); }}
        />
      )}

      <CommandBar
        openMenu={openMenu}
        toggleMenu={toggleMenu}
        readOnly={readOnly}
        status={status}
        transport={{
          isPlaying: playback.isPlaying,
          stop: playback.stop,
          startPlaybackFromCursor,
          activeMeasureIndex,
          activeMeasureBpm,
          transportBpmText,
          setMeasureBpm,
          setBpmDraft,
          commitBpmDraft,
        }}
        playback={{ playbackSpeed, setPlaybackSpeed, volume, setVolume, loopPlayback, setLoopPlayback }}
        song={{ startNewSong: () => void startNewSong(), handleExport, handleImport, clearSong }}
        measure={{
          activeMeasureIndex,
          activeMeasureTimeSignature,
          setActiveMeasureTimeSignature,
          showNotation,
          staves,
          grandStaff,
          setClef,
          repeatStart: !!conductorMeasures[activeMeasureIndex]?.repeatStart,
          toggleRepeatStart,
          activeRepeat,
          setRepeatEnd,
          addMeasure,
          insertMeasureAfterActive,
          duplicateActiveMeasure,
          deleteActiveMeasure,
          activeBeatIndex,
          insertBeatAfterActive,
          deleteActiveBeat,
        }}
        history={{ undo: channel.undo, redo: channel.redo, canUndo: live.canUndo, canRedo: live.canRedo }}
        view={{
          partName: part.name,
          staffModes: STAFF_DISPLAYS[trackKind(activeTrack.instrument)],
          display: activeTrack.display,
          pickStaffMode: (mode) => updateActiveTrack({ display: mode }),
          panelName: showTab ? 'Fretboard' : 'Keyboard',
          showFretboard,
          toggleFretboard: () => setShowFretboard(prev => !prev),
          paperScore: user.paperScore,
          togglePaperScore: () => {
            saveAppearance({ paperScore: !user.paperScore })
              .catch(() => setNotice('Could not save the paper score to your account.'));
          },
          showShortcuts: () => {
            setOpenMenu(null);
            setShowShortcuts(true);
          },
        }}
        readOnlyToggle={{ isViewer: role === 'viewer', viewMode, toggleViewMode }}
      />

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}

      {modalOpen && (
        <JsonDialog
          modalOpen={modalOpen}
          jsonText={jsonText}
          setJsonText={setJsonText}
          modalStatus={modalStatus}
          copyToClipboard={copyToClipboard}
          downloadJsonFile={downloadJsonFile}
          executeImport={executeImport}
          onClose={() => setModalOpen(null)}
        />
      )}
    </div>
  );
};

export default TabSheetEditor;
