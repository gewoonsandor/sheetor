import { describe, it, expect, beforeEach, vi } from 'vitest';

import type * as AuthApi from '../../../src/features/user/authApi';
import type * as Session from '../../../src/features/user/session';
import type * as UserStore from '../../../src/features/user/userStore';
import type { User } from '../../../src/features/user/userStore';

interface MemoryStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
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
  };
};

const STORAGE_KEY = 'sheetor-user';
const FALLBACK = 'Something went wrong. Please try again.';

type Call = { url: string; init: RequestInit | undefined };
type Answer = { status: number; body: string; json?: boolean } | 'network-error';

let storage: MemoryStorage;
let api: typeof AuthApi;
let session: typeof Session;
let store: typeof UserStore;
let calls: Call[];

/// Answers each call in order; the last answer repeats, so a test that only
/// cares about one request does not have to spell out the rest.
const answer = (...script: Answer[]): void => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const next = script[Math.min(calls.length, script.length - 1)];
      calls.push({ url, init });
      if (next === 'network-error') throw new TypeError('Failed to fetch');
      // 204 may not carry a body; the Response constructor rejects one.
      return new Response(next.status === 204 ? null : next.body, {
        status: next.status,
        headers: next.json === false ? {} : { 'content-type': 'application/json' },
      });
    }),
  );
};

const ok = (body: unknown, status = 200): Answer => ({ status, body: JSON.stringify(body) });

const ACCOUNT = {
  id: 7,
  username: 'Ada Lovelace',
  email: 'ada@example.com',
  provider: 'local',
  provider_id: null,
};

const stored = (): User => {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) throw new Error('nothing stored');
  return JSON.parse(raw) as User;
};

const body = (index: number): unknown => JSON.parse(String(calls[index].init?.body));

beforeEach(async () => {
  storage = makeMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // authApi writes through both other modules, each of which keeps
  // module-level state, so all three must come from one fresh graph or the
  // assertions would read different instances than the ones written to.
  vi.resetModules();
  api = await import('../../../src/features/user/authApi');
  session = await import('../../../src/features/user/session');
  store = await import('../../../src/features/user/userStore');
});

describe('login', () => {
  it('posts the credentials as json and marks the session live', async () => {
    answer(ok(ACCOUNT));

    const user = await api.login('ada@example.com', 'Str0ng-Passw0rd!');

    expect(calls[0].url).toBe('/api/v1/users/login');
    expect(calls[0].init?.method).toBe('POST');
    expect(body(0)).toEqual({ email: 'ada@example.com', password: 'Str0ng-Passw0rd!' });
    expect(user.id).toBe('7');
    expect(user.name).toBe('Ada Lovelace');
    expect(stored().email).toBe('ada@example.com');
    expect(session.getSessionStatus()).toBe('in');
  });

  it('leaves the local appearance preferences alone', async () => {
    store.saveUser({ ...store.DEFAULT_USER, theme: 'light', accent: 'teal' });
    answer(ok(ACCOUNT));

    const user = await api.login('ada@example.com', 'Str0ng-Passw0rd!');

    expect(user.theme).toBe('light');
    expect(user.accent).toBe('teal');
  });

  it('surfaces the message the api refused with and stays signed out', async () => {
    answer(ok({ message: 'invalid email or password' }, 401));

    await expect(api.login('ada@example.com', 'wrong')).rejects.toThrow(
      'invalid email or password',
    );
    expect(session.getSessionStatus()).toBe('checking');
  });

  it('falls back to a generic message when the failure is not json', async () => {
    answer({ status: 502, body: '<html>Bad Gateway</html>', json: false });

    await expect(api.login('ada@example.com', 'Str0ng-Passw0rd!')).rejects.toThrow(FALLBACK);
  });

  it('refuses a malformed success body rather than storing junk', async () => {
    answer(ok({ id: 'seven', username: 'Ada' }));

    await expect(api.login('ada@example.com', 'Str0ng-Passw0rd!')).rejects.toThrow(FALLBACK);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(session.getSessionStatus()).toBe('checking');
  });
});

