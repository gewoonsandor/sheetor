import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { TabSong } from '../editor/components/types';
import { createTrack } from '../editor/components/songUtils';
import type { Library } from './libraryStore';
import {
  addSong, deleteSong, duplicateSong, getCurrentEntry, loadLibrary, replaceSong,
  saveLibrary, setCurrentSong,
} from './libraryStore';

interface MemoryStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  readonly size: number;
}

const makeMemoryStorage = (): MemoryStorage => {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    get size() {
      return entries.size;
    },
  };
};

const song = (title: string): TabSong => ({
  title,
  artist: 'Band',
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  tracks: [{ ...createTrack('fretted', 'guitar'), measures: [{ id: 'm1', beats: [{ id: 'b1', duration: '4', notes: [{ stringIndex: 0, fret: 3 }] }] }] }],
});

const entry = (id: string, title: string): Record<string, unknown> => ({
  id,
  title,
  artist: 'Band',
  updatedAt: 1700000000000,
  song: song(title),
});

const libraryOf = (...titles: string[]): Library => ({
  entries: titles.map((title, index) => ({
    id: `id-${index}`,
    title,
    artist: 'Band',
    updatedAt: 1700000000000 + index,
    song: song(title),
  })),
  currentId: titles.length > 0 ? 'id-0' : null,
});

const readStored = (key: string): unknown => {
  const raw = storage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
};

let storage: MemoryStorage;

beforeEach(() => {
  storage = makeMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('loadLibrary', () => {
  it('returns an empty library and writes nothing when storage is empty', () => {
    expect(loadLibrary()).toEqual({ entries: [], currentId: null });
    expect(storage.size).toBe(0);
  });

  it('round-trips a saved library', () => {
    const library = libraryOf('One', 'Two');
    saveLibrary(library);
    expect(loadLibrary()).toEqual(library);
  });

  it('migrates the legacy single-song key and consumes it', () => {
    const legacy = song('Legacy');
    storage.setItem('sheetor-song', JSON.stringify(legacy));

    const library = loadLibrary();

    expect(library.entries).toHaveLength(1);
    expect(library.entries[0].title).toBe('Legacy');
    expect(library.entries[0].artist).toBe('Band');
    expect(library.entries[0].song).toEqual(legacy);
    expect(library.currentId).toBe(library.entries[0].id);
    expect(storage.getItem('sheetor-song')).toBeNull();
    expect(readStored('sheetor-library')).toEqual(library);
  });

  it('leaves a quarantined legacy song untouched and ignores an invalid legacy blob', () => {
    storage.setItem('sheetor-song', '{"title":"x"}');
    storage.setItem('sheetor-song.invalid', '{old}');

    expect(loadLibrary()).toEqual({ entries: [], currentId: null });
    expect(storage.getItem('sheetor-song.invalid')).toBe('{old}');
    expect(storage.getItem('sheetor-library')).toBeNull();
  });

  it('quarantines unreadable JSON', () => {
    storage.setItem('sheetor-library', '{not json');

    expect(loadLibrary()).toEqual({ entries: [], currentId: null });
    expect(storage.getItem('sheetor-library')).toBeNull();
    expect(storage.getItem('sheetor-library.invalid')).toBe('{not json');
  });

  it('quarantines a root without an entries array, then still migrates the legacy song', () => {
    storage.setItem('sheetor-library', '{"entries":"nope"}');
    storage.setItem('sheetor-song', JSON.stringify(song('Legacy')));

    const library = loadLibrary();

    expect(library.entries).toHaveLength(1);
    expect(library.entries[0].title).toBe('Legacy');
    expect(storage.getItem('sheetor-library.invalid')).toBe('{"entries":"nope"}');
    expect(storage.getItem('sheetor-song')).toBeNull();
    expect(readStored('sheetor-library')).toEqual(library);
  });

  it('drops entries whose song fails validation or that have no id', () => {
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [entry('a', 'Keep'), { id: 'b', song: { title: 'broken' } }, { song: song('No id') }],
      currentId: 'a',
    }));

    const library = loadLibrary();

    expect(library.entries.map((it) => it.id)).toEqual(['a']);
    expect(library.currentId).toBe('a');
  });

  it('repairs a dangling currentId to the first surviving entry', () => {
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [entry('a', 'One'), entry('b', 'Two')],
      currentId: 'gone',
    }));

    expect(loadLibrary().currentId).toBe('a');
  });

  it('repairs currentId to null when nothing survives', () => {
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [{ id: 'b', song: { title: 'broken' } }],
      currentId: 'b',
    }));

    expect(loadLibrary()).toEqual({ entries: [], currentId: null });
  });

  it('repairs a missing title, artist and updatedAt from the song', () => {
    const stored = song('From Song');
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [{ id: 'a', title: 7, updatedAt: 'soon', song: stored }],
      currentId: 'a',
    }));

    const [loaded] = loadLibrary().entries;
    expect(loaded.title).toBe('From Song');
    expect(loaded.artist).toBe('Band');
    expect(Number.isFinite(loaded.updatedAt)).toBe(true);
  });
});

