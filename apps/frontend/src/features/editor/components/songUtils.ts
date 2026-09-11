import type {
  BeatPosition,
  Duration,
  FrettedNote,
  InstrumentId,
  TabBeat,
  TabMeasure,
  TabNote,
  NoteTechniques,
  TabSong,
  TabTrack,
  TrackKind,
  BeamGroup,
  TimeSignature,
} from './types';

// Full 12-string tuning pool (high to low)
// Strings 1-6: standard guitar  [E4, B3, G3, D3, A2, E2]
// Strings 7-12: extended range   [B1, F#1, C#1, G#0, Eb0, Bb-1]
export const allStringPitches = [64, 59, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10];

/** Highest fret the model accepts on any string. */
export const MAX_FRET = 24;

/**
 * Tempo range the model accepts. The parse boundary and the editor's controls
 * read the same pair, so a tempo you can type is always a tempo that reloads.
 */
export const MIN_BPM = 20;
export const MAX_BPM = 400;

/**
 * Every technique flag a note can carry. Both the parse boundary and note
 * conversion copy flags one by one, so the list has to live in one place.
 */
export const TECHNIQUE_KEYS = [
  'harmonic',
  'palmMute',
  'letRing',
  'vibrato',
  'ghostNote',
  'slur',
  'legatoSlide',
  'bend',
] as const;

export const getStringPitches = (count: number): number[] => {
  return allStringPitches.slice(0, count);
};

// Helper to convert duration string to beat multiplier (relative to quarter note)
export const getDurationVal = (dur: Duration, dot?: boolean): number => {
  let base: number;
  switch (dur) {
    case '1': base = 4.0; break;
    case '2': base = 2.0; break;
    case '4': base = 1.0; break;
    case '8': base = 0.5; break;
    case '16': base = 0.25; break;
    case '32': base = 0.125; break;
    default: base = 1.0;
  }
  return dot ? base * 1.5 : base;
};

export const getBeatDurationInSeconds = (dur: Duration, dot: boolean | undefined, bpm: number): number => {
  const beatLength = 60 / bpm;
  return getDurationVal(dur, dot) * beatLength;
};

export function computeBeamGroups(beats: TabBeat[], timeSig?: TimeSignature): BeamGroup[] {
  const ts = timeSig || { numerator: 4, denominator: 4 };
  const beatQuarterValue = (ts.denominator === 8 && ts.numerator % 3 === 0) ? 1.5 : 4 / ts.denominator;

  const groups: BeamGroup[] = [];
  let i = 0;
  let beatPos = 0;
  while (i < beats.length) {
    const beat = beats[i];
    if (!beat || beat.isRest || beat.notes.length === 0) {
      beatPos += beat ? getDurationVal(beat.duration, beat.dot) : 0;
      i++;
      continue;
    }
    const dur = beat.duration;
    if (dur === '8' || dur === '16' || dur === '32') {
      const start = i;
      const startPos = beatPos;
      const boundaryLimit = Math.floor(startPos / beatQuarterValue) * beatQuarterValue + beatQuarterValue;
      const maxGroupDur = boundaryLimit - startPos;
      let accumulated = 0;
      let hasEighth = false;
      let hasSixteenth = false;
      while (i < beats.length) {
        const b = beats[i];
        if (!b || b.isRest || b.notes.length === 0) break;
        const bDur = b.duration;
        if (bDur !== '8' && bDur !== '16' && bDur !== '32') break;
        const val = getDurationVal(bDur, b.dot);
        if (accumulated + val > maxGroupDur + 0.001) break;
        accumulated += val;
        if (bDur === '8') hasEighth = true;
        else if (bDur === '16') hasSixteenth = true;
        beatPos += val;
        i++;
      }
      if (i - start >= 2) {
        const gDur: '8' | '16' | '32' = hasEighth ? '8' : hasSixteenth ? '16' : '32';
        groups.push({ startIdx: start, endIdx: i - 1, duration: gDur });
      }
    } else {
      beatPos += getDurationVal(dur, beat.dot);
      i++;
    }
  }
  return groups;
}

