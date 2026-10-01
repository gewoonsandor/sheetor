const STORAGE_KEY = 'sheetor-user';

const MAX_NAME_LENGTH = 60;
const MAX_EMAIL_LENGTH = 120;

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export const ACCENTS = ['amber', 'teal', 'indigo', 'violet', 'rose'] as const;

export type AccentId = (typeof ACCENTS)[number];

export const ACCENT_LABELS: Record<AccentId, string> = {
  amber: 'Amber',
  teal: 'Teal',
  indigo: 'Indigo',
  violet: 'Violet',
  rose: 'Rose',
};

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export interface User {
  id: string;
  name: string;
  email: string;
  theme: ThemePreference;
  accent: AccentId;
  paperScore: boolean;
}

export type Appearance = Pick<User, 'theme' | 'accent' | 'paperScore'>;

export const DEFAULT_USER: User = {
  id: 'local-user',
  name: 'Local musician',
  email: '',
  theme: 'system',
  accent: 'amber',
  paperScore: false,
};

type UserSource = { [K in keyof User]?: unknown };

const isUserSource = (value: unknown): value is UserSource =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isThemePreference = (value: unknown): value is ThemePreference =>
  THEME_PREFERENCES.some((preference) => preference === value);

export const isAccentId = (value: unknown): value is AccentId =>
  ACCENTS.some((accent) => accent === value);

const readLabel = (value: unknown, max: number, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, max).trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const readUser = (source: UserSource): User => {
  const { id, name, email, theme, accent, paperScore } = source;
  return {
    id: readLabel(id, MAX_NAME_LENGTH, DEFAULT_USER.id),
    name: readLabel(name, MAX_NAME_LENGTH, DEFAULT_USER.name),
    email: typeof email === 'string' ? email.trim().slice(0, MAX_EMAIL_LENGTH) : DEFAULT_USER.email,
    theme: isThemePreference(theme) ? theme : DEFAULT_USER.theme,
    accent: isAccentId(accent) ? accent : DEFAULT_USER.accent,
    paperScore: typeof paperScore === 'boolean' ? paperScore : DEFAULT_USER.paperScore,
  };
};

const discard = (reason: string): void => {
  console.warn(`[sheetor] Discarded the unreadable saved user: ${reason}`);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[sheetor] Could not remove the unreadable saved user', err);
  }
};

const listeners = new Set<() => void>();

let cache: User | null = null;

const readStoredUser = (): User => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[sheetor] Could not read the saved user', err);
    return DEFAULT_USER;
  }
  if (raw === null || raw.length === 0) return DEFAULT_USER;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    discard(err instanceof Error ? err.message : 'unreadable JSON');
    return DEFAULT_USER;
  }

  if (!isUserSource(parsed)) {
    discard('the stored user is not an object');
    return DEFAULT_USER;
  }
  return readUser(parsed);
};

export const loadUser = (): User => {
  cache ??= readStoredUser();
  return cache;
};

export const saveUser = (user: User): void => {
  cache = readUser(user);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('[sheetor] Could not save the user', err);
  }
  listeners.forEach((listener) => listener());
};

export const updateUser = (patch: Partial<User>): User => {
  saveUser({ ...loadUser(), ...patch });
  return loadUser();
};

export const subscribeUser = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getUserSnapshot = (): User => loadUser();

export const deriveInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
};
