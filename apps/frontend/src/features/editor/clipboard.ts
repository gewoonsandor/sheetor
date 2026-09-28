import type { Clip } from './components/songUtils';

// One clipboard per tab, outside the editor, so a copy survives opening another song.
let current: Clip | null = null;
const listeners = new Set<() => void>();

export const getClip = (): Clip | null => current;

export const setClip = (clip: Clip): void => {
  current = clip;
  listeners.forEach(listener => listener());
};

export const subscribeClip = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