// Euclidean modulo: plain `midi % 12` is negative for negative MIDI values.
const pitchClass = (midi: number): number => ((Math.trunc(midi) % 12) + 12) % 12;

export const midiToNoteName = (midi: number): string => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[pitchClass(midi)];
};

export const midiToNoteOctave = (midi: number): string => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return `${names[pitchClass(midi)]}${octave}`;
};

export const noteOctaveToMidi = (noteOctave: string): number => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const match = noteOctave.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 0;
  const noteName = match[1];
  const octave = parseInt(match[2], 10);
  const semitone = names.indexOf(noteName);
  if (semitone === -1) return 0;
  return (octave + 1) * 12 + semitone;
};

export const GUITAR_NOTE_OPTIONS: string[] = (() => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const options: string[] = [];
  for (let midi = 10; midi <= 79; midi++) {
    const octave = Math.floor(midi / 12) - 1;
    options.push(`${names[midi % 12]}${octave}`);
  }
  return options;
})();

/**
 * Sounding MIDI to a staff position. `transpose` is how far the staff is
 * written above what it sounds — 12 for guitar/bass, 0 at concert pitch.
 */
export const midiToDiatonicAndAccidental = (midi: number, transpose: number = 12) => {
  const writtenMidi = midi + transpose;
  const octave = Math.floor(writtenMidi / 12) - 1;
  const pc = pitchClass(writtenMidi);

  const stepOffset = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const accidentals = ['', '#', '', '#', '', '', '#', '', '#', '', '#', ''];

  const diatonicStep = (octave - 4) * 7 + stepOffset[pc];
  const accidental = accidentals[pc];

  return { diatonicStep, accidental };
};

export const Y_of_step = (step: number) => 60 - step * 5;

// Inverse of Y_of_step + midiToDiatonicAndAccidental: a diatonic step on the
// staff back to the pitch we store. Guitar notation is written an octave above
// what it sounds, so the written pitch is dropped by 12 to get the sounding one.
const DIATONIC_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

export const staffStepToSoundingMidi = (step: number, transpose: number = 12): number => {
  const octave = 4 + Math.floor(step / 7);
  const degree = ((step % 7) + 7) % 7;
  const writtenMidi = (octave + 1) * 12 + DIATONIC_SEMITONES[degree];
  return writtenMidi - transpose;
};

export const DURATIONS: readonly Duration[] = ['1', '2', '4', '8', '16', '32'];

export const createId = (): string => Math.random().toString(36).substring(2, 9);

export const createEmptyMeasure = (): TabMeasure => ({
  id: createId(),
  beats: Array.from({ length: 4 }, () => ({
    id: createId(),
    duration: '4' as const,
    notes: [],
    isRest: true
  }))
});

// --- NOTES ---

export const isFrettedNote = (note: TabNote): note is FrettedNote => 'fret' in note;

/**
 * The single place a note becomes a pitch. Pitched tracks carry MIDI directly;
 * fretted tracks resolve through their tuning, which yields undefined for a
 * note stranded above the current string count.
 */
export const resolveNoteMidi = (note: TabNote, track: TabTrack): number | undefined => {
  if (!isFrettedNote(note)) return note.midi;
  const openPitch = track.tuning?.[note.stringIndex];
  if (openPitch === undefined) return undefined;
  const midi = openPitch + note.fret;
  return Number.isFinite(midi) ? midi : undefined;
};

// --- TRACKS ---

// Guitar and bass are notated an octave above what they sound; the rest are
// written at concert pitch.
export const DEFAULT_TRANSPOSE: Record<InstrumentId, number> = {
  guitar: 12, bass: 12,
  piano: 0, trumpet: 0, strings: 0, organ: 0,
  sine: 0, triangle: 0, square: 0, sawtooth: 0,
};

const DEFAULT_TRACK_NAME: Record<InstrumentId, string> = {
  guitar: 'Guitar', bass: 'Bass', piano: 'Piano', trumpet: 'Trumpet',
  strings: 'Strings', organ: 'Organ',
  sine: 'Sine', triangle: 'Triangle', square: 'Square', sawtooth: 'Saw',
};

