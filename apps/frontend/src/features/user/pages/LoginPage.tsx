import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import { SSO_LOGIN_URL, fetchAuthConfig, login, register } from '../authApi';
import type { AuthConfig } from '../authApi';
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

/// What the SSO callback's `?sso_error=` codes mean to the person who hit them.
const SSO_ERRORS: Record<string, string> = {
  failed: 'Single sign-on did not complete. Please try again.',
  no_email:
    'Your identity provider did not share an email address. Ask your administrator to release the email claim.',
  email_taken:
    'An account with this email already exists. Ask your administrator to mark the address as verified at the identity provider so the accounts can be linked.',
  not_configured: 'Single sign-on is not configured on this server.',
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
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [params] = useSearchParams();

  useEffect(() => {
    void fetchAuthConfig().then(setConfig);
  }, []);

  const copy = COPY[mode];
  const ssoCode = params.get('sso_error');
  const ssoError = ssoCode === null ? null : (SSO_ERRORS[ssoCode] ?? SSO_ERRORS.failed);
  const shownError = error ?? ssoError;

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

  if (config === null) return <div className="login-splash">Checking sign-in options…</div>;

  const local = config.localEnabled;
  const signup = local && mode === 'signup';

  return (
    <div className="login-screen">
      <form className="login-card card" onSubmit={submit}>
        <div className="login-brand">
          <span className="logo-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M9 3.5 19.5 2v3L9 6.5v9.2a3.3 3.3 0 1 1-2-3V3.5Z" />
            </svg>
          </span>
          <span className="logo-text">Sheetor</span>
        </div>

        <h1 className="login-title">{signup ? copy.title : 'Sign in'}</h1>

        {config.ssoName !== null && (
          <a className="btn btn-primary login-sso" href={SSO_LOGIN_URL}>
            Continue with {config.ssoName}
          </a>
        )}
        {config.ssoName !== null && local && (
          <div className="login-divider">
            <span>or</span>
          </div>
        )}

        {signup && (
          <div className="login-field">
            <label className="login-label" htmlFor="login-username">
              Display name
            </label>
            <input
              id="login-username"
              className="control-input"
              type="text"
              autoComplete="nickname"
              required
              maxLength={64}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        )}

        {local && (
          <div className="login-field">
            <label className="login-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className="control-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        )}

        {local && (
          <div className="login-field">
            <label className="login-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="control-input"
              type="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {signup && (
              <p className="login-hint">
                At least 12 characters, using three of: uppercase, lowercase, digit, symbol.
              </p>
            )}
          </div>
        )}

        {shownError !== null && (
          <p className="form-error" role="alert">
            {shownError}
          </p>
        )}

        {local && (
          <button
            className={`btn login-submit${config.ssoName === null ? ' btn-primary' : ''}`}
            type="submit"
            disabled={pending}
          >
            {pending ? copy.busy : copy.action}
          </button>
        )}

        {local && (
          <button className="login-swap" type="button" onClick={swap} disabled={pending}>
            {copy.swap}
          </button>
        )}
      </form>
    </div>
  );
};
