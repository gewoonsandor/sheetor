import { describe, it, expect } from 'vitest';

import type { TabBeat, TabMeasure, TabSong, TabTrack } from '../../../../src/features/editor/components/types';
import {
  computeBeamGroups,
  createEmptyMeasure,
  firstBeatPosition,
  getBeatDurationInSeconds,
  getDurationVal,
  getEffectiveBpm,
  getEffectiveTimeSignature,
  getStringPitches,
  isAudible,
  isFretted,
  isFrettedNote,
  createTrack,
  midiToDiatonicAndAccidental,
  midiToNoteOctave,
  nextBeatPosition,
  normalizeTrackLengths,
  requiredStringCount,
  resolveNoteMidi,
  noteOctaveToMidi,
  retuneTrack,
  trackKind,
  pruneNotesToStringCount,
  staffStepToSoundingMidi,
} from '../../../../src/features/editor/components/songUtils';

const beat = (duration: TabBeat['duration'], notes: TabBeat['notes'] = [{ stringIndex: 0, fret: 3 }]): TabBeat => ({
  id: `b-${duration}-${notes.length}-${Math.random()}`,
  duration,
  notes,
});

const measure = (beats: TabBeat[], extra: Partial<TabMeasure> = {}): TabMeasure => ({
  id: `m-${Math.random()}`,
  beats,
  ...extra,
});

const song = (measures: TabMeasure[], extra: Partial<TabSong> = {}): TabSong => ({
  title: 'T',
  artist: 'A',
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  tracks: [{ ...createTrack('guitar'), measures }],
  ...extra,
});

describe('tuning pool', () => {
  it('slices the six standard guitar pitches', () => {
    expect(getStringPitches(6)).toEqual([64, 59, 55, 50, 45, 40]);
  });
});

describe('durations', () => {
  it('measures a quarter note as one beat', () => {
    expect(getDurationVal('4')).toBe(1);
  });

  it('extends a dotted eighth by half', () => {
    expect(getDurationVal('8', true)).toBe(0.75);
  });

  it('converts a quarter at 120 bpm to half a second', () => {
    expect(getBeatDurationInSeconds('4', false, 120)).toBe(0.5);
  });
});

describe('midi naming', () => {
  it('round-trips concert A', () => {
    expect(noteOctaveToMidi('A4')).toBe(69);
    expect(midiToNoteOctave(69)).toBe('A4');
  });

  it('rejects a name outside A-G', () => {
    expect(noteOctaveToMidi('H9')).toBe(0);
  });

  it('names negative midi values without producing undefined', () => {
    expect(midiToNoteOctave(-1)).toBe('B-2');
  });
});

describe('staffStepToSoundingMidi', () => {
  // Guitar notation sounds an octave below where it is written, so the bottom
  // line of the treble staff (written E4) has to come back as E3, not E4.
  it('returns the sounding pitch, an octave below the written one', () => {
    expect(staffStepToSoundingMidi(2)).toBe(52); // bottom line: written E4 -> E3
    expect(staffStepToSoundingMidi(6)).toBe(59); // middle line: written B4 -> B3
    expect(staffStepToSoundingMidi(10)).toBe(65); // top line: written F5 -> F4
  });

  it('handles ledger positions above and below the staff', () => {
    expect(staffStepToSoundingMidi(0)).toBe(48); // middle C written -> C3
    expect(staffStepToSoundingMidi(-3)).toBe(43); // written G3 -> G2
    expect(staffStepToSoundingMidi(12)).toBe(69); // written A5 -> A4
  });

  it('round-trips every step back through the renderer', () => {
    for (let step = -12; step <= 16; step++) {
      const midi = staffStepToSoundingMidi(step);
      expect(midiToDiatonicAndAccidental(midi).diatonicStep).toBe(step);
      // Natural degrees only — the staff has no position for an accidental.
      expect(midiToDiatonicAndAccidental(midi).accidental).toBe('');
    }
  });
});

