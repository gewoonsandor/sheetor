import { DEFAULT_USER, updateUser } from './userStore';
import type { User } from './userStore';
import { setSessionStatus } from './session';

const BASE = '/api/v1/users';

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/// Every refusal from the API is `{"message": "..."}`, and those messages are
/// written to be read by a person, so they are shown verbatim.
const readMessage = (body: unknown): string | null =>
  typeof body === 'object' &&
  body !== null &&
  'message' in body &&
  typeof body.message === 'string' &&
  body.message.length > 0
    ? body.message
    : null;

type Account = { id: number; username: string; email: string };

const readAccount = (body: unknown): Account | null => {
  if (typeof body !== 'object' || body === null) return null;
  if (!('id' in body) || typeof body.id !== 'number') return null;
  if (!('username' in body) || typeof body.username !== 'string') return null;
  if (!('email' in body) || typeof body.email !== 'string') return null;
  return { id: body.id, username: body.username, email: body.email };
};

type Reply = { ok: boolean; status: number; body: unknown };

const call = async (path: string, init?: RequestInit): Promise<Reply> => {
  const response = await fetch(`${BASE}${path}`, init);
  // Anything in front of the API answers HTML on a bad day, so parsing must
  // not be the thing that throws.
  const body: unknown = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
};

const postJson = (path: string, payload: unknown): Promise<Reply> =>
  call(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

/// Mirrors the account into the local profile, leaving the appearance
/// preferences alone, and marks the session live.
const adopt = (account: Account): User => {
  const user = updateUser({
    id: String(account.id),
    name: account.username,
    email: account.email,
  });
  setSessionStatus('in');
  return user;
};

const succeed = (reply: Reply): User => {
  const account = readAccount(reply.body);
  if (account === null) throw new Error(FALLBACK_MESSAGE);
  return adopt(account);
};

const fail = (reply: Reply): never => {
  throw new Error(readMessage(reply.body) ?? FALLBACK_MESSAGE);
};

/// Resolves the session the cookie already carries, if any. Never throws: a
/// cold load with no cookie is the normal case, not an error, and a network
/// failure has to leave the app on the sign-in screen rather than wedged on
/// the splash.
export const fetchSession = async (): Promise<void> => {
  try {
    const reply = await call('/me');
    if (!reply.ok) {
      setSessionStatus('out');
      return;
    }
    const account = readAccount(reply.body);
    if (account === null) {
      setSessionStatus('out');
      return;
    }
    adopt(account);
  } catch {
    setSessionStatus('out');
  }
};

export const login = async (email: string, password: string): Promise<User> => {
  const reply = await postJson('/login', { email, password });
  return reply.ok ? succeed(reply) : fail(reply);
};

/// Creating an account does not issue a cookie - `POST /users/create` only
/// writes the row - so a successful signup is immediately followed by a login
/// to get one.
export const register = async (
  username: string,
  email: string,
  password: string,
): Promise<User> => {
  const reply = await postJson('/create', { username, email, password });
  if (!reply.ok) fail(reply);
  return login(email, password);
};

/// Clears the server session and returns the profile to the local default,
/// keeping the theme and accent, which were never the server's to begin with.
export const logout = async (): Promise<void> => {
  try {
    await fetch(`${BASE}/logout`, { method: 'POST' });
  } finally {
    updateUser({ id: DEFAULT_USER.id, name: DEFAULT_USER.name, email: DEFAULT_USER.email });
    setSessionStatus('out');
  }
};