/**
 * A track's kind follows from its sound: guitar and bass are played on
 * strings, everything else is a pitched staff. Storing the kind separately is
 * what used to let a track claim one thing and render another.
 */
const INSTRUMENT_KIND: Record<InstrumentId, TrackKind> = {
  guitar: 'fretted', bass: 'fretted',
  piano: 'pitched', trumpet: 'pitched', strings: 'pitched', organ: 'pitched',
  sine: 'pitched', triangle: 'pitched', square: 'pitched', sawtooth: 'pitched',
};

export const trackKind = (instrument: InstrumentId): TrackKind => INSTRUMENT_KIND[instrument];

export const isFretted = (track: TabTrack): boolean => trackKind(track.instrument) === 'fretted';

export const createTrack = (
  instrument: InstrumentId,
  barCount: number = 1,
): TabTrack => {
  const fretted = trackKind(instrument) === 'fretted';
  return {
    id: createId(),
    name: DEFAULT_TRACK_NAME[instrument],
    display: fretted ? 'both' : 'notation',
    instrument,
    ...(fretted ? { tuning: getStringPitches(6) } : {}),
    transpose: DEFAULT_TRANSPOSE[instrument],
    volume: 1,
    measures: Array.from({ length: Math.max(1, barCount) }, () => createEmptyMeasure()),
  };
};

/**
 * Nearest playable position for a sounding pitch. Out-of-range pitches clamp
 * to the closest fret rather than vanishing — the cost term keeps any
 * genuinely playable string ahead of a clamped one.
 */
export const placeMidiOnStrings = (midi: number, tuning: number[]): FrettedNote => {
  let best = { stringIndex: 0, fret: 0 };
  let bestCost = Infinity;
  tuning.forEach((openPitch, stringIndex) => {
    const wanted = midi - openPitch;
    const fret = Math.min(Math.max(wanted, 0), MAX_FRET);
    const cost = Math.abs(wanted - fret) * 100 + Math.abs(fret - 3);
    if (cost < bestCost) {
      bestCost = cost;
      best = { stringIndex, fret };
    }
  });
  return best;
};

/**
 * Everything that must change when a track's instrument changes. Crossing the
 * fretted/pitched boundary rewrites every note through its sounding pitch, so
 * the switch can never strand a note the new staff cannot resolve.
 */
export const retuneTrack = (track: TabTrack, instrument: InstrumentId): Partial<TabTrack> => {
  const patch: Partial<TabTrack> = { instrument, transpose: DEFAULT_TRANSPOSE[instrument] };
  const fretted = trackKind(instrument) === 'fretted';
  if (fretted === isFretted(track)) return patch;

  const tuning = fretted ? (track.tuning ?? getStringPitches(6)) : undefined;
  patch.display = fretted ? 'both' : 'notation';
  patch.tuning = tuning;
  patch.measures = track.measures.map(measure => ({
    ...measure,
    beats: measure.beats.map(beat => ({
      ...beat,
      notes: beat.notes.flatMap(note => convertNote(note, track, tuning)),
    })),
  }));
  return patch;
};

/** One note across the fretted/pitched boundary; dropped only if unresolvable. */
const convertNote = (note: TabNote, track: TabTrack, tuning?: number[]): TabNote[] => {
  if (tuning) {
    if (isFrettedNote(note)) return [note];
    return [{ ...techniquesOf(note), ...placeMidiOnStrings(note.midi, tuning) }];
  }
  if (!isFrettedNote(note)) return [note];
  const midi = resolveNoteMidi(note, track);
  if (midi === undefined) return [];
  return [{ ...techniquesOf(note), midi }];
};

/** The technique flags only — the two note shapes share nothing else. */
const techniquesOf = (note: TabNote): NoteTechniques => {
  const flags: NoteTechniques = {};
  for (const key of TECHNIQUE_KEYS) {
    if (note[key]) flags[key] = true;
  }
  return flags;
};

