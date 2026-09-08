const STORAGE_KEY = 'sheetor-settings';

const MIN_VOLUME = 0;
const MAX_VOLUME = 1;
const MIN_BPM = 30;
const MAX_BPM = 300;

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export interface AppSettings {
  masterVolume: number;
  playbackSpeed: number;
  loopPlayback: boolean;
  showToolPanel: boolean;
  readOnly: boolean;
  defaultBpm: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  masterVolume: 0.8,
  playbackSpeed: 1,
  loopPlayback: false,
  showToolPanel: true,
  readOnly: false,
  defaultBpm: 120,
};

type SettingsSource = { [K in keyof AppSettings]?: unknown };

const isSettingsSource = (value: unknown): value is SettingsSource =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const isPlaybackSpeed = (value: unknown): value is number =>
  typeof value === 'number' && PLAYBACK_SPEEDS.some((speed) => speed === value);

const readSettings = (source: SettingsSource): AppSettings => {
  const { masterVolume, playbackSpeed, loopPlayback, showToolPanel, readOnly, defaultBpm } = source;
  return {
    masterVolume:
      typeof masterVolume === 'number' && Number.isFinite(masterVolume)
        ? Math.min(Math.max(masterVolume, MIN_VOLUME), MAX_VOLUME)
        : DEFAULT_SETTINGS.masterVolume,
    playbackSpeed: isPlaybackSpeed(playbackSpeed) ? playbackSpeed : DEFAULT_SETTINGS.playbackSpeed,
    loopPlayback: readBoolean(loopPlayback, DEFAULT_SETTINGS.loopPlayback),
    showToolPanel: readBoolean(showToolPanel, DEFAULT_SETTINGS.showToolPanel),
    readOnly: readBoolean(readOnly, DEFAULT_SETTINGS.readOnly),
    defaultBpm:
      typeof defaultBpm === 'number' && Number.isFinite(defaultBpm)
        ? Math.min(Math.max(Math.floor(defaultBpm), MIN_BPM), MAX_BPM)
        : DEFAULT_SETTINGS.defaultBpm,
  };
};

const discard = (reason: string): void => {
  console.warn(`[sheetor] Discarded unreadable saved settings: ${reason}`);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[sheetor] Could not remove the unreadable saved settings', err);
  }
};

export const loadSettings = (): AppSettings => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[sheetor] Could not read the saved settings', err);
    return DEFAULT_SETTINGS;
  }
  if (raw === null || raw.length === 0) return DEFAULT_SETTINGS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    discard(err instanceof Error ? err.message : 'unreadable JSON');
    return DEFAULT_SETTINGS;
  }

  if (!isSettingsSource(parsed)) {
    discard('the stored settings are not an object');
    return DEFAULT_SETTINGS;
  }
  return readSettings(parsed);
};

export const saveSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readSettings(settings)));
  } catch (err) {
    console.warn('[sheetor] Could not save settings', err);
  }
};

export const updateSettings = (patch: Partial<AppSettings>): AppSettings => {
  const merged = readSettings({ ...loadSettings(), ...patch });
  saveSettings(merged);
  return merged;
};
