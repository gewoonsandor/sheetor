import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { AppSettings } from '../../../src/features/settings/settingsStore';
import { DEFAULT_SETTINGS, PLAYBACK_SPEEDS, loadSettings, saveSettings, updateSettings } from '../../../src/features/settings/settingsStore';

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

const STORAGE_KEY = 'sheetor-settings';

let storage: MemoryStorage;

const seed = (value: unknown): void => {
  storage.setItem(STORAGE_KEY, JSON.stringify(value));
};

const stored = (): AppSettings => {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) throw new Error('nothing stored');
  return JSON.parse(raw) as AppSettings;
};

beforeEach(() => {
  storage = makeMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('loadSettings', () => {
  it('returns the defaults and writes nothing when the key is absent', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(storage.size).toBe(0);
  });

  it('returns the defaults when the stored value is an empty string', () => {
    storage.setItem(STORAGE_KEY, '');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a fully valid blob', () => {
    const saved: AppSettings = {
      masterVolume: 0.35,
      playbackSpeed: 1.5,
      loopPlayback: true,
      showToolPanel: false,
      readOnly: true,
      defaultBpm: 200,
      midiInput: true,
    };
    saveSettings(saved);
    expect(loadSettings()).toEqual(saved);
  });

  it('keeps the valid fields when a single field has the wrong type', () => {
    seed({ masterVolume: 'loud', loopPlayback: true });
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, loopPlayback: true });
  });

  it('falls back per field for non-boolean flags without touching the numbers', () => {
    seed({ masterVolume: 0.5, loopPlayback: 'yes', showToolPanel: 0, readOnly: null, defaultBpm: 90 });
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, masterVolume: 0.5, defaultBpm: 90 });
  });

  it('clamps masterVolume above 1 and below 0', () => {
    seed({ masterVolume: 4.2 });
    expect(loadSettings().masterVolume).toBe(1);
    seed({ masterVolume: -3 });
    expect(loadSettings().masterVolume).toBe(0);
  });

  it('rejects a non-finite masterVolume', () => {
    seed({ masterVolume: null });
    expect(loadSettings().masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
  });

  it('accepts every listed playback speed', () => {
    for (const speed of PLAYBACK_SPEEDS) {
      seed({ playbackSpeed: speed });
      expect(loadSettings().playbackSpeed).toBe(speed);
    }
  });

  it('rejects an off-list playbackSpeed instead of clamping it', () => {
    seed({ playbackSpeed: 1.1 });
    expect(loadSettings().playbackSpeed).toBe(DEFAULT_SETTINGS.playbackSpeed);
    seed({ playbackSpeed: 3 });
    expect(loadSettings().playbackSpeed).toBe(DEFAULT_SETTINGS.playbackSpeed);
    seed({ playbackSpeed: '1' });
    expect(loadSettings().playbackSpeed).toBe(DEFAULT_SETTINGS.playbackSpeed);
  });

  it('floors defaultBpm and clamps it at both ends', () => {
    seed({ defaultBpm: 144.9 });
    expect(loadSettings().defaultBpm).toBe(144);
    seed({ defaultBpm: 2 });
    expect(loadSettings().defaultBpm).toBe(30);
    seed({ defaultBpm: 5000.7 });
    expect(loadSettings().defaultBpm).toBe(300);
  });

  it('returns the defaults and removes the key when the JSON is unreadable', () => {
    storage.setItem(STORAGE_KEY, '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns the defaults and removes the key when the root is not an object', () => {
    seed(42);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();

    seed([DEFAULT_SETTINGS]);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns the defaults when storage cannot be read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('saveSettings', () => {
  it('writes only the seven known fields', () => {
    const dirty = { ...DEFAULT_SETTINGS, tuning: ['E', 'A'], synthType: 'guitar' };
    saveSettings(dirty);
    expect(Object.keys(stored()).sort()).toEqual([
      'defaultBpm',
      'loopPlayback',
      'masterVolume',
      'midiInput',
      'playbackSpeed',
      'readOnly',
      'showToolPanel',
    ]);
  });

  it('normalises what it persists', () => {
    saveSettings({ ...DEFAULT_SETTINGS, masterVolume: 9, playbackSpeed: 7, defaultBpm: 120.8 });
    expect(stored()).toEqual({ ...DEFAULT_SETTINGS, masterVolume: 1 });
  });

  it('never throws when storage rejects a write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('updateSettings', () => {
  it('merges the patch over the stored settings, persists it, and returns it', () => {
    seed({ ...DEFAULT_SETTINGS, defaultBpm: 90, loopPlayback: true });
    const next = updateSettings({ readOnly: true, masterVolume: 0.25 });
    expect(next).toEqual({
      ...DEFAULT_SETTINGS,
      defaultBpm: 90,
      loopPlayback: true,
      readOnly: true,
      masterVolume: 0.25,
    });
    expect(loadSettings()).toEqual(next);
  });

  it('starts from the defaults when nothing is stored', () => {
    expect(updateSettings({ showToolPanel: false })).toEqual({ ...DEFAULT_SETTINGS, showToolPanel: false });
    expect(stored().showToolPanel).toBe(false);
  });

  it('revalidates the patch through the same field rules', () => {
    expect(updateSettings({ masterVolume: 5 }).masterVolume).toBe(1);
    expect(updateSettings({ playbackSpeed: 3 }).playbackSpeed).toBe(DEFAULT_SETTINGS.playbackSpeed);
    expect(updateSettings({ defaultBpm: 400.5 }).defaultBpm).toBe(300);
  });
});
