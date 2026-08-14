import type { BeatPosition, Duration, TabBeat, TabMeasure, TabSong, BeamGroup, TimeSignature } from './types';

// Full 12-string tuning pool (high to low)
// Strings 1-6: standard guitar  [E4, B3, G3, D3, A2, E2]
// Strings 7-12: extended range   [B1, F#1, C#1, G#0, Eb0, Bb-1]
export const allStringPitches = [64, 59, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10];

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

// Transpose MIDI to guitar treble clef (which is written 1 octave higher than sounding)
export const midiToDiatonicAndAccidental = (midi: number) => {
  const writtenMidi = midi + 12;
  const octave = Math.floor(writtenMidi / 12) - 1;
  const pc = pitchClass(writtenMidi);

  const stepOffset = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const accidentals = ['', '#', '', '#', '', '', '#', '', '#', '', '#', ''];

  const diatonicStep = (octave - 4) * 7 + stepOffset[pc];
  const accidental = accidentals[pc];

  return { diatonicStep, accidental };
};

export const Y_of_step = (step: number) => 60 - step * 5;

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

export const createEmptySong = (): TabSong => ({
  title: 'New Sketch',
  artist: 'Unknown Artist',
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  measures: [createEmptyMeasure()]
});

// Measure-level bpm / time signature overrides carry forward until the next override.
export const getEffectiveBpm = (song: TabSong, measureIndex: number): number => {
  for (let i = measureIndex; i >= 0; i--) {
    const bpm = song.measures[i]?.bpm;
    if (typeof bpm === 'number') return bpm;
  }
  return song.bpm;
};

export const getEffectiveTimeSignature = (song: TabSong, measureIndex: number): TimeSignature => {
  for (let i = measureIndex; i >= 0; i--) {
    const ts = song.measures[i]?.timeSignature;
    if (ts) return ts;
  }
  return song.timeSignature;
};

// Number of strings a song needs for every note it contains to have an open
// pitch. Tuning is UI state and is not persisted, so a loaded song must widen
// the tuning instead of rendering notes with an undefined pitch (NaN).
export const requiredStringCount = (song: TabSong, minimum: number): number => {
  let highest = -1;
  for (const measure of song.measures) {
    for (const beat of measure.beats) {
      for (const note of beat.notes) {
        if (note.stringIndex > highest) highest = note.stringIndex;
      }
    }
  }
  return Math.min(allStringPitches.length, Math.max(minimum, highest + 1));
};

// Drops notes stranded above the current string count. Returns the same song
// reference when nothing needs pruning, so callers can skip needless re-renders.
export const pruneNotesToStringCount = (song: TabSong, stringCount: number): TabSong => {
  const needsPrune = song.measures.some(m =>
    m.beats.some(b => b.notes.some(n => n.stringIndex >= stringCount))
  );
  if (!needsPrune) return song;

  return {
    ...song,
    measures: song.measures.map(m => ({
      ...m,
      beats: m.beats.map(b => {
        if (!b.notes.some(n => n.stringIndex >= stringCount)) return b;
        const notes = b.notes.filter(n => n.stringIndex < stringCount);
        return { ...b, notes, isRest: notes.length === 0 };
      })
    }))
  };
};

export const firstBeatPosition = (song: TabSong): BeatPosition | null => {
  for (let m = 0; m < song.measures.length; m++) {
    if (song.measures[m].beats.length > 0) return { measureIndex: m, beatIndex: 0 };
  }
  return null;
};

// Advances one beat. Always terminates: scans forward at most once through the
// song, then wraps at most once, so a song with no playable beat yields null.
export const nextBeatPosition = (song: TabSong, from: BeatPosition, loop: boolean): BeatPosition | null => {
  const current = song.measures[from.measureIndex];
  if (current && from.beatIndex + 1 < current.beats.length) {
    return { measureIndex: from.measureIndex, beatIndex: from.beatIndex + 1 };
  }
  for (let m = from.measureIndex + 1; m < song.measures.length; m++) {
    if (song.measures[m].beats.length > 0) return { measureIndex: m, beatIndex: 0 };
  }
  return loop ? firstBeatPosition(song) : null;
};

// --- SAMPLE SONGS ---

export const sampleSongs: Record<string, TabSong> = {
  "Smoke on the Water": {
    title: "Smoke on the Water",
    artist: "Deep Purple",
    bpm: 110,
    timeSignature: { numerator: 4, denominator: 4 },
    measures: Array.from({ length: 16 }, () => {
      const beat = (fret: number, duration: Duration = '8', stringIdx = 4): TabBeat => ({
        id: createId(),
        duration,
        notes: [{ stringIndex: stringIdx, fret }],
      });
      const rest = (duration: Duration = '8'): TabBeat => ({
        id: createId(),
        duration,
        notes: [],
        isRest: true,
      });
      return {
        id: createId(),
        beats: [beat(3), beat(3), beat(3), rest(), beat(6), beat(6), beat(6), rest(), beat(5), beat(5), beat(5), rest(), beat(3), beat(3), beat(3), rest()],
      };
    }),
  },

  "Nothing Else Matters": {
    title: "Nothing Else Matters",
    artist: "Metallica",
    bpm: 46,
    timeSignature: { numerator: 4, denominator: 4 },
    measures: Array.from({ length: 8 }, () => ({
      id: createId(),
      beats: [
        { id: createId(), duration: '4' as const, notes: [{ stringIndex: 2, fret: 0 }, { stringIndex: 3, fret: 2 }, { stringIndex: 4, fret: 3 }] },
        { id: createId(), duration: '4' as const, notes: [{ stringIndex: 2, fret: 0 }, { stringIndex: 3, fret: 2 }, { stringIndex: 4, fret: 3 }] },
        { id: createId(), duration: '4' as const, notes: [{ stringIndex: 1, fret: 0 }, { stringIndex: 3, fret: 0 }, { stringIndex: 4, fret: 2 }] },
        { id: createId(), duration: '4' as const, notes: [{ stringIndex: 1, fret: 0 }, { stringIndex: 3, fret: 0 }, { stringIndex: 4, fret: 2 }] },
      ],
    })),
  },

  "Stairway to Heaven": {
    title: "Stairway to Heaven",
    artist: "Led Zeppelin",
    bpm: 70,
    timeSignature: { numerator: 4, denominator: 4 },
    measures: Array.from({ length: 12 }, () => ({
      id: createId(),
      beats: [
        { id: createId(), duration: '8' as const, notes: [{ stringIndex: 0, fret: 0 }] },
        { id: createId(), duration: '8' as const, notes: [{ stringIndex: 1, fret: 1 }] },
        { id: createId(), duration: '8' as const, notes: [{ stringIndex: 2, fret: 2 }, { stringIndex: 3, fret: 0 }] },
        { id: createId(), duration: '8' as const, notes: [{ stringIndex: 2, fret: 0 }] },
        { id: createId(), duration: '8' as const, notes: [{ stringIndex: 1, fret: 0 }] },
        { id: createId(), duration: '8' as const, notes: [{ stringIndex: 0, fret: 0 }] },
        { id: createId(), duration: '8' as const, notes: [{ stringIndex: 1, fret: 1 }] },
        { id: createId(), duration: '8' as const, notes: [{ stringIndex: 0, fret: 0 }] },
      ],
    })),
  },
};
