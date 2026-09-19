import { useState } from 'react';
import type { FormEvent } from 'react';

import { login, register } from '../authApi';
import '../LoginPage.css';

type Mode = 'signin' | 'signup';

const COPY: Record<Mode, { title: string; action: string; busy: string; swap: string }> = {
  signin: {
    title: 'Sign in',
    action: 'Sign in',
    busy: 'Signing in…',
    swap: 'Need an account? Create one',
  },
  signup: {
    title: 'Create an account',
    action: 'Create account',
    busy: 'Creating…',
    swap: 'Already have an account? Sign in',
  },
};

/// Replaces the whole application while there is no session, rather than
/// living at its own route. The URL is therefore untouched, so whatever deep
/// link brought the visitor here still renders once they are in.
export const LoginPage = () => {
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<boolean>(false);

  const copy = COPY[mode];

  const swap = (): void => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      // Nothing is done with the result: both calls mark the session live, and
      // the gate is subscribed to that.
      if (mode === 'signup') await register(username, email, password);
      else await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setPending(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="logo-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M9 3.5 19.5 2v3L9 6.5v9.2a3.3 3.3 0 1 1-2-3V3.5Z" />
            </svg>
          </span>
          <span className="logo-text">Sheetor</span>
        </div>

        <h1 className="login-title">{copy.title}</h1>

        {mode === 'signup' && (
          <div className="login-field">
            <label className="login-label" htmlFor="login-username">
              Display name
            </label>
            <input
              id="login-username"
              className="control-input login-input"
              type="text"
              autoComplete="nickname"
              required
              maxLength={64}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        )}

        <div className="login-field">
          <label className="login-label" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            className="control-input login-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="login-field">
          <label className="login-label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            className="control-input login-input"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'signup' && (
            <p className="login-hint">
              At least 12 characters, using three of: uppercase, lowercase, digit, symbol.
            </p>
          )}
        </div>

        {error !== null && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button className="btn btn-primary login-submit" type="submit" disabled={pending}>
          {pending ? copy.busy : copy.action}
        </button>

        <button className="login-swap" type="button" onClick={swap} disabled={pending}>
          {copy.swap}
        </button>
      </form>
    </div>
  );
};