describe('computeBeamGroups', () => {
  it('beams four eighths as two per-quarter groups in 4/4', () => {
    const beats = [beat('8'), beat('8'), beat('8'), beat('8')];
    expect(computeBeamGroups(beats, { numerator: 4, denominator: 4 })).toEqual([
      { startIdx: 0, endIdx: 1, duration: '8' },
      { startIdx: 2, endIdx: 3, duration: '8' },
    ]);
  });

  it('leaves a lone eighth unbeamed', () => {
    expect(computeBeamGroups([beat('8'), beat('4')], { numerator: 4, denominator: 4 })).toEqual([]);
  });

  it('beams six eighths as two groups of three in 6/8', () => {
    const beats = [beat('8'), beat('8'), beat('8'), beat('8'), beat('8'), beat('8')];
    expect(computeBeamGroups(beats, { numerator: 6, denominator: 8 })).toEqual([
      { startIdx: 0, endIdx: 2, duration: '8' },
      { startIdx: 3, endIdx: 5, duration: '8' },
    ]);
  });

  it('does not beam rests', () => {
    const rest: TabBeat = { id: 'r', duration: '8', notes: [], isRest: true };
    expect(computeBeamGroups([rest, rest], { numerator: 4, denominator: 4 })).toEqual([]);
  });
});

describe('effective bpm and time signature', () => {
  const s = song([
    measure([beat('4')]),
    measure([beat('4')]),
    measure([beat('4')], { bpm: 90, timeSignature: { numerator: 3, denominator: 4 } }),
    measure([beat('4')]),
  ]);

  it('falls back to the song value before any override', () => {
    expect(getEffectiveBpm(s, 0)).toBe(120);
    expect(getEffectiveTimeSignature(s, 1)).toEqual({ numerator: 4, denominator: 4 });
  });

  it('applies an override from its own measure onward', () => {
    expect(getEffectiveBpm(s, 2)).toBe(90);
    expect(getEffectiveBpm(s, 3)).toBe(90);
    expect(getEffectiveTimeSignature(s, 3)).toEqual({ numerator: 3, denominator: 4 });
  });
});

describe('pruneNotesToStringCount', () => {
  it('drops notes stranded above the string count and re-rests the beat', () => {
    const bars = [measure([beat('4', [{ stringIndex: 7, fret: 5 }])])];
    const pruned = pruneNotesToStringCount(bars, 6);
    expect(pruned[0].beats[0].notes).toEqual([]);
    expect(pruned[0].beats[0].isRest).toBe(true);
  });

  it('keeps notes that still have a string', () => {
    const bars = [measure([beat('4', [{ stringIndex: 5, fret: 5 }, { stringIndex: 7, fret: 5 }])])];
    expect(pruneNotesToStringCount(bars, 6)[0].beats[0].notes).toEqual([{ stringIndex: 5, fret: 5 }]);
  });

  it('leaves pitched notes alone', () => {
    const bars = [measure([beat('4', [{ midi: 60 }])])];
    expect(pruneNotesToStringCount(bars, 6)[0].beats[0].notes).toEqual([{ midi: 60 }]);
  });

  it('returns the same reference when nothing needs pruning', () => {
    const bars = [measure([beat('4', [{ stringIndex: 0, fret: 1 }])])];
    expect(pruneNotesToStringCount(bars, 6)).toBe(bars);
  });
});

describe('requiredStringCount', () => {
  it('keeps the minimum when every note fits', () => {
    expect(requiredStringCount([measure([beat('4', [{ stringIndex: 5, fret: 5 }])])], 6)).toBe(6);
  });

  it('widens to cover the highest string a note uses', () => {
    const bars = [measure([beat('4', [{ stringIndex: 0, fret: 1 }, { stringIndex: 7, fret: 5 }])])];
    expect(requiredStringCount(bars, 6)).toBe(8);
  });

  it('never exceeds the twelve-string pool', () => {
    expect(requiredStringCount([measure([beat('4', [{ stringIndex: 11, fret: 0 }])])], 6)).toBe(12);
  });

  it('never narrows below the requested minimum', () => {
    expect(requiredStringCount([measure([beat('4', [])])], 7)).toBe(7);
  });

  it('ignores pitched notes, which have no string', () => {
    expect(requiredStringCount([measure([beat('4', [{ midi: 60 }])])], 6)).toBe(6);
  });
});

