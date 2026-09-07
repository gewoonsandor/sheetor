import React, { useState, useEffect, useRef } from 'react';
import './TabSheetEditor.css';

import type {
  Duration, FrettedNote, InstrumentId, NoteTechniques, PitchedNote, StaffDisplay,
  TabNote, TabBeat, TabMeasure, TabSong, TabTrack, TrackKind, BeamGroup, MLayout,
} from './types';
import {

  allStringPitches,
  getDurationVal,
  computeBeamGroups,
  createTrack,

  isFrettedNote,
  midiToNoteName,
  midiToNoteOctave,
  noteOctaveToMidi,
  normalizeTrackLengths,
  DEFAULT_TRANSPOSE,
  resolveNoteMidi,
  GUITAR_NOTE_OPTIONS,
  midiToDiatonicAndAccidental,
  staffStepToSoundingMidi,
  Y_of_step,
  createEmptyMeasure,
  createEmptySong,
  createId,
  getEffectiveBpm,
  getEffectiveTimeSignature,
  pruneNotesToStringCount,

} from './songUtils';
import { INSTRUMENTS } from './audioEngine';
import { TrackStrip } from './TrackStrip';
import { parseSong } from './songSchema';
import { loadSong, saveSong } from './persistence';
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
  TAB_STAFF_TOP,
  TAB_STAFF_HEIGHT_PX,
  TAB_FRET_FONT_SIZE,
} from './layout';

// Treble clef outline traced from the public-domain "Treble clef with empty staff.svg"
// (Wikimedia Commons, author WarX), retargeted to staff units: top line y=10, 10 per space.
const TREBLE_CLEF_PATH =
  'M 27.7 34.8 C 26.7 35 25.7 35.6 24.8 36.5 23.9 37.4 23.4 38.4 23.3 39.6 23.2 40.3 23.4 41.2 23.9 42.1 24.3 43.1 25 43.8 25.9 44.2 26.2 44.3 26.4 44.5 26.3 44.7 26.3 44.8 26.2 44.9 25.9 44.9 24.4 44.5 23.2 43.5 22.3 42.3 21.5 41 21.1 39.5 21.1 37.9 21.3 36.2 21.9 34.6 23 33.2 24.1 31.8 25.5 30.9 27.1 30.4 L 26.3 24.4 C 23.6 26.3 21.4 28.4 19.6 30.6 17.8 32.8 16.8 35.3 16.6 38 16.5 39.2 16.7 40.4 17.1 41.6 17.5 42.8 18.1 43.8 19 44.9 20.7 46.9 23.1 48 26.1 48.3 27.1 48.3 28.2 48.2 29.4 48 L 27.7 34.8 z M 28.9 34.7 L 30.6 47.7 C 33.3 46.8 34.7 44.7 35 41.2 34.9 40.1 34.6 39 34.1 38.1 33.6 37.1 33 36.3 32.1 35.7 31.2 35.1 30.1 34.8 28.9 34.7 z M 26.7 17.1 C 27.3 16.8 27.9 16.3 28.7 15.5 29.4 14.8 30.2 13.9 30.9 12.8 31.6 11.8 32.2 10.7 32.7 9.6 33.1 8.6 33.4 7.5 33.4 6.6 33.5 6.1 33.5 5.7 33.4 5.4 33.4 4.8 33.2 4.3 32.9 3.9 32.6 3.6 32.2 3.4 31.7 3.4 30.7 3.3 29.8 3.9 28.9 5 28.2 6.1 27.6 7.3 27.1 8.7 26.7 10.1 26.3 11.6 26.2 13 26.2 14.7 26.4 16 26.7 17.1 z M 25.6 18 C 25 15.3 24.8 12.5 24.9 9.7 25 7.9 25.3 6.2 25.8 4.7 26.2 3.1 26.8 1.8 27.5 0.7 28.2 -0.4 29 -1.3 29.8 -1.8 30.6 -2.3 31.1 -2.6 31.4 -2.5 31.6 -2.5 31.8 -2.4 32 -2.3 32.1 -2.1 32.3 -1.8 32.6 -1.5 34.4 1.5 35.1 4.9 34.9 8.9 34.7 10.8 34.4 12.6 33.7 14.4 33.1 16.2 32.3 17.9 31.2 19.4 30.1 21 28.9 22.3 27.5 23.5 L 28.4 30.1 C 29.1 30.1 29.6 30.1 29.9 30.1 31.2 30.2 32.3 30.5 33.3 31.1 34.4 31.7 35.2 32.5 35.9 33.5 36.5 34.4 37 35.5 37.4 36.7 37.7 37.9 37.8 39.1 37.7 40.4 37.6 42.3 36.9 44.1 35.8 45.7 34.6 47.2 33 48.3 30.9 48.9 30.9 49.7 31.1 50.9 31.3 52.5 31.6 54 31.7 55.3 31.8 56.2 31.9 57.1 32 58 31.9 58.8 31.8 60.1 31.4 61.3 30.7 62.3 30 63.2 29.1 64 27.9 64.5 26.8 65 25.6 65.2 24.3 65.1 22.4 64.9 20.9 64.3 19.6 63.2 18.3 62.1 17.6 60.6 17.7 58.9 17.8 58.1 18 57.4 18.4 56.7 18.8 56 19.3 55.5 19.9 55.1 20.5 54.7 21.2 54.5 22 54.5 22.6 54.5 23.2 54.8 23.8 55.2 24.3 55.6 24.8 56.1 25.1 56.7 25.4 57.4 25.5 58.1 25.4 58.8 25.4 59.8 25 60.6 24.3 61.2 23.6 61.9 22.7 62.2 21.7 62.1 L 21.3 62.1 C 21.9 63.1 22.9 63.7 24.4 63.8 25.1 63.8 25.9 63.7 26.7 63.5 27.5 63.2 28.2 62.9 28.8 62.4 29.4 61.9 29.8 61.3 30 60.7 30.3 60.1 30.5 59.1 30.6 57.9 30.6 57.1 30.6 56.3 30.5 55.5 30.4 54.7 30.3 53.7 30 52.3 29.8 51 29.6 50 29.5 49.3 28.5 49.5 27.5 49.6 26.4 49.5 24.6 49.4 22.9 48.9 21.3 48 19.7 47.2 18.4 46 17.2 44.6 16.1 43.2 15.3 41.6 14.7 39.9 14.1 38.1 13.9 36.4 14 34.5 14.2 32.8 14.6 31.2 15.3 29.7 16.1 28.2 16.9 26.8 18 25.5 19 24.2 20.1 23 21.2 22 22.3 20.9 23.8 19.6 25.6 18 z';

