import { describe, it, expect } from 'vitest';

import type { TabBeat, TabMeasure, TabSong } from './types';
import {
  computeBeamGroups,
  createEmptyMeasure,
  firstBeatPosition,
  getBeatDurationInSeconds,
  getDurationVal,
  getEffectiveBpm,
  getEffectiveTimeSignature,
  getStringPitches,
  midiToNoteOctave,
  nextBeatPosition,
  requiredStringCount,
  noteOctaveToMidi,
  pruneNotesToStringCount,
} from './songUtils';

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
  measures,
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
    const s = song([measure([beat('4', [{ stringIndex: 7, fret: 5 }])])]);
    const pruned = pruneNotesToStringCount(s, 6);
    expect(pruned.measures[0].beats[0].notes).toEqual([]);
    expect(pruned.measures[0].beats[0].isRest).toBe(true);
  });

  it('keeps notes that still have a string', () => {
    const s = song([measure([beat('4', [{ stringIndex: 5, fret: 5 }, { stringIndex: 7, fret: 5 }])])]);
    expect(pruneNotesToStringCount(s, 6).measures[0].beats[0].notes).toEqual([{ stringIndex: 5, fret: 5 }]);
  });

  it('returns the same reference when nothing needs pruning', () => {
    const s = song([measure([beat('4', [{ stringIndex: 0, fret: 1 }])])]);
    expect(pruneNotesToStringCount(s, 6)).toBe(s);
  });
});

describe('requiredStringCount', () => {
  it('keeps the minimum when every note fits', () => {
    const s = song([measure([beat('4', [{ stringIndex: 5, fret: 5 }])])]);
    expect(requiredStringCount(s, 6)).toBe(6);
  });

  it('widens to cover the highest string a note uses', () => {
    const s = song([measure([beat('4', [{ stringIndex: 0, fret: 1 }, { stringIndex: 7, fret: 5 }])])]);
    expect(requiredStringCount(s, 6)).toBe(8);
  });

  it('never exceeds the twelve-string pool', () => {
    const s = song([measure([beat('4', [{ stringIndex: 11, fret: 0 }])])]);
    expect(requiredStringCount(s, 6)).toBe(12);
  });

  it('never narrows below the requested minimum', () => {
    const s = song([measure([beat('4', [])])]);
    expect(requiredStringCount(s, 7)).toBe(7);
  });
});

describe('beat positions', () => {
  it('finds the first playable beat', () => {
    const s = song([measure([]), measure([beat('4')])]);
    expect(firstBeatPosition(s)).toEqual({ measureIndex: 1, beatIndex: 0 });
  });

  it('walks beats then measures in order', () => {
    const s = song([measure([beat('4'), beat('4')]), measure([beat('4')])]);
    expect(nextBeatPosition(s, { measureIndex: 0, beatIndex: 0 }, false)).toEqual({ measureIndex: 0, beatIndex: 1 });
    expect(nextBeatPosition(s, { measureIndex: 0, beatIndex: 1 }, false)).toEqual({ measureIndex: 1, beatIndex: 0 });
  });

  it('skips a measure with no beats', () => {
    const s = song([measure([beat('4')]), measure([]), measure([beat('4')])]);
    expect(nextBeatPosition(s, { measureIndex: 0, beatIndex: 0 }, false)).toEqual({ measureIndex: 2, beatIndex: 0 });
  });

  it('ends at the last beat when not looping', () => {
    const s = song([measure([beat('4')])]);
    expect(nextBeatPosition(s, { measureIndex: 0, beatIndex: 0 }, false)).toBeNull();
  });

  it('wraps to the first beat when looping', () => {
    const s = song([measure([beat('4')]), measure([beat('4')])]);
    expect(nextBeatPosition(s, { measureIndex: 1, beatIndex: 0 }, true)).toEqual({ measureIndex: 0, beatIndex: 0 });
  });

  it('yields null for a song with no playable beat even when looping', () => {
    const s = song([measure([]), measure([])]);
    expect(firstBeatPosition(s)).toBeNull();
    expect(nextBeatPosition(s, { measureIndex: 0, beatIndex: 0 }, true)).toBeNull();
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
