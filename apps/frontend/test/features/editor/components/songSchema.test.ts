import { describe, it, expect } from 'vitest';

import { parseSong } from '../../../../src/features/editor/components/songSchema';

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
    expect(result.song.tracks[0].measures).toHaveLength(2);
    expect(result.song.tracks[0].measures[0].beats[0].notes).toEqual([{ stringIndex: 0, fret: 3 }]);
    expect(result.song.tracks[0].measures[1].beats[0].isRest).toBe(true);
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
    expect(Object.keys(result.song).sort()).toEqual(['artist', 'bpm', 'timeSignature', 'title', 'tracks']);
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
    expect(result.song.tracks[0].measures[0].id).toMatch(/^[a-z0-9]+$/);
    expect(result.song.tracks[0].measures[0].beats[0].id).toMatch(/^[a-z0-9]+$/);
    expect(result.song.tracks[0].measures[0].beats[0].notes).toEqual([]);
    expect(result.song.tracks[0].measures[0].bpm).toBeUndefined();
    expect(result.song.tracks[0].measures[0].timeSignature).toBeUndefined();
  });

  it('keeps repeat marks and drops a count that is not a whole number of plays', () => {
    const result = parseSong({
      ...valid(),
      measures: [
        { beats: [{ duration: '4' }], repeatStart: true, repeatEnd: 3 },
        { beats: [{ duration: '4' }], repeatStart: 'yes', repeatEnd: 1 },
        { beats: [{ duration: '4' }], repeatEnd: 2.5 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [first, second, third] = result.song.tracks[0].measures;
    expect([first.repeatStart, first.repeatEnd]).toEqual([true, 3]);
    expect([second.repeatStart, second.repeatEnd, third.repeatEnd]).toEqual([undefined, undefined, undefined]);
  });

  it('keeps a track clef and bar clef changes, and drops a clef it does not know', () => {
    const measures = [
      { beats: [{ duration: '4' }], clef: 'treble' },
      { beats: [{ duration: '4' }], clef: 'alto' },
    ];
    const result = parseSong({ ...valid(), tracks: [{ instrument: 'piano', clef: 'bass', measures }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [track] = result.song.tracks;
    expect([track.clef, ...track.measures.map(m => m.clef)]).toEqual(['bass', 'treble', undefined]);
  });

  it('promotes a legacy single-track song into one guitar track', () => {
    const result = parseSong(valid());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks).toHaveLength(1);
    const [track] = result.song.tracks;
    expect(track.tuning).toHaveLength(6);
    expect(track.instrument).toBe('guitar');
    expect(track.display).toBe('both');
    expect(track.transpose).toBe(12);
    expect(track.measures).toHaveLength(2);
  });

  it('widens a legacy tuning to cover every note in the file', () => {
    const song = valid();
    song.measures[0].beats[0].notes = [{ stringIndex: 7, fret: 2 }];
    const result = parseSong(song);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].tuning).toHaveLength(8);
  });

  it('accepts an explicit track list', () => {
    const result = parseSong({
      title: 'Duet', bpm: 100, timeSignature: { numerator: 4, denominator: 4 },
      tracks: [
        { name: 'Gtr', kind: 'fretted', instrument: 'guitar', measures: valid().measures },
        { name: 'Pno', kind: 'pitched', instrument: 'piano', measures: [{ beats: [{ duration: '4', notes: [{ midi: 60 }] }] }] },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks.map(t => t.name)).toEqual(['Gtr', 'Pno']);
    expect(result.song.tracks[1].measures[0].beats[0].notes).toEqual([{ midi: 60 }]);
    expect(result.song.tracks[1].transpose).toBe(0);
    expect(result.song.tracks[1].tuning).toBeUndefined();
  });

  it('pads shorter tracks so every track shares one bar count', () => {
    const result = parseSong({
      title: 'Duet', bpm: 100, timeSignature: { numerator: 4, denominator: 4 },
      tracks: [
        { kind: 'fretted', instrument: 'guitar', measures: valid().measures },   // 2 bars
        { kind: 'pitched', instrument: 'piano', measures: [{ beats: [{ duration: '4' }] }] }, // 1 bar
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks.map(t => t.measures.length)).toEqual([2, 2]);
  });

  it('rejects a pitched note outside the midi range', () => {
    expectError({
      title: 'T', bpm: 100, timeSignature: { numerator: 4, denominator: 4 },
      tracks: [{ kind: 'pitched', instrument: 'piano', measures: [{ beats: [{ duration: '4', notes: [{ midi: 999 }] }] }] }],
    }, 'Track 1 measure 1 beat 1 has an invalid pitch.');
  });

  it('repairs unknown instruments and out-of-range volume instead of rejecting', () => {
    const result = parseSong({
      title: 'T', bpm: 100, timeSignature: { numerator: 4, denominator: 4 },
      tracks: [{ instrument: 'kazoo', volume: 42, display: 'tab', measures: valid().measures }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].instrument).toBe('guitar');
    expect(result.song.tracks[0].volume).toBe(1);
  });

  it('never gives a pitched track a TAB staff, whatever the file claims', () => {
    const result = parseSong({
      title: 'T', bpm: 100, timeSignature: { numerator: 4, denominator: 4 },
      tracks: [{ kind: 'pitched', instrument: 'piano', display: 'both', measures: valid().measures }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].display).toBe('notation');
  });

  it('reads an old one-track grand staff as notes and keeps a left-hand link', () => {
    const result = parseSong({
      title: 'T', bpm: 100, timeSignature: { numerator: 4, denominator: 4 },
      tracks: [
        { instrument: 'piano', display: 'grand', bassTrack: 'lh', measures: valid().measures },
        { id: 'lh', instrument: 'piano', bassTrack: 7, measures: valid().measures },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks.map(t => t.display)).toEqual(['notation', 'notation']);
    expect(result.song.tracks.map(t => t.bassTrack)).toEqual(['lh', undefined]);
  });

  it('drops a fret written onto a pitched track, which has no pitch, and keeps real notes', () => {
    const result = parseSong({
      title: 'T', bpm: 100, timeSignature: { numerator: 4, denominator: 4 },
      tracks: [{
        instrument: 'piano',
        measures: [{ beats: [
          { duration: '4', notes: [{ stringIndex: 0, fret: 5 }] },
          { duration: '4', notes: [{ stringIndex: 0, fret: 5 }, { midi: 60 }] },
        ] }],
      }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [lone, mixed] = result.song.tracks[0].measures[0].beats;
    expect(lone).toMatchObject({ notes: [], isRest: true });
    expect(mixed.notes).toEqual([{ midi: 60 }]);
  });

  it('rejects an empty track list', () => {
    expectError({
      title: 'T', bpm: 100, timeSignature: { numerator: 4, denominator: 4 }, tracks: [],
    }, 'Song must contain at least one track.');
  });

  it('keeps only technique flags that are explicitly true', () => {
    const song = valid();
    song.measures[0].beats[0].notes = [
      { stringIndex: 0, fret: 3, vibrato: true, palmMute: false, bend: 'yes' } as never,
    ];
    const result = parseSong(song);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].measures[0].beats[0].notes[0]).toEqual({ stringIndex: 0, fret: 3, vibrato: true });
  });

  it('reads a bend as ½ or full, an old on/off bend as full, and a release only with a bend', () => {
    const song = valid();
    song.measures[0].beats[0].notes = [
      { stringIndex: 0, fret: 7, bend: true },
      { stringIndex: 1, fret: 7, bend: 1, bendRelease: true },
      { stringIndex: 2, fret: 7, bend: 3, bendRelease: true },
    ] as never;
    const result = parseSong(song);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].measures[0].beats[0].notes).toEqual([
      { stringIndex: 0, fret: 7, bend: 2 },
      { stringIndex: 1, fret: 7, bend: 1, bendRelease: true },
      { stringIndex: 2, fret: 7 },
    ]);
  });

  it('reads a slide in only when it does not already come from the note before', () => {
    const song = valid();
    song.measures[0].beats[0].notes = [
      { stringIndex: 0, fret: 7, slideIn: 'below', slideOut: 'up' },
      { stringIndex: 1, fret: 7, legatoSlide: true, slideIn: 'above' },
      { stringIndex: 2, fret: 7, slideIn: 'sideways', slideOut: 'left' },
    ] as never;
    const result = parseSong(song);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].measures[0].beats[0].notes).toEqual([
      { stringIndex: 0, fret: 7, slideIn: 'below', slideOut: 'up' },
      { stringIndex: 1, fret: 7, legatoSlide: true },
      { stringIndex: 2, fret: 7 },
    ]);
  });

  it('keeps a triplet or sextuplet and drops any other tuplet', () => {
    const song = valid();
    song.measures[0].beats = [
      { duration: '8', tuplet: 3, notes: [] },
      { duration: '16', tuplet: 6, notes: [] },
      { duration: '8', tuplet: 5, notes: [] },
    ] as never;
    const result = parseSong(song);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].measures[0].beats.map(b => b.tuplet)).toEqual([3, 6, undefined]);
  });
});