/** A track is heard unless it is muted, or unless some other track is soloed. */
export const isAudible = (track: TabTrack, tracks: TabTrack[]): boolean => {
  if (track.muted) return false;
  const anySoloed = tracks.some(t => t.soloed);
  return !anySoloed || !!track.soloed;
};

/** Every track shares one bar count; short tracks are padded with empty bars. */
export const normalizeTrackLengths = (tracks: TabTrack[]): TabTrack[] => {
  const barCount = tracks.reduce((max, t) => Math.max(max, t.measures.length), 1);
  return tracks.map(track => {
    if (track.measures.length === barCount) return track;
    const padding = Array.from({ length: barCount - track.measures.length }, () => createEmptyMeasure());
    return { ...track, measures: [...track.measures, ...padding] };
  });
};

export const createEmptySong = (): TabSong => ({
  title: 'New Sketch',
  artist: 'Unknown Artist',
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  tracks: [createTrack('guitar', 1)],
});

// Measure-level bpm / time signature overrides carry forward until the next
// override. Track 0 is the conductor, so every track shares one tempo map.
export const getEffectiveBpm = (song: TabSong, measureIndex: number): number => {
  const conductor = song.tracks[0]?.measures ?? [];
  for (let i = measureIndex; i >= 0; i--) {
    const bpm = conductor[i]?.bpm;
    if (typeof bpm === 'number') return bpm;
  }
  return song.bpm;
};

export const getEffectiveTimeSignature = (song: TabSong, measureIndex: number): TimeSignature => {
  const conductor = song.tracks[0]?.measures ?? [];
  for (let i = measureIndex; i >= 0; i--) {
    const ts = conductor[i]?.timeSignature;
    if (ts) return ts;
  }
  return song.timeSignature;
};

// Number of strings a track needs for every fretted note it contains to have an
// open pitch, so a loaded track widens its tuning instead of rendering notes
// with an undefined pitch (NaN).
export const requiredStringCount = (measures: TabMeasure[], minimum: number): number => {
  let highest = -1;
  for (const measure of measures) {
    for (const beat of measure.beats) {
      for (const note of beat.notes) {
        if (isFrettedNote(note) && note.stringIndex > highest) highest = note.stringIndex;
      }
    }
  }
  return Math.min(allStringPitches.length, Math.max(minimum, highest + 1));
};

// Drops fretted notes stranded above the current string count. Returns the same
// array reference when nothing needs pruning, so callers can skip needless
// re-renders.
export const pruneNotesToStringCount = (measures: TabMeasure[], stringCount: number): TabMeasure[] => {
  const stranded = (n: TabNote): boolean => isFrettedNote(n) && n.stringIndex >= stringCount;
  const needsPrune = measures.some(m => m.beats.some(b => b.notes.some(stranded)));
  if (!needsPrune) return measures;

  return measures.map(m => ({
    ...m,
    beats: m.beats.map(b => {
      if (!b.notes.some(stranded)) return b;
      const notes = b.notes.filter(n => !stranded(n));
      return { ...b, notes, isRest: notes.length === 0 };
    })
  }));
};

export const firstBeatPosition = (measures: TabMeasure[]): BeatPosition | null => {
  for (let m = 0; m < measures.length; m++) {
    if (measures[m].beats.length > 0) return { measureIndex: m, beatIndex: 0 };
  }
  return null;
};

// Advances one beat. Always terminates: scans forward at most once through the
// track, then wraps at most once, so a track with no playable beat yields null.
export const nextBeatPosition = (measures: TabMeasure[], from: BeatPosition, loop: boolean): BeatPosition | null => {
  const current = measures[from.measureIndex];
  if (current && from.beatIndex + 1 < current.beats.length) {
    return { measureIndex: from.measureIndex, beatIndex: from.beatIndex + 1 };
  }
  for (let m = from.measureIndex + 1; m < measures.length; m++) {
    if (measures[m].beats.length > 0) return { measureIndex: m, beatIndex: 0 };
  }
  return loop ? firstBeatPosition(measures) : null;
};
