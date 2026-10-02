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
  // The tab and home-screen icons follow the colour style: each palette has its
  // own folder under /assets, and index.html names emerald's.
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]')) {
    link.href = link.href.replace(/\/assets\/[a-z]+\//, `/assets/${user.accent}/`);
  }
};

export const watchSystemTheme = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(LIGHT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
