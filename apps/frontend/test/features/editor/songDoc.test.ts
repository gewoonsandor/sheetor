import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';

import {
  createSongDoc,
  encodeSong,
  readSongDoc,
  writeSongDoc,
} from '../../../src/features/editor/songDoc';
import { createEmptyMeasure, createEmptySong } from '../../../src/features/editor/components/songUtils';
import type { TabSong } from '../../../src/features/editor/components/types';

const read = (doc: Y.Doc): TabSong => {
  const result = readSongDoc(doc);
  if (!result.ok) throw new Error(result.error);
  return result.song;
};

const baseSong = (): TabSong => {
  const song = createEmptySong();
  const track = song.tracks[0];
  return { ...song, tracks: [{ ...track, measures: [createEmptyMeasure(), createEmptyMeasure()] }] };
};

/// Two replicas of one document, as two browsers would hold after joining.
const replicas = (song: TabSong): [Y.Doc, Y.Doc] => {
  const [a, b] = [new Y.Doc(), new Y.Doc()];
  const initial = encodeSong(song);
  Y.applyUpdate(a, initial);
  Y.applyUpdate(b, initial);
  return [a, b];
};

const exchange = (a: Y.Doc, b: Y.Doc): void => {
  const fromA = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const fromB = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, fromA);
  Y.applyUpdate(a, fromB);
};

const withNote = (song: TabSong, measure: number, fret: number): TabSong => ({
  ...song,
  tracks: song.tracks.map((track) => ({
    ...track,
    measures: track.measures.map((m, i) =>
      i !== measure
        ? m
        : {
            ...m,
            beats: m.beats.map((beat, j) =>
              j === 0 ? { ...beat, isRest: undefined, notes: [{ stringIndex: 0, fret }] } : beat,
            ),
          },
    ),
  })),
});

describe('songDoc', () => {
  it('reads back the song it was written from', () => {
    const song = withNote(baseSong(), 0, 5);

    expect(read(createSongDoc(song))).toEqual(song);
  });

  // The editor publishes after every render; an unchanged song must not echo.
  it('emits no update when the song is unchanged', () => {
    const song = baseSong();
    const doc = createSongDoc(song);
    const onUpdate = vi.fn();
    doc.on('update', onUpdate);

    writeSongDoc(doc, read(doc));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('merges concurrent edits to different parts of the song', () => {
    const base = baseSong();
    const [a, b] = replicas(base);

    const fromA = read(a);
    writeSongDoc(a, {
      ...fromA,
      tracks: fromA.tracks.map((t) => ({ ...t, measures: [...t.measures, createEmptyMeasure()] })),
    });
    writeSongDoc(b, { ...withNote(read(b), 0, 7), title: 'Midnight Riff' });
    exchange(a, b);

    const merged = read(a);
    expect(read(b)).toEqual(merged);
    expect(merged.title).toBe('Midnight Riff');
    expect(merged.tracks[0].measures).toHaveLength(3);
    expect(merged.tracks[0].measures[0].beats[0].notes).toEqual([{ stringIndex: 0, fret: 7 }]);
  });

  it('keeps an edit inside one bar while another bar is deleted', () => {
    const [a, b] = replicas(baseSong());

    const fromA = read(a);
    writeSongDoc(a, {
      ...fromA,
      tracks: fromA.tracks.map((t) => ({ ...t, measures: t.measures.slice(0, 1) })),
    });
    writeSongDoc(b, withNote(read(b), 0, 3));
    exchange(a, b);

    const merged = read(a);
    expect(merged.tracks[0].measures).toHaveLength(1);
    expect(merged.tracks[0].measures[0].beats[0].notes).toEqual([{ stringIndex: 0, fret: 3 }]);
  });
});
