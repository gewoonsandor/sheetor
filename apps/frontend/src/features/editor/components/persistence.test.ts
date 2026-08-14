import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { TabSong } from './types';
import { clearSavedSong, loadSong, saveSong } from './persistence';

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
  measures: [{ id: 'm1', beats: [{ id: 'b1', duration: '4', notes: [{ stringIndex: 0, fret: 3 }] }] }],
});

let storage: MemoryStorage;

beforeEach(() => {
  storage = makeMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('loadSong / saveSong', () => {
  it('round-trips a saved song', () => {
    const saved = song('Saved');
    saveSong(saved);
    expect(loadSong(song('Fallback'))).toEqual(saved);
  });

  it('returns the fallback and writes nothing when storage is empty', () => {
    const fallback = song('Fallback');
    expect(loadSong(fallback)).toBe(fallback);
    expect(storage.size).toBe(0);
  });

  it('quarantines unparseable JSON', () => {
    storage.setItem('sheetor-song', '{not json');
    const fallback = song('Fallback');
    expect(loadSong(fallback)).toBe(fallback);
    expect(storage.getItem('sheetor-song')).toBeNull();
    expect(storage.getItem('sheetor-song.invalid')).toBe('{not json');
  });

  it('quarantines JSON that fails the schema and reports why', () => {
    const raw = '{"title":"x","measures":[]}';
    storage.setItem('sheetor-song', raw);
    const fallback = song('Fallback');
    expect(loadSong(fallback)).toBe(fallback);
    expect(storage.getItem('sheetor-song')).toBeNull();
    expect(storage.getItem('sheetor-song.invalid')).toBe(raw);
    expect(console.warn).toHaveBeenCalledWith(
      '[sheetor] Discarded invalid saved song: Song bpm must be a number between 20 and 400.',
    );
  });

  it('never throws when storage rejects a write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });
    expect(() => saveSong(song('Big'))).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('clearSavedSong', () => {
  it('removes both the song and the quarantined copy', () => {
    storage.setItem('sheetor-song', '{}');
    storage.setItem('sheetor-song.invalid', '{}');
    clearSavedSong();
    expect(storage.size).toBe(0);
  });
});