// Standard guitar tunings (MIDI pitches, high string first)
const STANDARD_TUNINGS: Record<string, number[]> = {
  'Standard': [64, 59, 55, 50, 45, 40],
  'Drop D': [64, 59, 55, 50, 45, 38],
  'Half step down': [63, 58, 54, 49, 44, 39],
  'Full step down': [62, 57, 53, 48, 43, 38],
  'Drop C#': [63, 58, 54, 49, 44, 37],
  'Drop C': [62, 57, 53, 48, 43, 36],
  'Open G': [62, 59, 55, 50, 43, 38],
  'Open D': [62, 57, 54, 50, 45, 38],
  'Open A': [64, 59, 55, 50, 47, 40],
  'DADGAD': [62, 57, 55, 50, 45, 38],
};

const TUNING_PRESETS = Object.entries(STANDARD_TUNINGS);

// Keyboard span for pitched tracks, which have no tuning to derive one from.
const PITCHED_KEYBOARD_LOW = 36;  // C2
const PITCHED_KEYBOARD_HIGH = 84; // C6

const INSTRUMENT_OPTIONS = Object.entries(INSTRUMENTS).map(([id, voice]) => ({
  id: id as InstrumentId,
  label: voice.label,
}));

export const TabSheetEditor: React.FC = () => {
  // --- STATE ---

  const [song, setSong] = useState<TabSong>(() => loadSong(createEmptySong()));
  const [activeTrackIndex, setActiveTrackIndex] = useState<number>(0);
  const [activeMeasureIndex, setActiveMeasureIndex] = useState<number>(0);
  const [activeBeatIndex, setActiveBeatIndex] = useState<number>(0);
  const [activeStringIndex, setActiveStringIndex] = useState<number>(0);

  // Everything the score and the input panels read comes from the active
  // track, so the rest of the component works one track at a time.
  const activeTrack = song.tracks[activeTrackIndex] ?? song.tracks[0];
  const measures = activeTrack.measures;
  const tuning = activeTrack.tuning ?? [];
  const stringCount = tuning.length;
  const transpose = activeTrack.transpose;
  const isFrettedTrack = activeTrack.kind === 'fretted';
  const showTab = isFrettedTrack && activeTrack.display !== 'notation';
  const showNotation = activeTrack.display !== 'tab';

  const [durationSelect, setDurationSelect] = useState<Duration>('4');
  const [dotSelect, setDotSelect] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const [viewMode, setViewMode] = useState<boolean>(false);
  const [showFretboard, setShowFretboard] = useState<boolean>(true);
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);
  const [showNoteOptions, setShowNoteOptions] = useState<boolean>(false);
  const [openBottomMenu, setOpenBottomMenu] = useState<'song' | 'edit' | 'output' | 'view' | 'track' | null>(null);

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [loopPlayback, setLoopPlayback] = useState<boolean>(false);

  // Import/Export Modal state
  const [modalOpen, setModalOpen] = useState<'import' | 'export' | null>(null);
  const [jsonText, setJsonText] = useState<string>('');
  const [modalStatus, setModalStatus] = useState<string>('');

  // Keyboard navigation & double-digit entry ref

  const lastKeyTimeRef = useRef<number>(0);
  const lastKeyStringRef = useRef<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  const playback = usePlayback(
    { song, volume, loop: loopPlayback, speed: playbackSpeed, activeTrackIndex },
    (position) => {
      setActiveMeasureIndex(position.measureIndex);
      setActiveBeatIndex(position.beatIndex);
    },
  );

  // --- TRACK EDITORS ---

  const updateTrack = (trackIndex: number, patch: Partial<TabTrack>) => {
    setSong(prev => ({
      ...prev,
      tracks: prev.tracks.map((t, i) => (i === trackIndex ? { ...t, ...patch } : t)),
    }));
  };

  const updateActiveTrack = (patch: Partial<TabTrack>) => updateTrack(activeTrackIndex, patch);

  const selectTrack = (index: number) => {
    setActiveTrackIndex(index);
    setShowNoteOptions(false);
    // Bar counts are shared, but beat counts are not, so re-clamp the cursor.
    const target = song.tracks[index];
    if (!target) return;
    const beats = target.measures[activeMeasureIndex]?.beats.length ?? 0;
    if (activeBeatIndex >= beats) setActiveBeatIndex(Math.max(0, beats - 1));
    const slots = target.kind === 'fretted' ? (target.tuning?.length ?? 6) : 1;
    setActiveStringIndex(prev => Math.min(prev, slots - 1));
  };

  const addTrack = () => {
    const kind: TrackKind = 'pitched';
    const track = createTrack(kind, 'piano', measures.length);
    setSong(prev => ({ ...prev, tracks: normalizeTrackLengths([...prev.tracks, track]) }));
    setActiveTrackIndex(song.tracks.length);
    setActiveBeatIndex(0);
    setActiveStringIndex(0);
    setOpenBottomMenu('track');
  };

  const duplicateActiveTrack = () => {
    setSong(prev => {
      const source = prev.tracks[activeTrackIndex];
      if (!source) return prev;
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
      const tracks = [...prev.tracks];
      tracks.splice(activeTrackIndex + 1, 0, copy);
      return { ...prev, tracks };
    });
    setActiveTrackIndex(prev => prev + 1);
  };

  const deleteActiveTrack = () => {
    if (song.tracks.length <= 1) return; // A song always has one track
    setSong(prev => ({ ...prev, tracks: prev.tracks.filter((_, i) => i !== activeTrackIndex) }));
    setActiveTrackIndex(prev => Math.max(0, prev - 1));
    setActiveBeatIndex(0);
    setActiveStringIndex(0);
    setOpenBottomMenu(null);
  };

  /** Rewrites only the active track's bars. */
  const setMeasures = (updater: (measures: TabMeasure[]) => TabMeasure[]) => {
    setSong(prev => ({
      ...prev,
      tracks: prev.tracks.map((t, i) => (i === activeTrackIndex ? { ...t, measures: updater(t.measures) } : t)),
    }));
  };

  /**
   * Bar-count changes must hit every track or the score falls out of
   * alignment, so they all go through here.
   */
  const setAllTrackMeasures = (updater: (measures: TabMeasure[], track: TabTrack) => TabMeasure[]) => {
    setSong(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => ({ ...t, measures: updater(t.measures, t) })),
    }));
  };

  const startPlaybackFromCursor = () =>
    playback.start({ measureIndex: activeMeasureIndex, beatIndex: activeBeatIndex });

  // Auto-save song to localStorage on every change
  useEffect(() => {
    saveSong(song);
  }, [song]);

  // --- STATE EDITORS ---

  const getActiveBeat = (): TabBeat | undefined => {
    return measures[activeMeasureIndex]?.beats[activeBeatIndex];
  };

  /** Tempo and metre are song-wide, so the overrides live on track 0. */
  const setConductorMeasure = (patch: (measure: TabMeasure) => TabMeasure) => {
    setSong(prev => ({
      ...prev,
      tracks: prev.tracks.map((t, i) => (i === 0
        ? { ...t, measures: t.measures.map((m, idx) => (idx === activeMeasureIndex ? patch(m) : m)) }
        : t)),
    }));
  };

  const setActiveMeasureBpm = (bpm: number) => {
    if (activeMeasureIndex === 0) {
      setSong(prev => ({ ...prev, bpm }));
      setConductorMeasure(measure => {
        const normalized = { ...measure };
        delete normalized.bpm;
        return normalized;
      });
      return;
    }
    setConductorMeasure(measure => ({ ...measure, bpm }));
  };

  const setActiveMeasureTimeSignature = (field: 'numerator' | 'denominator', value: number) => {
    const effective = getEffectiveTimeSignature(song, activeMeasureIndex);
    const nextTimeSignature = { ...effective, [field]: value };
    if (activeMeasureIndex === 0) {
      setSong(prev => ({ ...prev, timeSignature: nextTimeSignature }));
      setConductorMeasure(measure => {
        const normalized = { ...measure };
        delete normalized.timeSignature;
        return normalized;
      });
      return;
    }
    setConductorMeasure(measure => ({ ...measure, timeSignature: nextTimeSignature }));
  };

  const updateActiveBeatNotes = (updateFn: (notes: TabNote[]) => TabNote[]) => {
    setMeasures(prev => prev.map((m, mIdx) => {
      if (mIdx !== activeMeasureIndex) return m;
      return {
        ...m,
        beats: m.beats.map((b, bIdx) => {
          if (bIdx !== activeBeatIndex) return b;
          const newNotes = updateFn(b.notes);
          return { ...b, notes: newNotes, isRest: newNotes.length === 0 };
        })
      };
    }));
  };

  const setFretForActiveNote = (stringIndex: number, fret: number) => {
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
    });
    // Set active string
    setActiveStringIndex(stringIndex);
  };

  /** Adds or replaces an absolute pitch on the active beat (pitched tracks). */
  const setPitchForActiveNote = (midi: number) => {
    updateActiveBeatNotes(currentNotes => {
      const existing = currentNotes.find(n => !isFrettedNote(n) && n.midi === midi);
      if (existing) return currentNotes;
      playback.playTone(midi);
      return [...currentNotes, { midi }];
    });
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
    setSong(createEmptySong());
    setActiveMeasureIndex(0);
    setActiveBeatIndex(0);
    setActiveStringIndex(0);
  };

  // --- KEYBOARD CONTROLS ---

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // If typing in input fields, ignore shortcuts
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    if (viewMode) return;

    const measure = measures[activeMeasureIndex];
    if (!measure) return;
    const beat = measure.beats[activeBeatIndex];

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
        const measureDur = measure.beats.reduce((acc, b) => acc + getDurationVal(b.duration, b.dot), 0);
        const timeSignature = getEffectiveTimeSignature(song, activeMeasureIndex);
        const targetDur = timeSignature.numerator * (4 / timeSignature.denominator);

        if (activeBeatIndex < measure.beats.length - 1) {
          setActiveBeatIndex(prev => prev + 1);
        } else {
          // On the last beat of the measure
          if (measureDur < targetDur - 0.001) {
            // Bar is not filled yet, create a new beat with same length
            const prevDuration = beat ? beat.duration : durationSelect;
            const newBeat: TabBeat = {
              id: createId(),
              duration: prevDuration,
              notes: [],
              isRest: true
            };
            setMeasures(list => list.map((m, mIdx) => (
              mIdx === activeMeasureIndex ? { ...m, beats: [...m.beats, newBeat] } : m
            )));
            setActiveBeatIndex(prev => prev + 1);
          } else if (activeMeasureIndex < measures.length - 1) {
            // Bar is filled, go to next measure
            setActiveMeasureIndex(prev => prev + 1);
            setActiveBeatIndex(0);
          } else {
            // Last bar is filled and we're on the last measure — create a new bar
            const prevDuration = beat ? beat.duration : durationSelect;
            const newMeasure: TabMeasure = {
              id: createId(),
              beats: [{
                id: createId(),
                duration: prevDuration,
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
        }
        break;
      }

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
        if (beat?.isRest) {
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
          const now = Date.now();
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

  const ROW_HEIGHT = computeRowHeight(stringCount, showTab);

  const measureLayouts: MLayout[] = computeMeasureLayouts(measures);

  // Compute TAB shift per measure: extra gap to avoid stems overlapping TAB.
  // Irrelevant when the TAB staff isn't rendered at all.
  const measureTabOffsets: number[] = measures.map((measure) => {
    if (!showTab) return 0;
    let minStep = 4;
    for (const beat of measure.beats) {
      if (beat.isRest) continue;
      for (const note of beat.notes) {
        const midi = (resolveNoteMidi(note, activeTrack) ?? NaN);
        const { diatonicStep } = midiToDiatonicAndAccidental(midi);
        if (diatonicStep < minStep) minStep = diatonicStep;
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
  measures.forEach((measure, mIdx) => {
    const r = measureLayouts[mIdx]?.row ?? 0;
    let minNoteY = 0;
    for (const beat of measure.beats) {
      if (beat.isRest || beat.notes.length === 0) continue;
      for (const note of beat.notes) {
        const midi = (resolveNoteMidi(note, activeTrack) ?? NaN);
        const { diatonicStep } = midiToDiatonicAndAccidental(midi);
        const y = Y_of_step(diatonicStep);
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

  const totalSVGHeight = cumY + 10;

  const getMeasureWidth = (index: number): number => measureLayouts[index]?.width ?? 0;
  const getMeasurePadding = (index: number): number => measureLayouts[index]?.padding ?? 18;
  const getMeasureX = (index: number): number => measureLayouts[index]?.x ?? 0;
  const getRowShift = (index: number): number => {
    const r = measureLayouts[index]?.row ?? 0;
    return rowExtra[r] || 0;
  };

  // Bottom boundary (offset from rowY) used for bar lines, selection highlight,
  // and the playback cursor. With the TAB staff hidden this is just below the
  // standard staff instead of the bottom TAB line.
  const getStaffBottom = (ts: number): number =>
    showTab ? TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX - 10 : 50;

  /** Top boundary of the drawn staff block, for bar lines and the cursor. */
  const getStaffTop = (ts: number): number => (showNotation ? 10 : TAB_STAFF_TOP + ts);

  const fretboardNeckHeight = computeFretboardNeckHeight(stringCount);

  const getFretboardStringY = (stringIdx: number): number =>
    getFretboardStringYFromLayout(stringIdx, stringCount);

  // Calculate coordinates for beats inside a measure
  const getBeatCoordinates = (mIdx: number, bIdx: number): number => {
    const measure = measures[mIdx];
    const measureX = getMeasureX(mIdx);
    const padding = getMeasurePadding(mIdx);
    const width = getMeasureWidth(mIdx);
    const usableWidth = width - padding - 20;

    // Center a single beat inside the measure's usable area
    if (measure.beats.length === 1) {
      return measureX + padding + usableWidth / 2;
    }

    // Compressed proportional positioning using sqrt(duration)
    let totalWeight = 0;
    const beatWeights: number[] = [];
    measure.beats.forEach((b) => {
      beatWeights.push(totalWeight);
      totalWeight += Math.sqrt(getDurationVal(b.duration, b.dot));
    });

    return measureX + padding + ((beatWeights[bIdx] || 0) / totalWeight) * usableWidth;
  };

  // Determine the unified stem direction for a beam group
  const getBeamStemUp = (measure: TabMeasure, beamGroup: BeamGroup): boolean => {
    let anyBelow = false;
    let anyAbove = false;
    let maxDist = 0;
    let dirUp = true;
    for (let i = beamGroup.startIdx; i <= beamGroup.endIdx; i++) {
      const beat = measure.beats[i];
      if (!beat) continue;
      for (const note of beat.notes) {
        const midi = (resolveNoteMidi(note, activeTrack) ?? NaN);
        const { diatonicStep } = midiToDiatonicAndAccidental(midi);
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

  // Calculate beam Y position for a beam group (standard notation)
  const getBeamY = (measure: TabMeasure, beamGroup: BeamGroup, stemUp: boolean): number => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = beamGroup.startIdx; i <= beamGroup.endIdx; i++) {
      const b = measure.beats[i];
      if (!b || b.isRest || b.notes.length === 0) continue;
      const rowY = getRowY(measures.indexOf(measure));
      for (const n of b.notes) {
        const midi = (resolveNoteMidi(n, activeTrack) ?? NaN);
        const { diatonicStep } = midiToDiatonicAndAccidental(midi);
        const y = rowY + Y_of_step(diatonicStep);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (stemUp) return (minY === Infinity ? 0 : minY) - 30;
    return (maxY === -Infinity ? 0 : maxY) + 30;
  };

  // Auto-scroll during playback to keep playhead visible
  useEffect(() => {
    const beat = playback.playbackBeat;
    if (!beat || !containerRef.current) return;
    const mIdx = beat.measureIndex;
    const beatX = getBeatCoordinates(mIdx, beat.beatIndex);
    const rowY = getRowY(mIdx);
    const container = containerRef.current;
    const svg = container.querySelector('svg');
    if (!svg) return;
    const scale = container.clientWidth / MAX_ROW_WIDTH;
    const scrollTargetX = beatX * scale - container.clientWidth / 3;
    const scrollTargetY = rowY * scale - container.clientHeight / 3;
    container.scrollTo({
      left: Math.max(0, scrollTargetX),
      top: Math.max(0, scrollTargetY),
      behavior: 'smooth',
    });
  }, [playback.playbackBeat, measureLayouts]);

  // Map standard notation click to pitch & tab note
  const handleStandardStaffClick = (mIdx: number, beatId: string, clickY: number) => {
    const step = Math.round((60 - clickY) / 5);

    // Clamp to what the current tuning can actually voice, so a click above or
    // below the reachable range still lands on the nearest playable pitch.
    const lowestMidi = Math.min(...tuning);
    const highestMidi = Math.max(...tuning) + 22;
    const targetMidi = Math.max(lowestMidi, Math.min(highestMidi, staffStepToSoundingMidi(step)));

    const placement = findBestStringFret(targetMidi);
    if (placement) {
      setActiveMeasureIndex(mIdx);
      const bIdx = measures[mIdx].beats.findIndex(b => b.id === beatId);
      setActiveBeatIndex(bIdx);
      setFretForActiveNote(placement.stringIndex, placement.fret);
    }
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

    setSong(result.song);
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
  const activeMeasureTimeSignature = getEffectiveTimeSignature(song, activeMeasureIndex);

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

  /**
   * The cursor slot a note occupies: its string on a fretted track, its rank
   * from the top of the chord on a pitched one.
   */
  const cursorSlotOf = (note: TabNote, notes: TabNote[]): number => {
    if (isFrettedNote(note)) return note.stringIndex;
    const byPitch = [...notes].sort((a, b) => (b as PitchedNote).midi - (a as PitchedNote).midi);
    return Math.max(0, byPitch.indexOf(note));
  };

  const isCursorNote = (mIdx: number, bIdx: number, noteIndex: number, notes: TabNote[]): boolean =>
    activeMeasureIndex === mIdx && activeBeatIndex === bIdx && cursorNoteIndex(notes) === noteIndex;

  const selectNote = (mIdx: number, bIdx: number, noteIndex: number, notes: TabNote[]) => {
    const wasSelected = isCursorNote(mIdx, bIdx, noteIndex, notes);
    const note = notes[noteIndex];
    setActiveMeasureIndex(mIdx);
    setActiveBeatIndex(bIdx);
    if (note) setActiveStringIndex(cursorSlotOf(note, notes));
    setShowNoteOptions(wasSelected);
  };

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
            onChange={(e) => setSong({ ...song, title: e.target.value })}
            placeholder="Song Title"
          />
          <input
            className="sheetor-artist-input"
            value={song.artist}
            onChange={(e) => setSong({ ...song, artist: e.target.value })}
            placeholder="Artist"
          />
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
        onToggleMute={(i) => updateTrack(i, { muted: !song.tracks[i].muted })}
        onToggleSolo={(i) => updateTrack(i, { soloed: !song.tracks[i].soloed })}
        onAddTrack={addTrack}
        onOpenSettings={() => setOpenBottomMenu(prev => (prev === 'track' ? null : 'track'))}
        settingsOpen={openBottomMenu === 'track'}
      >
        {openBottomMenu === 'track' && (
          <div className="bottom-popover track-popover">
            <span className="popover-title">Track {activeTrackIndex + 1}</span>
            <label className="compact-field wide-field">
              <span>Name</span>
              <input
                className="control-input"
                style={{ width: 130 }}
                value={activeTrack.name}
                onChange={(e) => updateActiveTrack({ name: e.target.value })}
              />
            </label>
            <label className="compact-field wide-field">
              <span>Sound</span>
              <select
                className="control-select"
                value={activeTrack.instrument}
                onChange={(e) => {
                  const instrument = e.target.value as InstrumentId;
                  // Retuning the staff to the new instrument keeps written
                  // pitch matching what is heard.
                  updateActiveTrack({ instrument, transpose: DEFAULT_TRANSPOSE[instrument] });
                }}
              >
                {INSTRUMENT_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
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
                value={activeTrack.volume}
                onChange={(e) => updateActiveTrack({ volume: parseFloat(e.target.value) })}
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
                    value=""
                    onChange={(e) => {
                      const pitches = STANDARD_TUNINGS[e.target.value];
                      if (!pitches) return;
                      updateActiveTrack({ tuning: pitches });
                      setActiveStringIndex(prev => Math.min(prev, pitches.length - 1));
                      setMeasures(prev => pruneNotesToStringCount(prev, pitches.length));
                    }}
                  >
                    <option value="">-- Select --</option>
                    {TUNING_PRESETS.map(([name]) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <label className="compact-field wide-field">
                  <span>Strings</span>
                  <select
                    className="control-select"
                    value={stringCount}
                    onChange={(e) => {
                      const count = parseInt(e.target.value) || 6;
                      const next = tuning.length < count
                        ? [...tuning, ...allStringPitches.slice(tuning.length, count)]
                        : tuning.slice(0, count);
                      updateActiveTrack({ tuning: next });
                      setActiveStringIndex(prev => Math.min(prev, count - 1));
                      setMeasures(prev => pruneNotesToStringCount(prev, count));
                    }}
                  >
                    {[4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <div className="popover-scroll">
                  {tuning.map((pitch, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="control-label" style={{ width: 12, textAlign: 'right' }}>{i + 1}</span>
                      <select
                        className="control-select"
                        style={{ flex: 1, fontSize: '0.75rem' }}
                        value={midiToNoteOctave(pitch)}
                        onChange={(e) => {
                          const newMidi = noteOctaveToMidi(e.target.value);
                          if (newMidi <= 0) return;
                          const next = [...tuning];
                          next[i] = newMidi;
                          updateActiveTrack({ tuning: next });
                        }}
                      >
                        {GUITAR_NOTE_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="popover-divider" />
            <button className="btn" onClick={duplicateActiveTrack}>Duplicate track</button>
            <button
              className="btn btn-danger"
              onClick={deleteActiveTrack}
              disabled={song.tracks.length <= 1}
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
            const showTimingChange = mIdx === 0 || typeof measure.bpm === 'number' || !!measure.timeSignature;

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
                    fill="rgba(224, 168, 63, 0.035)"
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {/* Standard Notation 5 lines (Treble staff) */}
                {showNotation && Array.from({ length: 5 }).map((_, lineIdx) => {
                  const y = rowY + 10 + lineIdx * 10;
                  return (
                    <line
                      key={`sl-${lineIdx}`}
                      x1={measureX}
                      y1={y}
                      x2={measureEnd}
                      y2={y}
                      className="staff-line"
                    />
                  );
                })}

                {/* TAB lines (TAB staff) */}
                {showTab && Array.from({ length: stringCount }).map((_, lineIdx) => {
                  const y = rowY + TAB_STAFF_TOP + ts + lineIdx * 10;
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

                {showTimingChange && (
                  <text
                    x={measureX + 18}
                    y={rowY - 6}
                    className="music-text"
                    fontSize="10"
                    style={{ pointerEvents: 'none' }}
                  >
                    {`♩=${effectiveBpm}`}
                  </text>
                )}

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
                    {showNotation && <path d={TREBLE_CLEF_PATH} fillRule="evenodd" fill="#f2ece4" />}

                    {/* Stacked TAB text */}
                    {showTab && (
                      <>
                        <text x="18" y={TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 - 14} className="music-text" fontSize="13" letterSpacing="0">T</text>
                        <text x="18" y={TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 2} className="music-text" fontSize="13" letterSpacing="0">A</text>
                        <text x="18" y={TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 18} className="music-text" fontSize="13" letterSpacing="0">B</text>
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
                          y={TAB_STAFF_TOP + ts + i * TAB_STAFF_HEIGHT_PX}
                          dominantBaseline="central"
                          fill="#a09890"
                          fontFamily="'Outfit', 'Inter', sans-serif"
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
                        {showNotation && (
                          <>
                            <text x="50" y="25" className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                            <text x="50" y="45" className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                          </>
                        )}

                        {showTab && (
                          <>
                            <text x="50" y={TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 - 8} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                            <text x="50" y={TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 12} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                          </>
                        )}
                      </g>
                    )}
                  </g>
                )}

                {/* Big Time Signature for timing changes (non-first-of-row measures) */}
                {showTimingChange && mIdx > 0 && measureLayouts[mIdx]?.x !== 0 && (
                  <g>
                    {showNotation && (
                      <>
                        <text x={measureX + 12} y={rowY + 25} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                        <text x={measureX + 12} y={rowY + 45} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                      </>
                    )}
                    {showTab && (
                      <>
                        <text x={measureX + 12} y={rowY + TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 - 8} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.numerator}</text>
                        <text x={measureX + 12} y={rowY + TAB_STAFF_TOP + ts + stringCount * TAB_STAFF_HEIGHT_PX / 2 + 12} className="music-text" fontSize="16" textAnchor="middle">{effectiveTimeSignature.denominator}</text>
                      </>
                    )}
                  </g>
                )}

                {/* Interactive transparent rectangles over the standard staff of this measure to place notes on click */}
                {measure.beats.map((b) => {
                  const beatX = getBeatCoordinates(mIdx, measure.beats.indexOf(b));

                  if (viewMode) return null;
                  return (
                    <g key={`clicks-${b.id}`}>
                      {/* Clicking standard staff region triggers layout coordinate mapper */}
                      {showNotation && (
                      <rect
                        x={beatX - 10}
                        y={rowY}
                        width="20"
                        height="65"
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const relativeY = e.clientY - rect.top;
                          const designY = relativeY * (65 / rect.height);
                          handleStandardStaffClick(mIdx, b.id, designY);
                        }}
                      />)}

                      {/* Clicking TAB staff region changes active beat/string */}
                      {showTab && Array.from({ length: stringCount }).map((_, stringIdx) => {
                        const y = rowY + TAB_STAFF_TOP + ts + stringIdx * 10;
                        return (
                          <rect
                            key={`click-string-${stringIdx}`}
                            x={beatX - 10}
                            y={y - 5}
                            width="20"
                            height="10"
                            fill="transparent"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setActiveMeasureIndex(mIdx);
                              setActiveBeatIndex(measure.beats.indexOf(b));
                              setActiveStringIndex(stringIdx);
                              setShowNoteOptions(false);
                            }}
                          />
                        );
                      })}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Render Active Beat Highlight & Playback Cursor */}
          {measures.map((measure, mIdx) => {
            const rowY = getRowY(mIdx);
            const ts = getRowShift(mIdx);
            return measure.beats.map((b, bIdx) => {
              const beatX = getBeatCoordinates(mIdx, bIdx);
              
              const isSelected = activeMeasureIndex === mIdx && activeBeatIndex === bIdx;
              const pb = playback.playbackBeat;
              const isPlayback = pb && pb.measureIndex === mIdx && pb.beatIndex === bIdx;

              return (
                <g key={`highlight-${b.id}`}>
                  {/* Selected Cursor Highlight */}
                  {!viewMode && isSelected && (
                    <g>
                      <rect
                        x={beatX - 10}
                        y={rowY + getStaffTop(ts) - 5}
                        width="20"
                        height={getStaffBottom(ts) - getStaffTop(ts) + 10}
                        fill="rgba(201, 119, 46, 0.12)"
                        stroke="#d98a3f"
                        strokeWidth="1.5"
                        rx="4"
                        pointerEvents="none"
                      />
                      {/* Fret/string tiny dot cursor in TAB */}
                      {showTab && (
                        <circle
                          cx={beatX}
                          cy={rowY + TAB_STAFF_TOP + ts + activeStringIndex * 10}
                          r="5.5"
                          fill="transparent"
                          stroke="#e0a83f"
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
                      stroke="#3fb98a"
                      strokeWidth="2.5"
                      strokeDasharray="2"
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            });
          })}

          {/* Render Notes & Rests */}
          {measures.map((measure, mIdx) => {
            const rowY = getRowY(mIdx);
            const ts = getRowShift(mIdx);
            const beamGroups = computeBeamGroups(measure.beats, getEffectiveTimeSignature(song, mIdx));
            return (
              <g key={`measure-${measure.id}`}>
              {measure.beats.map((b, bIdx) => {
              const beatX = getBeatCoordinates(mIdx, bIdx);
              const beamInfo = beamGroups.find(g => g.startIdx <= bIdx && bIdx <= g.endIdx);

              // 1. Rests. They are decoration painted over the staff's click
              // targets, so they must not swallow clicks meant to place a note.
              if (b.isRest || b.notes.length === 0) {
                const dur = b.duration;
                return (
                  <g key={`rest-${b.id}`} transform={`translate(0, ${rowY})`} style={{ pointerEvents: 'none' }}>
                    {showNotation && (<>
                    {/* Render Rest on Standard Staff */}
                    {dur === '1' && (
                      // Whole rest: hanging rectangle on line 4 (y=20)
                      <rect x={beatX - 6} y="20" width="12" height="6" fill="#f2ece4" />
                    )}
                    {dur === '2' && (
                      // Half rest: sitting rectangle on line 3 (y=30)
                      <rect x={beatX - 6} y="24" width="12" height="6" fill="#f2ece4" />
                    )}
                    {dur === '4' && (
                      // Quarter rest: classic squiggle (rendered as path)
                      <path
                        d={`M ${beatX - 1.5} ${30 - 10} l 3 3 c -1.5 1.5, -3 3, -0.75 4.5 c 1.5 1.5, 0.75 3, -2.25 4.5 c -1.5 -0.75, -2.25 -1.5, -0.75 -2.25 c 1.5 -0.75, 0.75 -1.5, 0 -2.25 c -1.5 -0.75, -1.1 -2.25, 0.75 -3.3 Z`}
                        fill="#f2ece4"
                        stroke="#f2ece4"
                        strokeWidth="1.5"
                      />
                    )}
                    {(dur === '8' || dur === '16' || dur === '32') && (
                      // Eighth / Sixteenth / Thirty-Second rest: slash with hooks
                      <g>
                        <line x1={beatX + 2} y1={22} x2={beatX - 3} y2={35} stroke="#f2ece4" strokeWidth="1.5" />
                        <circle cx={beatX - 3} cy={24} r="2.2" fill="#f2ece4" />
                        {dur === '16' && (
                          <circle cx={beatX - 5} cy={29} r="2.2" fill="#f2ece4" />
                        )}
                        {dur === '32' && (
                          <>
                            <circle cx={beatX - 5} cy={29} r="2.2" fill="#f2ece4" />
                            <circle cx={beatX - 7} cy={34} r="2.2" fill="#f2ece4" />
                          </>
                        )}
                      </g>
                    )}
                    {/* Dotted rest dot */}
                    {b.dot && (
                      <circle cx={beatX + 10} cy={dur === '1' ? 23 : dur === '2' ? 27 : 25} r="2.2" fill="#f2ece4" pointerEvents="none" />
                    )}
                    </>)}
                  </g>
                );
              }

              // 2. Chords & Melodic Notes
              // Precalculate diatonic positions for standard staff rendering.
              // noteIndex is the note's slot in the beat, which is what the
              // cursor addresses on a pitched track (there is no string there).
              const calculatedNotes = b.notes.map((n, noteIndex) => {
                const midi = (resolveNoteMidi(n, activeTrack) ?? NaN);
                const { diatonicStep, accidental } = midiToDiatonicAndAccidental(midi, transpose);
                return {
                  note: n,
                  noteIndex,
                  midi,
                  dot: b.dot,
                  step: diatonicStep,
                  accidental,
                  y: rowY + Y_of_step(diatonicStep)
                };
              });

              // Sort notes by pitch to determine stems easily (ascending order, i.e., lowest y is highest pitch)
              calculatedNotes.sort((x, y) => x.y - y.y);

              const lowestY = calculatedNotes[calculatedNotes.length - 1].y;
              const highestY = calculatedNotes[0].y;
              const avgStep = calculatedNotes.reduce((acc, curr) => acc + curr.step, 0) / calculatedNotes.length;
              
              // Stem direction: unified direction for beam groups, per-beat otherwise
              const stemUp = beamInfo ? getBeamStemUp(measure, beamInfo) : avgStep < 6;
              const isWhole = b.duration === '1';
              const hasStem = !isWhole;

              // Stem position for beaming
              const stemX = hasStem ? (stemUp ? beatX + 4 : beatX - 4) : 0;
              const rawStemY = hasStem
                ? (beamInfo
                  ? (stemUp
                    ? getBeamY(measure, beamInfo, stemUp) - 2
                    : getBeamY(measure, beamInfo, stemUp) + 2)
                  : (stemUp ? highestY - 30 : lowestY + 30))
                : 0;
              const stemEndY = rawStemY;

              return (
                <g key={`notes-${b.id}`}>
                  {/* A. Standard Notation noteheads & stems */}
                  {showNotation && calculatedNotes.map((n) => {
                    const isSelected = isCursorNote(mIdx, bIdx, n.noteIndex, b.notes);

                    // Skip notes that would render below the TAB staff area (or,
                    // with the TAB hidden, below the row's reserved space)
                    if (showTab && n.y > rowY + TAB_STAFF_TOP + ts - 8) return null;
                    if (!showTab && n.y > rowY + ROW_HEIGHT - 10) return null;

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
                            const lineY = rowY + Y_of_step(lineStep);
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

                        {/* Accidental (#) if sharp */}
                        {n.accidental === '#' && (
                          <g stroke="#f2ece4" strokeWidth="1.3" opacity="0.9" style={{ pointerEvents: 'none' }}>
                            <line x1={beatX - 13} y1={n.y - 6} x2={beatX - 13} y2={n.y + 6} />
                            <line x1={beatX - 10} y1={n.y - 8} x2={beatX - 10} y2={n.y + 4} />
                            <line x1={beatX - 16} y1={n.y - 2.5} x2={beatX - 7} y2={n.y - 4} />
                            <line x1={beatX - 16} y1={n.y + 2.5} x2={beatX - 7} y2={n.y + 1} />
                      {!beamInfo && b.duration === '32' && (
                        <g fill="#f2ece4">
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

                        {/* Notehead */}
                        <ellipse
                          cx={beatX}
                          cy={n.y}
                          rx="4.5"
                          ry="3.0"
                          transform={`rotate(-20 ${beatX} ${n.y})`}
                          fill={isSelected ? "#d98a3f" : (b.duration === '1' || b.duration === '2' ? "none" : "#f2ece4")}
                          stroke={isSelected ? "#d98a3f" : "#f2ece4"}
                          strokeWidth="1.4"
                          className="notehead"
                          onClick={() => {
                            selectNote(mIdx, bIdx, n.noteIndex, b.notes);
                          }}
                        />
                        {/* Dotted note dot */}
                        {b.dot && (
                          <circle cx={beatX + 8} cy={n.y} r="2.2" fill="#f2ece4" pointerEvents="none" />
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
                        stroke="#f2ece4"
                        strokeWidth="1.5"
                      />

                      {/* Individual flag for ungrouped 8th/16th */}
                      {!beamInfo && b.duration === '8' && (
                        <path
                          d={stemUp 
                            ? `M ${stemX} ${stemEndY} c 4 3, 7 9, 5 17 c -1 -5, -3 -9, -5 -12` 
                            : `M ${stemX} ${stemEndY} c 4 -3, 7 -9, 5 -17 c -1 5, -3 9, -5 12`
                          }
                          fill="#f2ece4"
                        />
                      )}
                      {!beamInfo && b.duration === '16' && (
                        <g fill="#f2ece4">
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
                    </g>
                  )}

                  {/* B. TAB numbers (fret digits over strings) */}
                  {showTab && b.notes.map((rawNote, noteIndex) => {
                    if (!isFrettedNote(rawNote)) return null;
                    const n = rawNote;
                    const stringY = rowY + TAB_STAFF_TOP + ts + n.stringIndex * 10;
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
                        onClick={() => {
                          selectNote(mIdx, bIdx, noteIndex, b.notes);
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
                                x: getBeatCoordinates(mIdx, i),
                                y: getRowY(mIdx) + TAB_STAFF_TOP + ts + n.stringIndex * 10,
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
                                stroke="#a89f96"
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
                                stroke="#a89f96"
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
                      y1={rowY + TAB_STAFF_TOP + ts + stringCount * 10 + 2}
                      x2={stemUp ? beatX + 4 : beatX - 4}
                      y2={rowY + TAB_STAFF_TOP + ts + stringCount * 10 + 2 + (beamInfo ? 11.5 : 10)}
                      stroke="#6f6862"
                      strokeWidth="1.2"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Palm mute / let ring indicators */}
                  {showTab && b.notes.some(n => n.palmMute) && (
                    <text x={beatX - 12} y={rowY + TAB_STAFF_TOP + ts - 4} className="music-text" fontSize="8" fill="#e0a83f" style={{ pointerEvents: 'none' }}>
                      P.M.
                    </text>
                  )}
                  {showTab && b.notes.some(n => n.letRing) && (
                    <text x={beatX - 12} y={rowY + TAB_STAFF_TOP + ts - 14} className="music-text" fontSize="8" fill="#3fb98a" style={{ pointerEvents: 'none' }}>
                      let ring
                    </text>
                  )}
                </g>
              );
              })}

              {/* Beams for standard notation */}
              {showNotation && beamGroups.map((g, gi) => {
                const firstX = getBeatCoordinates(mIdx, g.startIdx);
                const lastX = getBeatCoordinates(mIdx, g.endIdx);
                const mainStemUp = getBeamStemUp(measure, g);
                const beamY = getBeamY(measure, g, mainStemUp);
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
                    <rect x={firstSX} y={beamY - 2} width={Math.max(lastSX - firstSX, 2)} height="4" fill="#f2ece4" />
                    {/* Secondary beam: over 16th+32nd runs, extended 1/4 way to adjacent 8ths */}
                    {secondarySegments.map((seg, si) => {
                      const segFirstX = getBeatCoordinates(mIdx, seg.start);
                      const segLastX = getBeatCoordinates(mIdx, seg.end);
                      let leftX = segFirstX;
                      let rightX = segLastX;
                      if (seg.start > g.startIdx) {
                        const pb = measure.beats[seg.start - 1];
                        if (pb && !pb.isRest && pb.notes.length > 0 && pb.duration === '8') {
                          const prevX = getBeatCoordinates(mIdx, seg.start - 1);
                          leftX = (prevX + 3 * segFirstX) / 4;
                        }
                      }
                      if (seg.end < g.endIdx) {
                        const nb = measure.beats[seg.end + 1];
                        if (nb && !nb.isRest && nb.notes.length > 0 && nb.duration === '8') {
                          const nextX = getBeatCoordinates(mIdx, seg.end + 1);
                          rightX = (3 * segLastX + nextX) / 4;
                        }
                      }
                      const leftSX = mainStemUp ? leftX + 4 - 0.75 : leftX - 4 - 0.75;
                      const rightSX = mainStemUp ? rightX + 4 + 0.75 : rightX - 4 + 0.75;
                      return (
                        <rect key={`beam16-${gi}-${si}`} x={leftSX} y={beamY - 2 + beamDir * 5} width={Math.max(rightSX - leftSX, 2)} height="4" fill="#f2ece4" />
                      );
                    })}
                    {/* Tertiary beam: over 32nd runs, extended 1/4 way to adjacent 16ths/8ths */}
                    {tertiarySegments.map((seg, si) => {
                      const segFirstX = getBeatCoordinates(mIdx, seg.start);
                      const segLastX = getBeatCoordinates(mIdx, seg.end);
                      let leftX = segFirstX;
                      let rightX = segLastX;
                      if (seg.start > g.startIdx) {
                        const pb = measure.beats[seg.start - 1];
                        if (pb && !pb.isRest && pb.notes.length > 0 && pb.duration !== '32') {
                          const prevX = getBeatCoordinates(mIdx, seg.start - 1);
                          leftX = (prevX + 3 * segFirstX) / 4;
                        }
                      }
                      if (seg.end < g.endIdx) {
                        const nb = measure.beats[seg.end + 1];
                        if (nb && !nb.isRest && nb.notes.length > 0 && nb.duration !== '32') {
                          const nextX = getBeatCoordinates(mIdx, seg.end + 1);
                          rightX = (3 * segLastX + nextX) / 4;
                        }
                      }
                      const leftSX = mainStemUp ? leftX + 4 - 0.75 : leftX - 4 - 0.75;
                      const rightSX = mainStemUp ? rightX + 4 + 0.75 : rightX - 4 + 0.75;
                      return (
                        <rect key={`beam32-${gi}-${si}`} x={leftSX} y={beamY - 2 + beamDir * 10} width={Math.max(rightSX - leftSX, 2)} height="4" fill="#f2ece4" />
                      );
                    })}
                  </g>
                );
              })}

              {/* TAB rhythm beams (connecting the stems below TAB staff) */}
              {showTab && beamGroups.map((g, gi) => {
                const firstX = getBeatCoordinates(mIdx, g.startIdx);
                const lastX = getBeatCoordinates(mIdx, g.endIdx);
                const mainStemUp = getBeamStemUp(measure, g);
                const rhythmY = rowY + TAB_STAFF_TOP + ts + stringCount * 10 + 2 + 10;
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
                      fill="#6f6862"
                    />
                    {secondarySegments.map((seg, si) => {
                      const segFirstX = getBeatCoordinates(mIdx, seg.start);
                      const segLastX = getBeatCoordinates(mIdx, seg.end);
                      let leftX = segFirstX;
                      let rightX = segLastX;
                      if (seg.start > g.startIdx) {
                        const pb = measure.beats[seg.start - 1];
                        if (pb && !pb.isRest && pb.notes.length > 0 && pb.duration === '8') {
                          const prevX = getBeatCoordinates(mIdx, seg.start - 1);
                          leftX = (prevX + 3 * segFirstX) / 4;
                        }
                      }
                      if (seg.end < g.endIdx) {
                        const nb = measure.beats[seg.end + 1];
                        if (nb && !nb.isRest && nb.notes.length > 0 && nb.duration === '8') {
                          const nextX = getBeatCoordinates(mIdx, seg.end + 1);
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
                          fill="#6f6862"
                        />
                      );
                    })}
                    {tertiarySegments.map((seg, si) => {
                      const segFirstX = getBeatCoordinates(mIdx, seg.start);
                      const segLastX = getBeatCoordinates(mIdx, seg.end);
                      let leftX = segFirstX;
                      let rightX = segLastX;
                      if (seg.start > g.startIdx) {
                        const pb = measure.beats[seg.start - 1];
                        if (pb && !pb.isRest && pb.notes.length > 0 && pb.duration !== '32') {
                          const prevX = getBeatCoordinates(mIdx, seg.start - 1);
                          leftX = (prevX + 3 * segFirstX) / 4;
                        }
                      }
                      if (seg.end < g.endIdx) {
                        const nb = measure.beats[seg.end + 1];
                        if (nb && !nb.isRest && nb.notes.length > 0 && nb.duration !== '32') {
                          const nextX = getBeatCoordinates(mIdx, seg.end + 1);
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
                          fill="#6f6862"
                        />
                      );
                    })}
                  </g>
                );
              })}
              </g>
            );
          })}
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
          </div>

          <div className="piano-keyboard">
            <div className="piano-white-row">
              {whiteKeyMidis.map((midi) => (
                <button
                  key={`wk-${midi}`}
                  className={`piano-key white ${activeMidis.has(midi) ? 'active' : ''} ${playbackMidis.has(midi) ? 'playback-active' : ''}`}
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
                className={`piano-key black ${activeMidis.has(midi) ? 'active' : ''} ${playbackMidis.has(midi) ? 'playback-active' : ''}`}
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

          <span className="fretboard-title" style={{ letterSpacing: 0, textTransform: 'none', color: 'var(--text-faint)', fontWeight: 500 }}>
            Click a key to add or remove that pitch on the selected beat
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
            <span className="fretboard-title" style={{ letterSpacing: 0, textTransform: 'none', color: 'var(--text-faint)', fontWeight: 500 }}>
              Click a fret to place a note on the selected beat
            </span>
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
          <label className="transport-field">
            <span>BPM</span>
            <input
              type="number"
              className="control-input"
              value={activeMeasureBpm}
              onChange={(e) => setActiveMeasureBpm(Math.max(20, Math.min(300, parseInt(e.target.value) || 120)))}
            />
          </label>
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
                  {loopPlayback ? 'Looping on' : 'Loop off'}
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
              <div className="popover-divider" />
              <span className="popover-title">Song file</span>
              <button className="btn" onClick={handleExport}>Share JSON</button>
              <button className="btn" onClick={handleImport}>Load JSON</button>
              <div className="popover-divider" />
              <button className="btn btn-danger" onClick={clearSong}>Clear song</button>
            </div>
            )}
          </div>

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
              <span className="popover-title">Beat {activeBeatIndex + 1}</span>
              <button className="btn btn-primary" onClick={insertBeatAfterActive}>Insert beat</button>
              <button className="btn btn-danger" onClick={deleteActiveBeat}>Delete beat</button>
              <div className="popover-divider" />
              <span className="popover-title">Measure {activeMeasureIndex + 1}</span>
              <button className="btn" onClick={addMeasure}>Add measure</button>
              <button className="btn" onClick={insertMeasureAfterActive}>Insert measure</button>
              <button className="btn" onClick={duplicateActiveMeasure}>Duplicate measure</button>
              <button className="btn btn-danger" onClick={deleteActiveMeasure}>Delete measure</button>
            </div>
            )}
          </div>

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
                <span className="popover-title">Staff — {activeTrack.name}</span>
                <div className="control-group">
                  {(isFrettedTrack
                    ? (['both', 'notation', 'tab'] as StaffDisplay[])
                    : (['notation'] as StaffDisplay[])
                  ).map(mode => (
                    <button
                      key={mode}
                      className={`btn ${activeTrack.display === mode ? 'btn-active' : ''}`}
                      onClick={() => updateActiveTrack({ display: mode })}
                      style={{ flex: 1 }}
                    >
                      {mode === 'both' ? 'Both' : mode === 'notation' ? 'Notes' : 'TAB'}
                    </button>
                  ))}
                </div>
                <div className="popover-divider" />
                <button
                  className={`btn ${showFretboard ? 'btn-active' : ''}`}
                  onClick={() => setShowFretboard(prev => !prev)}
                >
                  {isFrettedTrack ? 'Fretboard' : 'Keyboard'}
                </button>
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
              <span><kbd>Space</kbd> Play</span>
              <span><kbd>R</kbd> Rest</span>
              <span><kbd>+</kbd><kbd>-</kbd> Duration</span>
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
                {modalOpen === 'export' ? 'Export Song JSON' : 'Import Song JSON'}
              </span>
              <button className="sheetor-modal-close" onClick={() => setModalOpen(null)}>&times;</button>
            </h3>
            
            <p className="sheetor-modal-desc">
              {modalOpen === 'export' 
                ? 'Copy this JSON representation to share your song, or download it as a file.'
                : 'Paste a song JSON representation here and click load.'}
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
                    Copy Code
                  </button>
                  <button className="btn btn-primary" onClick={downloadJsonFile}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download File
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={executeImport}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Load Song
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
