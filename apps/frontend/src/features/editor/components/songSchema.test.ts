import { describe, it, expect } from 'vitest';

import { parseSong } from './songSchema';

const valid = () => ({
  title: 'Song',
  artist: 'Band',
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  measures: [
    { id: 'm1', beats: [{ id: 'b1', duration: '4', notes: [{ stringIndex: 0, fret: 3 }] }] },
    { id: 'm2', beats: [{ id: 'b2', duration: '8', notes: [], isRest: true }] },
  ],
});

const expectError = (value: unknown, error: string) => {
  const result = parseSong(value);
  expect(result).toEqual({ ok: false, error });
};

describe('parseSong', () => {
  it('accepts a well-formed song', () => {
    const result = parseSong(valid());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.measures).toHaveLength(2);
    expect(result.song.measures[0].beats[0].notes).toEqual([{ stringIndex: 0, fret: 3 }]);
    expect(result.song.measures[1].beats[0].isRest).toBe(true);
  });

  it('rejects non-objects', () => {
    expectError(null, 'Song must be a JSON object.');
    expectError([], 'Song must be a JSON object.');
    expectError('{}', 'Song must be a JSON object.');
  });

  it('requires a title', () => {
    expectError({ ...valid(), title: '   ' }, 'Song title is required.');
    const withoutTitle: Record<string, unknown> = { ...valid() };
    delete withoutTitle.title;
    expectError(withoutTitle, 'Song title is required.');
  });

  it('bounds the bpm', () => {
    expectError({ ...valid(), bpm: 5 }, 'Song bpm must be a number between 20 and 400.');
    expectError({ ...valid(), bpm: 'fast' }, 'Song bpm must be a number between 20 and 400.');
  });

  it('validates the time signature', () => {
    expectError({ ...valid(), timeSignature: { numerator: 4, denominator: 5 } }, 'Song time signature is invalid.');
  });

  it('requires at least one measure', () => {
    expectError({ ...valid(), measures: [] }, 'Song must contain at least one measure.');
  });

  it('rejects a measure with no beats, naming it 1-based', () => {
    const song = valid();
    song.measures[1].beats = [];
    expectError(song, 'Measure 2 must contain at least one beat.');
  });

  it('rejects an unknown duration', () => {
    const song = valid();
    song.measures[0].beats[0].duration = '3';
    expectError(song, 'Measure 1 beat 1 has an invalid duration.');
  });

  it('rejects an out-of-range fret', () => {
    const song = valid();
    song.measures[0].beats[0].notes = [{ stringIndex: 0, fret: 99 }];
    expectError(song, 'Measure 1 beat 1 has an invalid fret.');
  });

  it('rejects an out-of-range string index', () => {
    const song = valid();
    song.measures[0].beats[0].notes = [{ stringIndex: -1, fret: 0 }];
    expectError(song, 'Measure 1 beat 1 has a note on an invalid string.');
  });

  it('drops unknown keys instead of persisting them', () => {
    const result = parseSong({ ...valid(), hacked: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('hacked' in result.song).toBe(false);
    expect(Object.keys(result.song).sort()).toEqual(['artist', 'bpm', 'measures', 'timeSignature', 'title']);
  });

  it('repairs a missing artist, ids, and invalid overrides', () => {
    const song = valid();
    const result = parseSong({
      ...song,
      artist: '',
      measures: [
        { beats: [{ duration: '4', bogus: true }], bpm: 5000, timeSignature: { numerator: 0, denominator: 4 } },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.artist).toBe('Unknown Artist');
    expect(result.song.measures[0].id).toMatch(/^[a-z0-9]+$/);
    expect(result.song.measures[0].beats[0].id).toMatch(/^[a-z0-9]+$/);
    expect(result.song.measures[0].beats[0].notes).toEqual([]);
    expect(result.song.measures[0].bpm).toBeUndefined();
    expect(result.song.measures[0].timeSignature).toBeUndefined();
  });

  it('keeps only technique flags that are explicitly true', () => {
    const song = valid();
    song.measures[0].beats[0].notes = [
      { stringIndex: 0, fret: 3, vibrato: true, palmMute: false, bend: 'yes' } as never,
    ];
    const result = parseSong(song);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.measures[0].beats[0].notes[0]).toEqual({ stringIndex: 0, fret: 3, vibrato: true });
  });
});
