import type {
  BeatPosition,
  Clef,
  Duration,
  FrettedNote,
  InstrumentId,
  TabBeat,
  TabMeasure,
  TabNote,
  NoteTechniques,
  StaffDisplay,
  TabSong,
  TabTrack,
  TrackKind,
  BeamGroup,
  TimeSignature,
} from './types';

/** Most strings a fretted track may have. */
export const MAX_STRINGS = 12;

/** Lowest open-string pitch a tuning can be set to (A#-1). */
const LOWEST_TUNING_NOTE = 10;

// Named tunings, open strings high to low. `Standard` is where a new track starts.
const GUITAR_TUNINGS: Record<string, number[]> = {
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

const BASS_TUNINGS: Record<string, number[]> = {
  'Standard': [43, 38, 33, 28],
  'Drop D': [43, 38, 33, 26],
  'Half step down': [42, 37, 32, 27],
  'Full step down': [41, 36, 31, 26],
  '5-string': [43, 38, 33, 28, 23],
  '6-string': [48, 43, 38, 33, 28, 23],
};

export const tuningPresets = (instrument: InstrumentId): Record<string, number[]> =>
  instrument === 'bass' ? BASS_TUNINGS : GUITAR_TUNINGS;

export const defaultTuning = (instrument: InstrumentId): number[] => [...tuningPresets(instrument).Standard];

/** A tuning cut or extended to `count` strings; each added string is a fourth below the last. */
export const resizeTuning = (tuning: number[], count: number): number[] => {
  const next = tuning.slice(0, count);
  while (next.length < count) {
    next.push(Math.max(LOWEST_TUNING_NOTE, (next[next.length - 1] ?? 69) - 5));
  }
  return next;
};

/** Highest fret the model accepts on any string. */
export const MAX_FRET = 24;

/**
 * Tempo range the model accepts. The parse boundary and the editor's controls
 * read the same pair, so a tempo you can type is always a tempo that reloads.
 */
export const MIN_BPM = 20;
export const MAX_BPM = 400;

/** How many times a repeated section may play in all; a single play is no repeat. */
export const MIN_REPEAT = 2;
export const MAX_REPEAT = 99;

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
  for (let midi = LOWEST_TUNING_NOTE; midi <= 79; midi++) {
    const octave = Math.floor(midi / 12) - 1;
    options.push(`${names[midi % 12]}${octave}`);
  }
  return options;
})();

// The letters C..B as semitones above C; a staff step's letter is the step mod 7.
const DIATONIC_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

const letterOf = (step: number): number => ((step % 7) + 7) % 7;

/** The widest key signature either way: a key is sharps when positive, flats when negative. */
export const MAX_KEY_ACCIDENTALS = 7;

const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];  // B E A D G C F

/** How a key alters each letter C..B: 1 sharp, -1 flat, 0 natural. */
export const keyAlterations = (key: number): number[] => {
  const alterations = [0, 0, 0, 0, 0, 0, 0];
  for (const letter of (key > 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, Math.abs(key))) {
    alterations[letter] = Math.sign(key);
  }
  return alterations;
};

/** Where a key signature's accidentals sit on a treble staff, in the order they are written. */
export const keySignatureSteps = (key: number): number[] =>
  (key > 0 ? [10, 7, 11, 8, 5, 9, 6] : [6, 9, 5, 8, 4, 7, 3]).slice(0, Math.abs(key));

/** A written note: its line or space (0 = middle C), and the sharp (1) or flat (-1) it carries. */
export interface SpelledPitch {
  diatonicStep: number;
  alteration: number;
}

/**
 * Sounding MIDI to a staff position. `transpose` is how far the staff is
 * written above what it sounds — 12 for guitar/bass, 0 at concert pitch. A
 * pitch the key has takes the key's spelling (B♭ in F major sits on the B
 * line); any other is its white key, or a black key spelled toward the key's
 * side, sharp in sharp keys and C major, flat in flat keys.
 */
