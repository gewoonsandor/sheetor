import type { ThemePreference, User } from './userStore';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

export const resolveTheme = (preference: ThemePreference): 'light' | 'dark' => {
  if (preference !== 'system') return preference;
  return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark';
};

export const applyTheme = (user: Pick<User, 'theme' | 'accent'>): void => {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(user.theme);
  root.dataset.accent = user.accent;
};

export const watchSystemTheme = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(LIGHT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
