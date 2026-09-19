import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import {
  ACCENTS,
  ACCENT_LABELS,
  THEME_LABELS,
  THEME_PREFERENCES,
  deriveInitials,
  getUserSnapshot,
  subscribeUser,
  updateUser,
} from '../../user/userStore';
import { logout } from '../../user/authApi';
import '../SettingsPage.css';

type SettingsRowProps = {
  name: string;
  description: string;
  htmlFor?: string;
  children: ReactNode;
};

const SettingsRow = ({ name, description, htmlFor, children }: SettingsRowProps) => (
  <div className="settings-row">
    <div className="settings-row-label">
      {htmlFor ? (
        <label className="settings-row-name" htmlFor={htmlFor}>
          {name}
        </label>
      ) : (
        <span className="settings-row-name">{name}</span>
      )}
      <span className="settings-row-description">{description}</span>
    </div>
    <div className="settings-row-control">{children}</div>
  </div>
);

export const SettingsPage = () => {
  const user = useSyncExternalStore(subscribeUser, getUserSnapshot);
  const [nameDraft, setNameDraft] = useState<string>(user.name);
  const [emailDraft, setEmailDraft] = useState<string>(user.email);

  const commitName = (): void => {
    setNameDraft(updateUser({ name: nameDraft }).name);
  };

  const commitEmail = (): void => {
    setEmailDraft(updateUser({ email: emailDraft }).email);
  };

  const signOut = (): void => {
    // The gate is subscribed to the session, so clearing it is all that is
    // needed - there is nothing to navigate to.
    void logout();
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <h1 className="page-title">User settings</h1>
        <p className="page-subtitle">
          Signed in as {user.name}. Your account identifies you to the server; the appearance
          below is kept in this browser only. Playback and editor settings live in the editor's
          own command bar.
        </p>
      </header>

      <div className="settings-sections">
        <section className="settings-section">
          <h2 className="settings-section-title">Account</h2>
          <p className="settings-section-note">Your account, and how it appears in this browser.</p>
          <div className="settings-card">
            <SettingsRow name="Avatar" description="Initials are taken from your display name.">
              <span className="app-user-avatar app-user-avatar-lg">{deriveInitials(user.name)}</span>
            </SettingsRow>

            <SettingsRow
              name="Display name"
              description="Shown in the app header. Taken from your account at sign-in; editing it here only changes this browser."
              htmlFor="settings-user-name"
            >
              <input
                id="settings-user-name"
                className="control-input settings-text-input"
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName();
                }}
              />
            </SettingsRow>

            <SettingsRow
              name="Email"
              description="The address you sign in with. Editing it here only relabels this browser's profile."
              htmlFor="settings-user-email"
            >
              <input
                id="settings-user-email"
                className="control-input settings-text-input"
                type="email"
                placeholder="Add an email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                onBlur={commitEmail}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEmail();
                }}
              />
            </SettingsRow>

            <SettingsRow
              name="Session"
              description="Signing out clears the session cookie and returns you to the sign-in screen. Your songs stay in this browser either way."
            >
              <button className="btn" type="button" onClick={signOut}>
                Sign out
              </button>
            </SettingsRow>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Appearance</h2>
          <p className="settings-section-note">How Sheetor looks. The choice applies instantly and survives a reload.</p>
          <div className="settings-card">
            <SettingsRow name="Theme" description="System follows your operating system setting.">
              <div className="settings-choices" role="group" aria-label="Theme">
                {THEME_PREFERENCES.map((preference) => (
                  <button
                    key={preference}
                    type="button"
                    className={`btn${user.theme === preference ? ' btn-active' : ''}`}
                    aria-pressed={user.theme === preference}
                    onClick={() => updateUser({ theme: preference })}
                  >
                    {THEME_LABELS[preference]}
                  </button>
                ))}
              </div>
            </SettingsRow>

            <SettingsRow name="Colour style" description="Tints the accent and the surfaces behind it.">
              <div className="settings-swatches" role="group" aria-label="Colour style">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    data-accent={accent}
                    className={`accent-swatch${user.accent === accent ? ' is-active' : ''}`}
                    aria-pressed={user.accent === accent}
                    aria-label={ACCENT_LABELS[accent]}
                    title={ACCENT_LABELS[accent]}
                    onClick={() => updateUser({ accent })}
                  />
                ))}
              </div>
            </SettingsRow>
          </div>
        </section>
      </div>
    </div>
  );
};