describe('beat positions', () => {
  it('finds the first playable beat', () => {
    expect(firstBeatPosition([measure([]), measure([beat('4')])])).toEqual({ measureIndex: 1, beatIndex: 0 });
  });

  it('walks beats then measures in order', () => {
    const bars = [measure([beat('4'), beat('4')]), measure([beat('4')])];
    expect(nextBeatPosition(bars, { measureIndex: 0, beatIndex: 0 }, false)).toEqual({ measureIndex: 0, beatIndex: 1 });
    expect(nextBeatPosition(bars, { measureIndex: 0, beatIndex: 1 }, false)).toEqual({ measureIndex: 1, beatIndex: 0 });
  });

  it('skips a measure with no beats', () => {
    const bars = [measure([beat('4')]), measure([]), measure([beat('4')])];
    expect(nextBeatPosition(bars, { measureIndex: 0, beatIndex: 0 }, false)).toEqual({ measureIndex: 2, beatIndex: 0 });
  });

  it('ends at the last beat when not looping', () => {
    expect(nextBeatPosition([measure([beat('4')])], { measureIndex: 0, beatIndex: 0 }, false)).toBeNull();
  });

  it('wraps to the first beat when looping', () => {
    const bars = [measure([beat('4')]), measure([beat('4')])];
    expect(nextBeatPosition(bars, { measureIndex: 1, beatIndex: 0 }, true)).toEqual({ measureIndex: 0, beatIndex: 0 });
  });

  it('yields null for a track with no playable beat even when looping', () => {
    const bars = [measure([]), measure([])];
    expect(firstBeatPosition(bars)).toBeNull();
    expect(nextBeatPosition(bars, { measureIndex: 0, beatIndex: 0 }, true)).toBeNull();
  });
});


describe('note pitch resolution', () => {
  const guitar = createTrack('guitar');
  const piano = createTrack('piano');

  it('distinguishes the two note shapes', () => {
    expect(isFrettedNote({ stringIndex: 0, fret: 3 })).toBe(true);
    expect(isFrettedNote({ midi: 60 })).toBe(false);
  });

  it('resolves a fretted note through the track tuning', () => {
    expect(resolveNoteMidi({ stringIndex: 0, fret: 3 }, guitar)).toBe(67); // E4 + 3
    expect(resolveNoteMidi({ stringIndex: 5, fret: 0 }, guitar)).toBe(40); // low E
  });

  it('takes a pitched note at face value', () => {
    expect(resolveNoteMidi({ midi: 60 }, piano)).toBe(60);
  });

  it('yields undefined for a note stranded above the string count', () => {
    expect(resolveNoteMidi({ stringIndex: 9, fret: 0 }, guitar)).toBeUndefined();
  });
});

describe('track defaults', () => {
  it('notates guitar an octave above concert pitch and piano at it', () => {
    expect(createTrack('guitar').transpose).toBe(12);
    expect(createTrack('piano').transpose).toBe(0);
  });

  it('gives fretted tracks a tuning and pitched tracks none', () => {
    expect(createTrack('guitar').tuning).toEqual([64, 59, 55, 50, 45, 40]);
    expect(createTrack('trumpet').tuning).toBeUndefined();
  });

  it('never shows a TAB staff for a pitched track', () => {
    expect(createTrack('piano').display).toBe('notation');
    expect(createTrack('guitar').display).toBe('both');
  });
});

