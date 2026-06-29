import type { TabBeat, TabMeasure, TabSong, BeamGroup } from './types';

// Full 12-string tuning pool (high to low)
// Strings 1-6: standard guitar  [E4, B3, G3, D3, A2, E2]
// Strings 7-12: extended range   [B1, F#1, C#1, G#0, Eb0, Bb-1]
export const allStringPitches = [64, 59, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10];

export const getStringPitches = (count: number): number[] => {
  return allStringPitches.slice(0, count);
};

// Helper to convert duration string to beat multiplier (relative to quarter note)
export const getDurationVal = (dur: '1' | '2' | '4' | '8' | '16', dot?: boolean): number => {
  let base: number;
  switch (dur) {
    case '1': base = 4.0; break;
    case '2': base = 2.0; break;
    case '4': base = 1.0; break;
    case '8': base = 0.5; break;
    case '16': base = 0.25; break;
    default: base = 1.0;
  }
  return dot ? base * 1.5 : base;
};

export const getBeatDurationInSeconds = (dur: '1' | '2' | '4' | '8' | '16', dot: boolean | undefined, bpm: number): number => {
  const beatLength = 60 / bpm;
  return getDurationVal(dur, dot) * beatLength;
};

export function computeBeamGroups(beats: TabBeat[]): BeamGroup[] {
  const groups: BeamGroup[] = [];
  let i = 0;
  while (i < beats.length) {
    const dur = beats[i].duration;
    if (dur === '8' || dur === '16') {
      const start = i;
      while (i < beats.length && beats[i].duration === dur) i++;
      if (i - start >= 2) {
        groups.push({ startIdx: start, endIdx: i - 1, duration: dur });
      }
    } else {
      i++;
    }
  }
  return groups;
}

export const midiToNoteName = (midi: number): string => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[midi % 12];
};

// Transpose MIDI to guitar treble clef (which is written 1 octave higher than sounding)
export const midiToDiatonicAndAccidental = (midi: number) => {
  const writtenMidi = midi + 12;
  const octave = Math.floor(writtenMidi / 12) - 1;
  const pitchClass = writtenMidi % 12;

  const stepOffset = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const accidentals = ['', '#', '', '#', '', '', '#', '', '#', '', '#', ''];

  const diatonicStep = (octave - 4) * 7 + stepOffset[pitchClass];
  const accidental = accidentals[pitchClass];

  return { diatonicStep, accidental };
};

export const Y_of_step = (step: number) => 60 - step * 5;

export const createEmptyMeasure = (): TabMeasure => {
  const mId = Math.random().toString(36).substring(2, 9);
  return {
    id: mId,
    beats: Array.from({ length: 4 }, () => ({
      id: Math.random().toString(36).substring(2, 9),
      duration: '4' as const,
      notes: [],
      isRest: true
    }))
  };
};

// --- SAMPLE SONGS ---

export const sampleSongs: Record<string, TabSong> = {
  "Smoke on the Water": {
    title: "Smoke on the Water",
    artist: "Deep Purple",
    bpm: 110,
    timeSignature: { numerator: 4, denominator: 4 },
    measures: Array.from({ length: 16 }, () => {
      const beat = (fret: number, duration: '1' | '2' | '4' | '8' | '16' = '8', stringIdx = 4): TabBeat => ({
        id: Math.random().toString(36).substring(2, 9),
        duration,
        notes: [{ stringIndex: stringIdx, fret }],
      });
      const rest = (duration: '1' | '2' | '4' | '8' | '16' = '8'): TabBeat => ({
        id: Math.random().toString(36).substring(2, 9),
        duration,
        notes: [],
        isRest: true,
      });
      return {
        id: Math.random().toString(36).substring(2, 9),
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
      id: Math.random().toString(36).substring(2, 9),
      beats: [
        { id: Math.random().toString(36).substring(2, 9), duration: '4' as const, notes: [{ stringIndex: 2, fret: 0 }, { stringIndex: 3, fret: 2 }, { stringIndex: 4, fret: 3 }] },
        { id: Math.random().toString(36).substring(2, 9), duration: '4' as const, notes: [{ stringIndex: 2, fret: 0 }, { stringIndex: 3, fret: 2 }, { stringIndex: 4, fret: 3 }] },
        { id: Math.random().toString(36).substring(2, 9), duration: '4' as const, notes: [{ stringIndex: 1, fret: 0 }, { stringIndex: 3, fret: 0 }, { stringIndex: 4, fret: 2 }] },
        { id: Math.random().toString(36).substring(2, 9), duration: '4' as const, notes: [{ stringIndex: 1, fret: 0 }, { stringIndex: 3, fret: 0 }, { stringIndex: 4, fret: 2 }] },
      ],
    })),
  },

  "Stairway to Heaven": {
    title: "Stairway to Heaven",
    artist: "Led Zeppelin",
    bpm: 70,
    timeSignature: { numerator: 4, denominator: 4 },
    measures: Array.from({ length: 12 }, () => ({
      id: Math.random().toString(36).substring(2, 9),
      beats: [
        { id: Math.random().toString(36).substring(2, 9), duration: '8' as const, notes: [{ stringIndex: 0, fret: 0 }] },
        { id: Math.random().toString(36).substring(2, 9), duration: '8' as const, notes: [{ stringIndex: 1, fret: 1 }] },
        { id: Math.random().toString(36).substring(2, 9), duration: '8' as const, notes: [{ stringIndex: 2, fret: 2 }, { stringIndex: 3, fret: 0 }] },
        { id: Math.random().toString(36).substring(2, 9), duration: '8' as const, notes: [{ stringIndex: 2, fret: 0 }] },
        { id: Math.random().toString(36).substring(2, 9), duration: '8' as const, notes: [{ stringIndex: 1, fret: 0 }] },
        { id: Math.random().toString(36).substring(2, 9), duration: '8' as const, notes: [{ stringIndex: 0, fret: 0 }] },
        { id: Math.random().toString(36).substring(2, 9), duration: '8' as const, notes: [{ stringIndex: 1, fret: 1 }] },
        { id: Math.random().toString(36).substring(2, 9), duration: '8' as const, notes: [{ stringIndex: 0, fret: 0 }] },
      ],
    })),
  },
};