describe('saveLibrary', () => {
  it('never throws when storage rejects a write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });

    expect(() => saveLibrary(libraryOf('Big'))).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('addSong', () => {
  it('prepends the new entry, makes it current and leaves the input untouched', () => {
    const library = libraryOf('One');
    const before = structuredClone(library);

    const { library: next, entry: added } = addSong(library, song('Fresh'));

    expect(next.entries.map((it) => it.title)).toEqual(['Fresh', 'One']);
    expect(next.currentId).toBe(added.id);
    expect(added.artist).toBe('Band');
    expect(next.entries[0]).toBe(added);
    expect(library).toEqual(before);
    expect(storage.size).toBe(0);
  });
});

describe('replaceSong', () => {
  it('swaps the song, re-denormalises and moves the entry to the front', () => {
    const library = libraryOf('One', 'Two', 'Three');
    const before = structuredClone(library);
    const replacement: TabSong = { ...song('Renamed'), artist: 'Other' };

    const next = replaceSong(library, 'id-2', replacement);

    expect(next.entries.map((it) => it.id)).toEqual(['id-2', 'id-0', 'id-1']);
    expect(next.entries[0].title).toBe('Renamed');
    expect(next.entries[0].artist).toBe('Other');
    expect(next.entries[0].song).toBe(replacement);
    expect(next.entries[0].updatedAt).toBeGreaterThan(before.entries[2].updatedAt);
    expect(next.currentId).toBe('id-0');
    expect(library).toEqual(before);
  });

  it('returns the library unchanged for an unknown id', () => {
    const library = libraryOf('One');
    expect(replaceSong(library, 'nope', song('X'))).toBe(library);
  });
});

describe('duplicateSong', () => {
  it('inserts a deep copy right after the original without changing the current song', () => {
    const library = libraryOf('One', 'Two');
    const before = structuredClone(library);

    const next = duplicateSong(library, 'id-0');

    expect(next.entries.map((it) => it.title)).toEqual(['One', 'One (copy)', 'Two']);
    expect(next.entries[1].song.title).toBe('One (copy)');
    expect(next.entries[1].id).not.toBe('id-0');
    expect(next.entries[1].song).not.toBe(library.entries[0].song);
    expect(next.entries[1].song.tracks[0]).not.toBe(library.entries[0].song.tracks[0]);
    expect(next.currentId).toBe('id-0');
    expect(library).toEqual(before);
  });

  it('returns the library unchanged for an unknown id', () => {
    const library = libraryOf('One');
    expect(duplicateSong(library, 'nope')).toBe(library);
  });
});

describe('deleteSong', () => {
  it('drops the entry and moves currentId to the first survivor', () => {
    const library = libraryOf('One', 'Two');
    const before = structuredClone(library);

    const next = deleteSong(library, 'id-0');

    expect(next.entries.map((it) => it.id)).toEqual(['id-1']);
    expect(next.currentId).toBe('id-1');
    expect(library).toEqual(before);
  });

  it('keeps a currentId that was not deleted', () => {
    const library = setCurrentSong(libraryOf('One', 'Two'), 'id-1');
    expect(deleteSong(library, 'id-0').currentId).toBe('id-1');
  });

  it('clears currentId when the last entry goes', () => {
    expect(deleteSong(libraryOf('One'), 'id-0')).toEqual({ entries: [], currentId: null });
  });

  it('returns the library unchanged for an unknown id', () => {
    const library = libraryOf('One');
    expect(deleteSong(library, 'nope')).toBe(library);
  });
});

describe('setCurrentSong', () => {
  it('selects an existing entry and accepts null', () => {
    const library = libraryOf('One', 'Two');
    const before = structuredClone(library);

    expect(setCurrentSong(library, 'id-1').currentId).toBe('id-1');
    expect(setCurrentSong(library, null).currentId).toBeNull();
    expect(library).toEqual(before);
  });

  it('ignores an id that names no entry', () => {
    const library = libraryOf('One');
    expect(setCurrentSong(library, 'nope')).toBe(library);
  });
});

describe('getCurrentEntry', () => {
  it('returns the current entry', () => {
    const library = setCurrentSong(libraryOf('One', 'Two'), 'id-1');
    expect(getCurrentEntry(library)?.title).toBe('Two');
  });

  it('returns null for an empty library', () => {
    expect(getCurrentEntry({ entries: [], currentId: null })).toBeNull();
  });
});
