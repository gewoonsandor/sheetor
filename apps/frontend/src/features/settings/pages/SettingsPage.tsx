import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { AppSettings } from '../settingsStore';
import {
  DEFAULT_SETTINGS,
  PLAYBACK_SPEEDS,
  loadSettings,
  saveSettings,
  updateSettings,
} from '../settingsStore';
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
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [bpmDraft, setBpmDraft] = useState<string>(() => String(settings.defaultBpm));
  const [nameDraft, setNameDraft] = useState<string>(user.name);
  const [emailDraft, setEmailDraft] = useState<string>(user.email);

  const apply = (patch: Partial<AppSettings>): void => {
    setSettings(updateSettings(patch));
  };

  const commitBpm = (): void => {
    const parsed = Number.parseInt(bpmDraft, 10);
    const next = updateSettings({
      defaultBpm: Number.isNaN(parsed) ? settings.defaultBpm : parsed,
    });
    setSettings(next);
    setBpmDraft(String(next.defaultBpm));
  };

  const resetToDefaults = (): void => {
    saveSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
    setBpmDraft(String(DEFAULT_SETTINGS.defaultBpm));
  };

  const commitName = (): void => {
    setNameDraft(updateUser({ name: nameDraft }).name);
  };

  const commitEmail = (): void => {
    setEmailDraft(updateUser({ email: emailDraft }).email);
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <h1 className="page-title">User settings</h1>
        <p className="page-subtitle">
          Signed in locally as {user.name}. Preferences are kept in this browser only — nothing
          leaves your machine, and clearing site data restores the defaults.
        </p>
      </header>

      <div className="settings-sections">
        <section className="settings-section">
          <h2 className="settings-section-title">Account</h2>
          <p className="settings-section-note">Who you are in this browser. There is no sign-in yet.</p>
          <div className="settings-card">
            <SettingsRow name="Avatar" description="Initials are taken from your display name.">
              <span className="app-user-avatar app-user-avatar-lg">{deriveInitials(user.name)}</span>
            </SettingsRow>

            <SettingsRow
              name="Display name"
              description="Shown in the app header. This profile lives in this browser; there is no account to sign in to."
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
              description="Optional label for this profile. Nothing is sent anywhere."
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

        <section className="settings-section">
          <h2 className="settings-section-title">Playback</h2>
          <p className="settings-section-note">How the transport sounds and behaves when you play a song.</p>
          <div className="settings-card">
            <SettingsRow
              name="Master volume"
              description="Output level for every voice while a song is playing."
              htmlFor="settings-master-volume"
            >
              <input
                id="settings-master-volume"
                className="settings-slider"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.masterVolume}
                onChange={(e) => apply({ masterVolume: Number.parseFloat(e.target.value) })}
              />
              <span className="settings-readout">{Math.round(settings.masterVolume * 100)}%</span>
            </SettingsRow>

            <SettingsRow
              name="Playback speed"
              description="Multiplier applied to the tempo written in the score."
            >
              <div className="settings-speeds" role="group" aria-label="Playback speed">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={`btn${speed === settings.playbackSpeed ? ' btn-active' : ''}`}
                    aria-pressed={speed === settings.playbackSpeed}
                    onClick={() => apply({ playbackSpeed: speed })}
                  >
                    {speed}&#215;
                  </button>
                ))}
              </div>
            </SettingsRow>

            <SettingsRow
              name="Loop playback"
              description="Start again from the first measure instead of stopping at the end."
            >
              <button
                type="button"
                className={`btn${settings.loopPlayback ? ' btn-active' : ''}`}
                onClick={() => apply({ loopPlayback: !settings.loopPlayback })}
              >
                {settings.loopPlayback ? 'Loop on' : 'Loop off'}
              </button>
            </SettingsRow>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Editor</h2>
          <p className="settings-section-note">Defaults applied every time the editor loads.</p>
          <div className="settings-card">
            <SettingsRow
              name="Fretboard and keyboard panel"
              description="Default when the editor loads; you can still toggle the panel while editing."
            >
              <button
                type="button"
                className={`btn${settings.showToolPanel ? ' btn-active' : ''}`}
                onClick={() => apply({ showToolPanel: !settings.showToolPanel })}
              >
                {settings.showToolPanel ? 'Shown' : 'Hidden'}
              </button>
            </SettingsRow>

            <SettingsRow
              name="Read-only mode"
              description="Default when the editor loads; note entry stays blocked until you turn it off."
            >
              <button
                type="button"
                className={`btn${settings.readOnly ? ' btn-active' : ''}`}
                onClick={() => apply({ readOnly: !settings.readOnly })}
              >
                {settings.readOnly ? 'On' : 'Off'}
              </button>
            </SettingsRow>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">New songs</h2>
          <p className="settings-section-note">Starting values for songs you create from scratch.</p>
          <div className="settings-card">
            <SettingsRow
              name="Default tempo"
              description="The tempo a newly created song starts at, between 30 and 300 BPM."
              htmlFor="settings-default-bpm"
            >
              <input
                id="settings-default-bpm"
                className="control-input"
                type="number"
                min="30"
                max="300"
                value={bpmDraft}
                onChange={(e) => setBpmDraft(e.target.value)}
                onBlur={commitBpm}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitBpm();
                }}
              />
              <span className="control-label">bpm</span>
            </SettingsRow>

            <SettingsRow
              name="Reset to defaults"
              description="Puts playback, editor and new-song settings back to their shipped values. Your name and appearance are untouched."
            >
              <button type="button" className="btn btn-danger" onClick={resetToDefaults}>
                Reset to defaults
              </button>
            </SettingsRow>
          </div>
        </section>
      </div>
    </div>
  );
};