describe('switching a track instrument', () => {
  const withNotes = (track: TabTrack, notes: TabBeat['notes']): TabTrack => ({
    ...track,
    measures: [{ id: 'm', beats: [{ id: 'b', duration: '4', notes }] }],
  });
  const notesOf = (patch: Partial<TabTrack>) => patch.measures?.[0].beats[0].notes ?? [];

  it('derives the kind from the instrument, never from a stored flag', () => {
    expect(trackKind('guitar')).toBe('fretted');
    expect(trackKind('bass')).toBe('fretted');
    expect(trackKind('piano')).toBe('pitched');
    expect(isFretted(createTrack('guitar'))).toBe(true);
    expect(isFretted(createTrack('sawtooth'))).toBe(false);
  });

  it('gives a piano track a TAB staff and strings when it becomes a guitar', () => {
    const patch = retuneTrack(createTrack('piano'), 'guitar');
    expect(patch.display).toBe('both');
    expect(patch.tuning).toEqual([64, 59, 55, 50, 45, 40]);
    expect(patch.transpose).toBe(12);
  });

  it('drops the TAB staff and the strings on the way back', () => {
    const patch = retuneTrack(createTrack('guitar'), 'piano');
    expect(patch.display).toBe('notation');
    expect(patch.tuning).toBeUndefined();
  });

  it('leaves the staff alone when the kind does not change', () => {
    const patch = retuneTrack(createTrack('piano'), 'organ');
    expect(patch).toEqual({ instrument: 'organ', transpose: 0 });
  });

  it('rewrites pitched notes onto strings at the same sounding pitch', () => {
    const piano = withNotes(createTrack('piano'), [{ midi: 67 }, { midi: 40 }]);
    const notes = notesOf(retuneTrack(piano, 'guitar'));
    const guitar = { ...createTrack('guitar'), measures: [] };
    expect(notes.map(n => resolveNoteMidi(n, guitar))).toEqual([67, 40]);
  });

  it('rewrites fretted notes back to absolute pitch', () => {
    const guitar = withNotes(createTrack('guitar'), [{ stringIndex: 0, fret: 3 }]);
    expect(notesOf(retuneTrack(guitar, 'piano'))).toEqual([{ midi: 67 }]);
  });

  it('carries technique flags across the boundary and leaves no stale shape', () => {
    const guitar = withNotes(createTrack('guitar'), [{ stringIndex: 0, fret: 3, vibrato: true }]);
    const [note] = notesOf(retuneTrack(guitar, 'piano'));
    expect(note).toEqual({ midi: 67, vibrato: true });
    expect(isFrettedNote(note)).toBe(false);
  });

  it('clamps a pitch no string can reach instead of losing the note', () => {
    const piano = withNotes(createTrack('piano'), [{ midi: 120 }]);
    const [note] = notesOf(retuneTrack(piano, 'guitar'));
    expect(isFrettedNote(note)).toBe(true);
    expect(note).toEqual({ stringIndex: 0, fret: 24 });
  });
});

describe('transposition', () => {
  it('shifts the staff position by a whole octave', () => {
    const concert = midiToDiatonicAndAccidental(60, 0).diatonicStep;
    const guitar = midiToDiatonicAndAccidental(60, 12).diatonicStep;
    expect(guitar - concert).toBe(7); // one octave = seven diatonic steps
  });

  it('round-trips at concert pitch as well as guitar pitch', () => {
    for (const transpose of [0, 12]) {
      for (let step = -12; step <= 16; step++) {
        const midi = staffStepToSoundingMidi(step, transpose);
        expect(midiToDiatonicAndAccidental(midi, transpose).diatonicStep).toBe(step);
      }
    }
  });

  it('places middle C on the first ledger below for a concert-pitch track', () => {
    expect(staffStepToSoundingMidi(0, 0)).toBe(60);
  });
});

describe('isAudible', () => {
  const plain = createTrack('guitar');
  const muted = { ...createTrack('bass'), muted: true };
  const soloed = { ...createTrack('piano'), soloed: true };

  it('hears every unmuted track when nothing is soloed', () => {
    const tracks = [plain, muted];
    expect(isAudible(plain, tracks)).toBe(true);
    expect(isAudible(muted, tracks)).toBe(false);
  });

  it('silences unsoloed tracks once any track is soloed', () => {
    const tracks = [plain, soloed];
    expect(isAudible(soloed, tracks)).toBe(true);
    expect(isAudible(plain, tracks)).toBe(false);
  });

  it('keeps a muted track silent even when it is also soloed', () => {
    const both = { ...plain, muted: true, soloed: true };
    expect(isAudible(both, [both])).toBe(false);
  });
});

describe('normalizeTrackLengths', () => {
  it('pads short tracks so every track shares one bar count', () => {
    const long = { ...createTrack('guitar'), measures: [createEmptyMeasure(), createEmptyMeasure(), createEmptyMeasure()] };
    const short = { ...createTrack('piano'), measures: [createEmptyMeasure()] };
    const [a, b] = normalizeTrackLengths([long, short]);
    expect(a.measures).toHaveLength(3);
    expect(b.measures).toHaveLength(3);
  });

  it('returns untouched tracks when they already match', () => {
    const track = createTrack('guitar');
    expect(normalizeTrackLengths([track])[0]).toBe(track);
  });
});

describe('createEmptyMeasure', () => {
  it('produces four distinct quarter rests', () => {
    const m = createEmptyMeasure();
    expect(m.beats).toHaveLength(4);
    expect(m.beats.every(b => b.duration === '4' && b.isRest === true && b.notes.length === 0)).toBe(true);
    expect(new Set(m.beats.map(b => b.id)).size).toBe(4);
  });
});