describe('register', () => {
  it('creates the account then logs in, because create issues no cookie', async () => {
    answer(ok(ACCOUNT, 201), ok(ACCOUNT));

    await api.register('Ada Lovelace', 'ada@example.com', 'Str0ng-Passw0rd!');

    expect(calls.map((call) => call.url)).toEqual([
      '/api/v1/users/create',
      '/api/v1/users/login',
    ]);
    expect(body(0)).toEqual({
      username: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'Str0ng-Passw0rd!',
    });
    expect(session.getSessionStatus()).toBe('in');
  });

  it('reports a taken address and never attempts the login', async () => {
    answer(ok({ message: 'email already registered' }, 409));

    await expect(
      api.register('Ada', 'ada@example.com', 'Str0ng-Passw0rd!'),
    ).rejects.toThrow('email already registered');
    expect(calls).toHaveLength(1);
  });
});

describe('fetchSession', () => {
  it('adopts the account the cookie already identifies', async () => {
    answer(ok(ACCOUNT));

    await api.fetchSession();

    expect(calls[0].url).toBe('/api/v1/users/me');
    expect(session.getSessionStatus()).toBe('in');
    expect(stored().name).toBe('Ada Lovelace');
  });

  it('settles on signed out for an anonymous visitor', async () => {
    answer(ok({ message: 'invalid email or password' }, 401));

    await api.fetchSession();

    expect(session.getSessionStatus()).toBe('out');
  });

  // Never rejecting is the whole point: the gate awaits this once, and a
  // throw would leave the app stuck on the splash forever.
  it('settles on signed out when the network fails', async () => {
    answer('network-error');

    await expect(api.fetchSession()).resolves.toBeUndefined();
    expect(session.getSessionStatus()).toBe('out');
  });
});

describe('logout', () => {
  it('clears the session and returns the profile to the local default', async () => {
    answer(ok(ACCOUNT), { status: 204, body: '' });
    await api.login('ada@example.com', 'Str0ng-Passw0rd!');

    await api.logout();

    expect(calls[1].url).toBe('/api/v1/users/logout');
    expect(calls[1].init?.method).toBe('POST');
    expect(session.getSessionStatus()).toBe('out');
    expect(stored().name).toBe(store.DEFAULT_USER.name);
    expect(stored().email).toBe(store.DEFAULT_USER.email);
  });

  // A failed request must not strand someone in a signed-in shell they can no
  // longer use, so the local side is cleared either way.
  it('signs out locally even when the request fails', async () => {
    answer(ok(ACCOUNT), 'network-error');
    await api.login('ada@example.com', 'Str0ng-Passw0rd!');

    await expect(api.logout()).rejects.toThrow();
    expect(session.getSessionStatus()).toBe('out');
    expect(stored().name).toBe(store.DEFAULT_USER.name);
  });
});

describe('fetchAuthConfig', () => {
  it('reads which sign-in methods the server offers', async () => {
    answer(ok({ local_enabled: false, sso_name: 'Keycloak' }));

    await expect(api.fetchAuthConfig()).resolves.toEqual({
      localEnabled: false,
      ssoName: 'Keycloak',
    });
    expect(calls[0].url).toBe('/api/v1/auth/config');
  });

  // The sign-in page awaits this before rendering anything, so it must settle.
  it('falls back to the email form when the server cannot be asked', async () => {
    answer('network-error');

    await expect(api.fetchAuthConfig()).resolves.toEqual({ localEnabled: true, ssoName: null });
  });
});

describe('renameAccount', () => {
  it('stores the name the server saved', async () => {
    answer(ok({ ...ACCOUNT, username: 'Ada' }));

    await api.renameAccount('  Ada ');

    expect(calls[0].url).toBe('/api/v1/users/me/name');
    expect(calls[0].init?.method).toBe('PUT');
    expect(body(0)).toEqual({ username: '  Ada ' });
    expect(stored().name).toBe('Ada');
  });

  it('reports a refused name', async () => {
    answer(ok({ message: 'display names must be 1 to 64 characters' }, 400));

    await expect(api.renameAccount(' ')).rejects.toThrow('display names must be 1 to 64 characters');
  });
});
