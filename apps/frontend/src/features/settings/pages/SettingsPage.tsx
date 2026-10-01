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
} from '../../user/userStore';
import type { Appearance } from '../../user/userStore';
import { logout, renameAccount, saveAppearance } from '../../user/authApi';
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
  const [nameError, setNameError] = useState<string | null>(null);
  const [appearanceError, setAppearanceError] = useState<string | null>(null);

  const commitName = async (): Promise<void> => {
    if (nameDraft === user.name) return;
    setNameError(null);
    try {
      setNameDraft((await renameAccount(nameDraft)).name);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not rename your account.');
      setNameDraft(user.name);
    }
  };

  const changeAppearance = (patch: Partial<Appearance>): void => {
    setAppearanceError(null);
    saveAppearance(patch).catch((err: unknown) => {
      setAppearanceError(
        err instanceof Error ? err.message : 'Could not save your appearance to your account.',
      );
    });
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
          Signed in as {user.name}. Your account and your appearance are saved on the server and
          follow you to every browser. Playback and editor settings live in the editor's own
          command bar.
        </p>
      </header>

      <div className="settings-sections">
        <section className="settings-section">
          <h2 className="settings-section-title">Account</h2>
          <p className="settings-section-note">Your account on this server.</p>
          <div className="settings-card">
            <SettingsRow name="Avatar" description="Initials are taken from your display name.">
              <span className="app-user-avatar app-user-avatar-lg">{deriveInitials(user.name)}</span>
            </SettingsRow>

            <SettingsRow
              name="Display name"
              description="Shown in the app header and to the people you share folders with."
              htmlFor="settings-user-name"
            >
              <input
                id="settings-user-name"
                className="control-input settings-text-input"
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void commitName()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitName();
                }}
              />
              {nameError !== null && (
                <p className="settings-error" role="alert">
                  {nameError}
                </p>
              )}
            </SettingsRow>

            <SettingsRow name="Email" description="The address you sign in with and are shared with.">
              <span className="settings-value">{user.email}</span>
            </SettingsRow>

            <SettingsRow
              name="Session"
              description="Signs you out of this browser. Your library is stored on the server."
            >
              <button className="btn" type="button" onClick={signOut}>
                Sign out
              </button>
            </SettingsRow>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Appearance</h2>
          <p className="settings-section-note">How Sheetor looks. Saved to your account and applied instantly.</p>
          <div className="settings-card">
            <SettingsRow name="Theme" description="System follows your operating system setting.">
              <div className="settings-choices" role="group" aria-label="Theme">
                {THEME_PREFERENCES.map((preference) => (
                  <button
                    key={preference}
                    type="button"
                    className={`btn${user.theme === preference ? ' btn-active' : ''}`}
                    aria-pressed={user.theme === preference}
                    onClick={() => changeAppearance({ theme: preference })}
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
                    onClick={() => changeAppearance({ accent })}
                  />
                ))}
              </div>
            </SettingsRow>
          </div>
          {appearanceError !== null && (
            <p className="settings-error" role="alert">
              {appearanceError}
            </p>
          )}
        </section>
      </div>
    </div>
  );
};