export const spellPitch = (midi: number, transpose: number = 12, key: number = 0): SpelledPitch => {
  const written = midi + transpose;
  const pc = pitchClass(written);
  const inKey = keyAlterations(key);
  let letter = DIATONIC_SEMITONES.findIndex((semitone, l) => pitchClass(semitone + inKey[l]) === pc);
  let alteration = letter === -1 ? 0 : inKey[letter];
  if (letter === -1) letter = DIATONIC_SEMITONES.indexOf(pc);
  if (letter === -1) {
    alteration = key < 0 ? -1 : 1;
    letter = DIATONIC_SEMITONES.indexOf(pc - alteration);
  }
  // The octave is the letter's own: C♭5 sounds as B4 but sits with the C5s.
  const octave = Math.floor((written - alteration) / 12) - 1;
  return { diatonicStep: (octave - 4) * 7 + letter, alteration };
};

export const Y_of_step = (step: number) => 60 - step * 5;

/**
 * Inverse of Y_of_step + spellPitch: a staff step back to the pitch we store,
 * as the key reads it (the F line is F♯ in G major). Guitar notation is written
 * an octave above what it sounds, so the written pitch is dropped by 12.
 */
export const staffStepToSoundingMidi = (step: number, transpose: number = 12, key: number = 0): number => {
  const octave = 4 + Math.floor(step / 7);
  const letter = letterOf(step);
  return (octave + 1) * 12 + DIATONIC_SEMITONES[letter] + keyAlterations(key)[letter] - transpose;
};

/**
 * The accidental each note of a bar is written with, per beat and note: null
 * where the key signature, or an earlier note on the same line or space in
 * this bar, already says it; otherwise 1 (♯), -1 (♭) or 0 (♮).
 */
