import type { Clip } from './components/songUtils';

// One clipboard per tab, outside the editor, so a copy survives opening another song.
let current: Clip | null = null;

export const getClip = (): Clip | null => current;

export const setClip = (clip: Clip): void => {
  current = clip;
};
