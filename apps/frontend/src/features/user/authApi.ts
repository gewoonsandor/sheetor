import { FALLBACK_MESSAGE, failWith, request, sendJson } from '../../app/http';
import type { Reply } from '../../app/http';
import { DEFAULT_USER, updateUser } from './userStore';
import type { User } from './userStore';
import { setSessionStatus } from './session';

const BASE = '/api/v1/users';

export const SSO_LOGIN_URL = '/api/v1/auth/sso/login';

export interface AuthConfig {
  localEnabled: boolean;
  ssoName: string | null;
}

const DEFAULT_AUTH_CONFIG: AuthConfig = { localEnabled: true, ssoName: null };

type Account = { id: number; username: string; email: string };

const readAccount = (body: unknown): Account | null => {
  if (typeof body !== 'object' || body === null) return null;
  if (!('id' in body) || typeof body.id !== 'number') return null;
  if (!('username' in body) || typeof body.username !== 'string') return null;
  if (!('email' in body) || typeof body.email !== 'string') return null;
  return { id: body.id, username: body.username, email: body.email };
};

const readAuthConfig = (body: unknown): AuthConfig | null => {
  if (typeof body !== 'object' || body === null) return null;
  if (!('local_enabled' in body) || typeof body.local_enabled !== 'boolean') return null;
  if (!('sso_name' in body)) return null;
  const ssoName = body.sso_name;
  if (ssoName !== null && typeof ssoName !== 'string') return null;
  return { localEnabled: body.local_enabled, ssoName };
};

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

/// Resolves the session the cookie already carries, if any. Never throws: a
/// cold load with no cookie is the normal case, not an error, and a network
/// failure has to leave the app on the sign-in screen rather than wedged on
/// the splash.
export const fetchSession = async (): Promise<void> => {
  try {
    const reply = await request(`${BASE}/me`);
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

/// Which sign-in methods the server offers. Never throws: on any failure the
/// page falls back to the email form, which the server itself still guards.
export const fetchAuthConfig = async (): Promise<AuthConfig> => {
  try {
    const reply = await request('/api/v1/auth/config');
    return (reply.ok ? readAuthConfig(reply.body) : null) ?? DEFAULT_AUTH_CONFIG;
  } catch {
    return DEFAULT_AUTH_CONFIG;
  }
};

export const login = async (email: string, password: string): Promise<User> => {
  const reply = await sendJson('POST', `${BASE}/login`, { email, password });
  return reply.ok ? succeed(reply) : failWith(reply);
};

/// Creating an account does not issue a cookie - `POST /users/create` only
/// writes the row - so a successful signup is immediately followed by a login
/// to get one.
export const register = async (
  username: string,
  email: string,
  password: string,
): Promise<User> => {
  const reply = await sendJson('POST', `${BASE}/create`, { username, email, password });
  if (!reply.ok) failWith(reply);
  return login(email, password);
};

export const renameAccount = async (name: string): Promise<User> => {
  const reply = await sendJson('PUT', `${BASE}/me/name`, { username: name });
  return reply.ok ? succeed(reply) : failWith(reply);
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