export const barAccidentals = (beats: SpelledPitch[][], key: number): (number | null)[][] => {
  const inKey = keyAlterations(key);
  const current = new Map<number, number>();
  return beats.map(notes => notes.map(({ diatonicStep, alteration }) => {
    const before = current.get(diatonicStep) ?? inKey[letterOf(diatonicStep)];
    current.set(diatonicStep, alteration);
    return alteration === before ? null : alteration;
  }));
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
export const resolveNoteMidi = (note: TabNote, track: Pick<TabTrack, 'tuning'>): number | undefined => {
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

/** The staves each kind can draw; the first is where a track of that kind starts. */
export const STAFF_DISPLAYS: Record<TrackKind, readonly StaffDisplay[]> = {
  fretted: ['both', 'notation', 'tab'],
  pitched: ['notation'],
};

/** Middle C: turning on a grand staff moves every note below it to the bass staff. */
export const GRAND_SPLIT = 60;

/** A grand staff's two tracks, by index: the treble staff's and the bass staff's. */
export interface GrandStaff {
  treble: number;
  bass: number;
}

/**
 * The grand staff a track belongs to, as either hand. The link is checked where
 * it is read, so a deleted track, a fretted instrument or a chain of links just
 * means no grand staff, and no edit has to repair it.
 */
export const grandStaffOf = (tracks: TabTrack[], index: number): GrandStaff | null => {
  const pairAt = (treble: number): GrandStaff | null => {
    const upper = tracks[treble];
    const bass = tracks.findIndex(t => t.id === upper?.bassTrack);
    if (bass === -1 || bass === treble) return null;
    if (isFretted(upper) || isFretted(tracks[bass]) || tracks[bass].bassTrack !== undefined) return null;
    // Two tracks naming one bass track: the first keeps it.
    return tracks.findIndex(t => t.bassTrack === upper.bassTrack) === treble ? { treble, bass } : null;
  };
  return pairAt(index) ?? pairAt(tracks.findIndex(t => t.bassTrack !== undefined && t.bassTrack === tracks[index]?.id));
};

/**
 * Turns a pitched track into a grand staff: a new track right after it takes
 * every note below middle C onto the bass staff, keeping the rhythm, so the two
 * hands start out exactly as written and can then part ways.
 */
export const addBassStaff = (song: TabSong, index: number): TabSong => {
  const upper = song.tracks[index];
  if (!upper || isFretted(upper) || grandStaffOf(song.tracks, index)) return song;
  const keep = (low: boolean, fresh: boolean): TabMeasure[] => upper.measures.map(measure => {
    const bar: TabMeasure = {
      ...measure,
      ...(fresh ? { id: createId() } : {}),
      beats: measure.beats.map(beat => {
        const notes = beat.notes.filter(n => ((resolveNoteMidi(n, upper) ?? GRAND_SPLIT) < GRAND_SPLIT) === low);
        return { ...beat, ...(fresh ? { id: createId() } : {}), notes, isRest: notes.length === 0 };
      }),
    };
    // The left hand reads its own clefs, never the right hand's.
    if (low) delete bar.clef;
    return bar;
  });
  const bass: TabTrack = { ...upper, id: createId(), name: `${upper.name} (left hand)`, measures: keep(true, true) };
  // A link left over from a deleted left hand must not come along.
  delete bass.bassTrack;
  delete bass.clef;
  const tracks = [...song.tracks];
  tracks.splice(index, 1, { ...upper, bassTrack: bass.id, measures: keep(false, false) }, bass);
  return { ...song, tracks };
};

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
    ...(fretted ? { tuning: defaultTuning(instrument) } : {}),
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
 * Everything that must change when a track's instrument changes. A fretted
 * instrument brings its own strings (a bass its four), and every note is
 * rewritten through its sounding pitch, so the switch can never strand a note
 * the new staff cannot resolve.
 */
export const retuneTrack = (track: TabTrack, instrument: InstrumentId): Partial<TabTrack> => {
  const patch: Partial<TabTrack> = { instrument, transpose: DEFAULT_TRANSPOSE[instrument] };
  // A name nobody chose follows the instrument; one the user typed stays.
  if (track.name === DEFAULT_TRACK_NAME[track.instrument]) patch.name = DEFAULT_TRACK_NAME[instrument];
  const fretted = trackKind(instrument) === 'fretted';
  if (!fretted && !isFretted(track)) return patch;

  const tuning = fretted ? defaultTuning(instrument) : undefined;
  if (fretted !== isFretted(track)) patch.display = fretted ? 'both' : 'notation';
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

/** One note onto new strings, or off strings altogether; dropped only if unresolvable. */
const convertNote = (note: TabNote, track: TabTrack, tuning?: number[]): TabNote[] => {
  const midi = resolveNoteMidi(note, track);
  if (midi === undefined) return [];
  return [{ ...techniquesOf(note), ...(tuning ? placeMidiOnStrings(midi, tuning) : { midi }) }];
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

export const sameTimeSignature = (a: TimeSignature, b: TimeSignature): boolean =>
  a.numerator === b.numerator && a.denominator === b.denominator;

/**
 * The conductor's bars as the score marks them: a tempo or metre override that restates what is
 * already in force changes nothing, so it is left out and draws no mark and takes no room.
 */
export const conductorChanges = (song: TabSong): TabMeasure[] => {
  let bpm = song.bpm;
  let metre = song.timeSignature;
  return (song.tracks[0]?.measures ?? []).map(measure => {
    const sameBpm = measure.bpm === bpm;
    const sameMetre = measure.timeSignature !== undefined && sameTimeSignature(measure.timeSignature, metre);
    bpm = measure.bpm ?? bpm;
    metre = measure.timeSignature ?? metre;
    if (!sameBpm && !sameMetre) return measure;
    const marks = { ...measure };
    if (sameBpm) delete marks.bpm;
    if (sameMetre) delete marks.timeSignature;
    return marks;
  });
};

/** A track's clef at every bar: a change holds until the next; `opening` stands in when the track sets none. */
export const getEffectiveClefs = (track: TabTrack, opening: Clef): Clef[] => {
  let clef = track.clef ?? opening;
  return track.measures.map(measure => {
    clef = measure.clef ?? clef;
    return clef;
  });
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
  return Math.min(MAX_STRINGS, Math.max(minimum, highest + 1));
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

/**
 * The bar a :‖ at `endIndex` sends playback back to: its ‖:, or without one
 * the bar after the previous :‖, or else the start of the song.
 */
export const repeatStartFor = (conductor: TabMeasure[], endIndex: number): number => {
  for (let m = endIndex; m > 0; m--) {
    if (conductor[m]?.repeatStart || conductor[m - 1]?.repeatEnd) return m;
  }
  return 0;
};

/**
 * The next beat to play, honouring the conductor's repeat marks. `passes`
 * counts how often each :‖ has been reached and is updated in place; a
 * finished repeat forgets its count, so a looped song plays it in full again.
 */
export const nextPlayPosition = (
  measures: TabMeasure[],
  conductor: TabMeasure[],
  from: BeatPosition,
  loop: boolean,
  passes: Map<number, number>,
): BeatPosition | null => {
  const bar = from.measureIndex;
  const leavingBar = from.beatIndex + 1 >= (measures[bar]?.beats.length ?? 0);
  const times = conductor[bar]?.repeatEnd ?? 1;
  if (leavingBar && times > 1) {
    const played = passes.get(bar) ?? 1;
    if (played < times) {
      passes.set(bar, played + 1);
      return { measureIndex: repeatStartFor(conductor, bar), beatIndex: 0 };
    }
    passes.delete(bar);
  }
  return nextBeatPosition(measures, from, loop);
};

// --- SELECTION & CLIPBOARD ---

/** The two ends of a selection in score order. */
export const orderRange = (a: BeatPosition, b: BeatPosition): [BeatPosition, BeatPosition] =>
  a.measureIndex < b.measureIndex || (a.measureIndex === b.measureIndex && a.beatIndex <= b.beatIndex)
    ? [a, b]
    : [b, a];

/** The first and last beat of bar `m` that the selection `from`..`to` covers. */
export const beatSpan = (m: number, beatCount: number, from: BeatPosition, to: BeatPosition): [number, number] => [
  m === from.measureIndex ? from.beatIndex : 0,
  m === to.measureIndex ? to.beatIndex : beatCount - 1,
];

/** Where a beat starts in its bar, in quarter notes. */
export const beatOnset = (measure: TabMeasure, beatIndex: number): number =>
  measure.beats.slice(0, beatIndex).reduce((at, b) => at + getDurationVal(b.duration, b.dot), 0);

/** The beat of a bar still sounding `time` quarter notes in, or -1 once the bar is over. */
export const beatAt = (measure: TabMeasure, time: number): number => {
  let end = 0;
  return measure.beats.findIndex(b => (end += getDurationVal(b.duration, b.dot)) > time);
};

const coversWholeBars = (measures: TabMeasure[], from: BeatPosition, to: BeatPosition): boolean =>
  from.beatIndex === 0 && to.beatIndex === (measures[to.measureIndex]?.beats.length ?? 0) - 1;

/** Beats lifted out of one track, bar by bar, with the tuning that gives them pitch. */
export interface Clip {
  bars: TabBeat[][];
  /** The selection ran from a bar's first beat to a bar's last, so it pastes as bars. */
  wholeBars: boolean;
  tuning?: number[];
}

export const copyBeats = (track: TabTrack, from: BeatPosition, to: BeatPosition): Clip => ({
  bars: track.measures.slice(from.measureIndex, to.measureIndex + 1).map((measure, i) => {
    const [first, last] = beatSpan(from.measureIndex + i, measure.beats.length, from, to);
    return measure.beats.slice(first, last + 1);
  }),
  wholeBars: coversWholeBars(track.measures, from, to),
  tuning: track.tuning,
});

/**
 * A copied note as `target` should hold it. A fretted note keeps its string
 * wherever that string has the same open pitch; otherwise it travels by
 * sounding pitch, like a track changing instrument.
 */
const revoice = (note: TabNote, tuning: number[] | undefined, target: TabTrack): TabNote[] => {
  const fretted = isFretted(target);
  const keeps = isFrettedNote(note)
    ? fretted && target.tuning?.[note.stringIndex] === tuning?.[note.stringIndex]
    : !fretted;
  if (keeps) return [{ ...note }];
  const midi = resolveNoteMidi(note, { tuning });
  if (midi === undefined) return [];
  // ponytail: each note is placed on its own, so two notes of a chord can land on one string.
  return [fretted
    ? { ...techniquesOf(note), ...placeMidiOnStrings(midi, target.tuning ?? []) }
    : { ...techniquesOf(note), midi }];
};

/**
 * Inserts a clip after the beat at `at` on one track: whole bars as new bars
 * after its bar (every track gains them, so the score stays aligned), anything
 * else as beats inside it. The cursor belongs on the last thing pasted.
 */
export const pasteClip = (
  song: TabSong,
  trackIndex: number,
  at: BeatPosition,
  clip: Clip,
): { song: TabSong; cursor: BeatPosition } => {
  const target = song.tracks[trackIndex];
  const fresh = (beat: TabBeat): TabBeat => {
    const notes = beat.notes.flatMap(note => revoice(note, clip.tuning, target));
    return notes.length > 0 ? { ...beat, id: createId(), notes } : { ...beat, id: createId(), notes, isRest: true };
  };

  if (clip.wholeBars) {
    const bars: TabMeasure[] = clip.bars.map(beats => ({ id: createId(), beats: beats.map(fresh) }));
    const insertAt = at.measureIndex + 1;
    const tracks = song.tracks.map((track, i) => {
      const measures = [...track.measures];
      measures.splice(insertAt, 0, ...(i === trackIndex ? bars : bars.map(() => createEmptyMeasure())));
      return { ...track, measures };
    });
    return { song: { ...song, tracks }, cursor: { measureIndex: insertAt + bars.length - 1, beatIndex: 0 } };
  }

  const beats = clip.bars.flat().map(fresh);
  const measures = target.measures.map((measure, m) => {
    if (m !== at.measureIndex) return measure;
    const next = [...measure.beats];
    next.splice(at.beatIndex + 1, 0, ...beats);
    return { ...measure, beats: next };
  });
  return {
    song: { ...song, tracks: song.tracks.map((track, i) => (i === trackIndex ? { ...track, measures } : track)) },
    cursor: { measureIndex: at.measureIndex, beatIndex: at.beatIndex + beats.length },
  };
};

/**
 * Deletes beats `from`..`to` from one track. Whole bars leave every track (the
 * song keeps one bar at least); a bar the cut empties keeps a single rest.
 */
export const removeBeats = (song: TabSong, trackIndex: number, from: BeatPosition, to: BeatPosition): TabSong => {
  const inside = (m: number): boolean => m >= from.measureIndex && m <= to.measureIndex;

  if (coversWholeBars(song.tracks[trackIndex].measures, from, to)) {
    return {
      ...song,
      tracks: song.tracks.map(track => {
        const measures = track.measures.filter((_, m) => !inside(m));
        return { ...track, measures: measures.length > 0 ? measures : [createEmptyMeasure()] };
      }),
    };
  }

  const cut = (measure: TabMeasure, m: number): TabMeasure => {
    if (!inside(m)) return measure;
    const [first, last] = beatSpan(m, measure.beats.length, from, to);
    const beats = [...measure.beats.slice(0, first), ...measure.beats.slice(last + 1)];
    const rest: TabBeat = { id: createId(), duration: measure.beats[first].duration, notes: [], isRest: true };
    return { ...measure, beats: beats.length > 0 ? beats : [rest] };
  };
  return {
    ...song,
    tracks: song.tracks.map((track, i) => (i === trackIndex ? { ...track, measures: track.measures.map(cut) } : track)),
  };
};

/** A cursor named by the song's stable ids; null where it sits on nothing yet. */
export interface CursorIds {
  trackId: string;
  measureId: string | null;
  beatId: string | null;
}

export interface CursorIndices {
  trackIndex: number;
  measureIndex: number;
  beatIndex: number;
}

const clampIndex = (index: number, length: number): number =>
  Math.max(0, Math.min(index, length - 1));

/**
 * Where a cursor lands after the song changed underneath it: on the same track,
 * bar and beat by id, so a collaborator inserting a bar before it does not move
 * it. Whatever vanished falls back to the old index, clamped into range.
 */
export const locateCursor = (song: TabSong, ids: CursorIds, fallback: CursorIndices): CursorIndices => {
  const foundTrack = song.tracks.findIndex(t => t.id === ids.trackId);
  const trackIndex = foundTrack !== -1 ? foundTrack : clampIndex(fallback.trackIndex, song.tracks.length);
  const measures = song.tracks[trackIndex]?.measures ?? [];

  const foundMeasure = measures.findIndex(m => m.id === ids.measureId);
  const measureIndex = foundMeasure !== -1 ? foundMeasure : clampIndex(fallback.measureIndex, measures.length);
  const beats = measures[measureIndex]?.beats ?? [];

  const foundBeat = beats.findIndex(b => b.id === ids.beatId);
  const beatIndex = foundBeat !== -1 ? foundBeat : clampIndex(fallback.beatIndex, beats.length);
  return { trackIndex, measureIndex, beatIndex };
};
