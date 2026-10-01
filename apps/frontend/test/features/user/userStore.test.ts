import { describe, it, expect, beforeEach, vi } from 'vitest';

import type * as UserStore from '../../../src/features/user/userStore';
import type { User } from '../../../src/features/user/userStore';

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

const STORAGE_KEY = 'sheetor-user';

let storage: MemoryStorage;
let store: typeof UserStore;

const seed = (value: unknown): void => {
  storage.setItem(STORAGE_KEY, JSON.stringify(value));
};

const stored = (): User => {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) throw new Error('nothing stored');
  return JSON.parse(raw) as User;
};

// The store caches the parsed user in a module-level binding so that
// getUserSnapshot can hand useSyncExternalStore a stable reference. Re-reading
// storage therefore needs a fresh module instance, which only a dynamic import
// after vi.resetModules() can give us.
const freshStore = async (): Promise<typeof UserStore> => {
  vi.resetModules();
  return import('../../../src/features/user/userStore');
};

beforeEach(async () => {
  storage = makeMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  store = await freshStore();
});

describe('loadUser', () => {
  it('returns the defaults and writes nothing when the key is absent', () => {
    expect(store.loadUser()).toEqual(store.DEFAULT_USER);
    expect(storage.size).toBe(0);
  });

  it('returns the defaults when the stored value is an empty string', () => {
    storage.setItem(STORAGE_KEY, '');
    expect(store.loadUser()).toEqual(store.DEFAULT_USER);
  });

  it('round-trips a fully valid blob', () => {
    const saved: User = {
      id: 'local-user',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      theme: 'light',
      accent: 'teal',
      paperScore: true,
    };
    seed(saved);
    expect(store.loadUser()).toEqual(saved);
  });

  it('repairs one bad field without discarding its siblings', () => {
    seed({
      id: 'local-user',
      name: 'Ada',
      email: 'ada@example.com',
      theme: 'ultraviolet',
      accent: 'teal',
    });
    expect(store.loadUser()).toEqual({
      id: 'local-user',
      name: 'Ada',
      email: 'ada@example.com',
      theme: 'system',
      accent: 'teal',
      paperScore: false,
    });
  });

  it('reads a paper score that is not a boolean as off and keeps the rest', () => {
    seed({ name: 'Ada', theme: 'dark', accent: 'rose', paperScore: 'yes' });
    expect(store.loadUser()).toMatchObject({
      name: 'Ada',
      theme: 'dark',
      accent: 'rose',
      paperScore: false,
    });
  });

  it('rejects an accent that is not one of the shipped palettes', () => {
    seed({ accent: 'chartreuse' });
    expect(store.loadUser().accent).toBe('amber');
  });

  it('accepts every shipped accent', async () => {
    for (const accent of store.ACCENTS) {
      seed({ accent });
      expect((await freshStore()).loadUser().accent).toBe(accent);
    }
  });

  it('accepts every shipped theme preference', async () => {
    for (const theme of store.THEME_PREFERENCES) {
      seed({ theme });
      expect((await freshStore()).loadUser().theme).toBe(theme);
    }
  });

  it('trims and clamps the display name', () => {
    seed({ name: `  ${'n'.repeat(80)}  ` });
    expect(store.loadUser().name).toBe('n'.repeat(60));
  });

  it('repairs a blank display name to the default', () => {
    seed({ name: '   ' });
    expect(store.loadUser().name).toBe(store.DEFAULT_USER.name);
  });

  it('keeps an empty email', () => {
    seed({ email: '' });
    expect(store.loadUser().email).toBe('');
  });

  it('rejects a non-string email', () => {
    seed({ email: 42 });
    expect(store.loadUser().email).toBe('');
  });

  it('discards a non-object blob and removes the key', () => {
    storage.setItem(STORAGE_KEY, '"just a string"');
    expect(store.loadUser()).toEqual(store.DEFAULT_USER);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('discards unparseable JSON and removes the key', () => {
    storage.setItem(STORAGE_KEY, '{ not json');
    expect(store.loadUser()).toEqual(store.DEFAULT_USER);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns the same reference on every call', () => {
    expect(store.loadUser()).toBe(store.loadUser());
  });
});

describe('saveUser', () => {
  it('validates before writing', () => {
    store.saveUser({ ...store.DEFAULT_USER, name: '  Ada  ', theme: 'nope' as User['theme'] });
    expect(stored()).toEqual({ ...store.DEFAULT_USER, name: 'Ada', theme: 'system' });
  });

  it('never throws when storage rejects the write', () => {
    vi.stubGlobal('localStorage', {
      ...storage,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });
    expect(() => store.saveUser({ ...store.DEFAULT_USER, name: 'Ada' })).not.toThrow();
    expect(store.loadUser().name).toBe('Ada');
  });
});

describe('updateUser', () => {
  it('merges the patch over the stored user and persists it', () => {
    seed({ ...store.DEFAULT_USER, name: 'Ada' });
    expect(store.updateUser({ accent: 'rose' })).toEqual({
      ...store.DEFAULT_USER,
      name: 'Ada',
      accent: 'rose',
    });
    expect(stored().accent).toBe('rose');
    expect(stored().name).toBe('Ada');
  });

  it('repairs a blank name back to the default', () => {
    expect(store.updateUser({ name: '   ' }).name).toBe(store.DEFAULT_USER.name);
  });
});

describe('subscribeUser', () => {
  it('notifies on save and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribeUser(listener);

    store.updateUser({ accent: 'indigo' });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.updateUser({ accent: 'violet' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('getUserSnapshot', () => {
  it('is stable between saves and changes after one', () => {
    const first = store.getUserSnapshot();
    expect(store.getUserSnapshot()).toBe(first);

    store.updateUser({ accent: 'teal' });
    const second = store.getUserSnapshot();
    expect(second).not.toBe(first);
    expect(store.getUserSnapshot()).toBe(second);
  });
});

describe('deriveInitials', () => {
  it('takes the first and last word initials, uppercased', () => {
    expect(store.deriveInitials('Ada Lovelace')).toBe('AL');
    expect(store.deriveInitials('ada byron king lovelace')).toBe('AL');
  });

  it('takes a single initial from a one-word name', () => {
    expect(store.deriveInitials('ada')).toBe('A');
  });

  it('falls back to a question mark for a blank name', () => {
    expect(store.deriveInitials('   ')).toBe('?');
  });
});
