import { describe, it, expect } from 'vitest';

import type { BeatPosition, TabBeat, TabMeasure, TabSong, TabTrack } from '../../../../src/features/editor/components/types';
import {
  computeBeamGroups,
  createEmptyMeasure,
  firstBeatPosition,
  getBeatDurationInSeconds,
  getDurationVal,
  getEffectiveBpm,
  getEffectiveTimeSignature,
  isAudible,
  isFretted,
  isFrettedNote,
  createTrack,
  spellPitch,
  barAccidentals,
  midiToNoteOctave,
  nextBeatPosition,
  nextPlayPosition,
  copyBeats,
  pasteClip,
  removeBeats,
  locateCursor,
  normalizeTrackLengths,
  requiredStringCount,
  resolveNoteMidi,
  noteOctaveToMidi,
  resizeTuning,
  retuneTrack,
  trackKind,
  pruneNotesToStringCount,
  staffStepToSoundingMidi,
  addBassStaff,
  grandStaffOf,
  beatAt,
  beatOnset,
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

describe('resizeTuning', () => {
  it('adds each new string a fourth below the lowest, whatever the instrument', () => {
    expect(resizeTuning([64, 59, 55, 50, 45, 40], 8)).toEqual([64, 59, 55, 50, 45, 40, 35, 30]);
    expect(resizeTuning([43, 38, 33, 28], 5)).toEqual([43, 38, 33, 28, 23]);
  });

  it('removes strings from the low end', () => {
    expect(resizeTuning([43, 38, 33, 28, 23], 4)).toEqual([43, 38, 33, 28]);
  });

  it('never goes below the lowest note a string can be tuned to', () => {
    expect(resizeTuning([20], 4)).toEqual([20, 15, 10, 10]);
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
      expect(spellPitch(midi).diatonicStep).toBe(step);
      // Natural degrees only — the staff has no position for an accidental.
      expect(spellPitch(midi).alteration).toBe(0);
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

describe('repeats', () => {
  /** Bar indices a single-track song plays through, beat by beat, from its first beat. */
  const walk = (bars: TabMeasure[]): number[] => {
    const passes = new Map<number, number>();
    const played: number[] = [];
    let at: BeatPosition | null = { measureIndex: 0, beatIndex: 0 };
    while (at && played.length < 50) {
      played.push(at.measureIndex);
      at = nextPlayPosition(bars, bars, at, false, passes);
    }
    return played;
  };

  it('plays a section the chosen number of times, then carries on', () => {
    const bars = [
      measure([beat('4')]),
      measure([beat('4'), beat('4')], { repeatStart: true }),
      measure([beat('4')], { repeatEnd: 3 }),
      measure([beat('4')]),
    ];
    expect(walk(bars)).toEqual([0, 1, 1, 2, 1, 1, 2, 1, 1, 2, 3]);
  });

  it('goes back to the previous repeat end, or the top, when no start is marked', () => {
    const bars = [
      measure([beat('4')], { repeatEnd: 2 }),
      measure([beat('4')]),
      measure([beat('4')], { repeatEnd: 2 }),
    ];
    expect(walk(bars)).toEqual([0, 0, 1, 2, 1, 2]);
  });
});

describe('clipboard', () => {
  const riff = () => song([
    measure([beat('4', [{ stringIndex: 0, fret: 3 }]), beat('4', [{ stringIndex: 5, fret: 0 }])]),
    measure([beat('2', [{ stringIndex: 1, fret: 1 }])]),
  ]);
  const frets = (track: TabTrack) => track.measures.map(m => m.beats.map(b => b.notes));

  it('pastes whole bars as new bars on every track, with fresh ids', () => {
    const start = riff();
    start.tracks.push({ ...createTrack('bass'), measures: [createEmptyMeasure(), createEmptyMeasure()] });
    const clip = copyBeats(start.tracks[0], { measureIndex: 0, beatIndex: 0 }, { measureIndex: 0, beatIndex: 1 });
    const { song: next, cursor } = pasteClip(start, 0, { measureIndex: 1, beatIndex: 0 }, clip);

    expect(next.tracks.map(t => t.measures.length)).toEqual([3, 3]);
    expect(frets(next.tracks[0])[2]).toEqual(frets(start.tracks[0])[0]);
    expect(next.tracks[0].measures[2].id).not.toBe(start.tracks[0].measures[0].id);
    expect(cursor).toEqual({ measureIndex: 2, beatIndex: 0 });
  });

  it('pastes part of a bar as beats after the cursor', () => {
    const start = riff();
    const clip = copyBeats(start.tracks[0], { measureIndex: 0, beatIndex: 1 }, { measureIndex: 0, beatIndex: 1 });
    const { song: next, cursor } = pasteClip(start, 0, { measureIndex: 1, beatIndex: 0 }, clip);

    expect(frets(next.tracks[0])[1]).toEqual([[{ stringIndex: 1, fret: 1 }], [{ stringIndex: 5, fret: 0 }]]);
    expect(next.tracks[0].measures).toHaveLength(2);
    expect(cursor).toEqual({ measureIndex: 1, beatIndex: 1 });
  });

  it('carries notes into another tuning or a pitched track by sounding pitch', () => {
    const start = riff();
    start.tracks.push(
      { ...createTrack('guitar'), tuning: [64, 59, 55, 50, 45, 38], measures: [createEmptyMeasure(), createEmptyMeasure()] },
      { ...createTrack('piano'), measures: [createEmptyMeasure(), createEmptyMeasure()] },
    );
    const clip = copyBeats(start.tracks[0], { measureIndex: 0, beatIndex: 0 }, { measureIndex: 0, beatIndex: 1 });
    const dropD = pasteClip(start, 1, { measureIndex: 0, beatIndex: 0 }, clip).song.tracks[1];
    const piano = pasteClip(start, 2, { measureIndex: 0, beatIndex: 0 }, clip).song.tracks[2];

    // The high E keeps its string; low E is not open on drop D, so it moves to fret 2.
    expect(frets(dropD)[1]).toEqual([[{ stringIndex: 0, fret: 3 }], [{ stringIndex: 5, fret: 2 }]]);
    expect(frets(piano)[1]).toEqual([[{ midi: 67 }], [{ midi: 40 }]]);
  });

  it('cuts whole bars from every track but always leaves one', () => {
    const start = riff();
    start.tracks.push({ ...createTrack('piano'), measures: [createEmptyMeasure(), createEmptyMeasure()] });
    const cut = removeBeats(start, 0, { measureIndex: 0, beatIndex: 0 }, { measureIndex: 0, beatIndex: 1 });
    expect(cut.tracks.map(t => t.measures.length)).toEqual([1, 1]);
    expect(frets(cut.tracks[0])).toEqual([[[{ stringIndex: 1, fret: 1 }]]]);

    const all = removeBeats(start, 0, { measureIndex: 0, beatIndex: 0 }, { measureIndex: 1, beatIndex: 0 });
    expect(all.tracks.map(t => t.measures.length)).toEqual([1, 1]);
  });

  it('leaves a single rest in a bar a partial cut empties', () => {
    const start = riff();
    const cut = removeBeats(start, 0, { measureIndex: 0, beatIndex: 1 }, { measureIndex: 1, beatIndex: 0 });
    expect(frets(cut.tracks[0])).toEqual([[[{ stringIndex: 0, fret: 3 }]], [[]]]);
    expect(cut.tracks[0].measures[1].beats[0]).toMatchObject({ duration: '2', isRest: true });
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
    expect(createTrack('bass').tuning).toEqual([43, 38, 33, 28]);
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
    const patch = retuneTrack({ ...createTrack('piano'), name: 'Keys' }, 'organ');
    expect(patch).toEqual({ instrument: 'organ', transpose: 0 });
  });

  it('renames a track only while it still has its default name', () => {
    expect(retuneTrack(createTrack('guitar'), 'bass').name).toBe('Bass');
    expect(retuneTrack({ ...createTrack('guitar'), name: 'Rhythm' }, 'bass').name).toBeUndefined();
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

  it('gives a guitar track switched to bass the four bass strings, keeping every pitch', () => {
    const guitar = withNotes(createTrack('guitar'), [{ stringIndex: 4, fret: 2 }, { stringIndex: 5, fret: 0 }]);
    const patch = retuneTrack(guitar, 'bass');
    const bass = { ...createTrack('bass'), measures: [] };
    expect(patch.tuning).toEqual([43, 38, 33, 28]);
    expect(patch.display).toBeUndefined();
    expect(notesOf(patch).map(n => resolveNoteMidi(n, bass))).toEqual([47, 40]);
  });
});

describe('transposition', () => {
  it('shifts the staff position by a whole octave', () => {
    const concert = spellPitch(60, 0).diatonicStep;
    const guitar = spellPitch(60, 12).diatonicStep;
    expect(guitar - concert).toBe(7); // one octave = seven diatonic steps
  });

  it('round-trips at concert pitch as well as guitar pitch', () => {
    for (const transpose of [0, 12]) {
      for (let step = -12; step <= 16; step++) {
        const midi = staffStepToSoundingMidi(step, transpose);
        expect(spellPitch(midi, transpose).diatonicStep).toBe(step);
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

describe('locateCursor', () => {
  const bars = (): TabMeasure[] => [
    measure([beat('4'), beat('4')]),
    measure([beat('4'), beat('4'), beat('4')]),
  ];
  const at = (s: TabSong, measureIndex: number, beatIndex: number) => ({
    trackId: s.tracks[0].id,
    measureId: s.tracks[0].measures[measureIndex].id,
    beatId: s.tracks[0].measures[measureIndex].beats[beatIndex].id,
    trackIndex: 0,
    measureIndex,
    beatIndex,
  });

  it('follows its bar when a collaborator inserts one before it', () => {
    const before = song(bars());
    const cursor = at(before, 1, 2);
    const after = song([measure([beat('4')]), ...before.tracks[0].measures]);
    after.tracks[0].id = before.tracks[0].id;

    expect(locateCursor(after, cursor, cursor)).toEqual({ trackIndex: 0, measureIndex: 2, beatIndex: 2 });
  });

  it('clamps to the last bar when its bar was deleted', () => {
    const before = song(bars());
    const cursor = at(before, 1, 2);
    const after = { ...before, tracks: [{ ...before.tracks[0], measures: before.tracks[0].measures.slice(0, 1) }] };

    expect(locateCursor(after, cursor, cursor)).toEqual({ trackIndex: 0, measureIndex: 0, beatIndex: 1 });
  });

  it('clamps to the last beat when its beat vanished', () => {
    const before = song(bars());
    const cursor = at(before, 1, 2);
    const shortened = { ...before.tracks[0].measures[1], beats: before.tracks[0].measures[1].beats.slice(0, 1) };
    const after = { ...before, tracks: [{ ...before.tracks[0], measures: [before.tracks[0].measures[0], shortened] }] };

    expect(locateCursor(after, cursor, cursor)).toEqual({ trackIndex: 0, measureIndex: 1, beatIndex: 0 });
  });
});

describe('grand staff', () => {
  const piano = (chords: TabBeat['notes'][]): TabTrack => ({
    ...createTrack('piano'),
    measures: [measure(chords.map(notes => beat('4', notes)))],
  });

  it('splits a piano track at middle C into a linked left hand with the same rhythm', () => {
    const start = song([], { tracks: [createTrack('guitar'), piano([[{ midi: 60 }, { midi: 48 }], [{ midi: 43 }]])] });
    const next = addBassStaff(start, 1);
    const [, upper, lower] = next.tracks;
    expect(grandStaffOf(next.tracks, 1)).toEqual({ treble: 1, bass: 2 });
    expect(grandStaffOf(next.tracks, 2)).toEqual({ treble: 1, bass: 2 });
    expect(upper.measures[0].beats.map(b => [b.notes, b.isRest])).toEqual([[[{ midi: 60 }], false], [[], true]]);
    expect(lower.measures[0].beats.map(b => [b.duration, b.notes])).toEqual([['4', [{ midi: 48 }]], ['4', [{ midi: 43 }]]]);
    expect(lower.measures[0].beats[0].id).not.toBe(upper.measures[0].beats[0].id);
  });

  it('ignores a link to a missing, fretted or already claimed track', () => {
    expect(grandStaffOf([{ ...piano([]), bassTrack: 'gone' }], 0)).toBeNull();
    const guitar = createTrack('guitar');
    expect(grandStaffOf([{ ...piano([]), bassTrack: guitar.id }, guitar], 0)).toBeNull();
    const lower = piano([]);
    const tracks = [{ ...piano([]), bassTrack: lower.id }, { ...piano([]), bassTrack: lower.id }, lower];
    expect(grandStaffOf(tracks, 1)).toBeNull();
    expect(grandStaffOf(tracks, 2)).toEqual({ treble: 0, bass: 2 });
  });
});

describe('beat timing', () => {
  it('finds the beat sounding at a moment, the next one exactly at its onset', () => {
    const bar = measure([{ ...beat('4'), dot: true }, beat('8'), beat('2')]);
    expect(beatOnset(bar, 2)).toBe(2);
    expect([0, 1.4, 1.5, 1.9, 2, 3.9].map(t => beatAt(bar, t))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(beatAt(bar, 4)).toBe(-1);
  });
});

describe('key signatures', () => {
  // Concert pitch, so the numbers below are the written pitches.
  const spelled = (midi: number, key: number) => spellPitch(midi, 0, key);

  it('spells a pitch the key has on its own letter, and others toward the key side', () => {
    expect(spelled(70, -1)).toEqual({ diatonicStep: 6, alteration: -1 }); // B♭4 in F major, on the B line
    expect(spelled(70, 0)).toEqual({ diatonicStep: 5, alteration: 1 });   // A♯4 in C major
    expect(spelled(66, -2)).toEqual({ diatonicStep: 4, alteration: -1 }); // G♭4 in B♭ major
    expect(spelled(71, -6)).toEqual({ diatonicStep: 7, alteration: -1 }); // C♭5 in G♭ major sits with the C5s
    expect(spelled(65, 6)).toEqual({ diatonicStep: 2, alteration: 1 });   // E♯4 in F♯ major
  });

  it('reads every line and space in the key, and spells it back without an accidental', () => {
    for (let key = -7; key <= 7; key++) {
      for (let step = -7; step <= 14; step++) {
        const midi = staffStepToSoundingMidi(step, 0, key);
        const [[accidental]] = barAccidentals([[spelled(midi, key)]], key);
        expect(spelled(midi, key).diatonicStep).toBe(step);
        expect(accidental).toBeNull();
      }
    }
    expect(staffStepToSoundingMidi(3, 0, 1)).toBe(66); // the F line is F♯ in G major
  });

  it('writes an accidental once per line in a bar, and cancels it when the line changes back', () => {
    const [f, fSharp] = [spelled(65, 1), spelled(66, 1)];
    expect(barAccidentals([[f], [f], [fSharp], [spelled(78, 1)]], 1)).toEqual([[0], [null], [1], [null]]);
    expect(barAccidentals([[spelled(66, 0)], [spelled(66, 0)], [spelled(65, 0)]], 0)).toEqual([[1], [null], [0]]);
  });
});
