import type { TabSong } from './types';
import { parseSong } from './songSchema';

const STORAGE_KEY = 'sheetor-song';
// A rejected autosave is moved here instead of being deleted, so the user can
// still recover the raw JSON by hand.
const INVALID_KEY = 'sheetor-song.invalid';

const quarantine = (raw: string, reason: string): void => {
  console.warn(`[sheetor] Discarded invalid saved song: ${reason}`);
  try {
    localStorage.setItem(INVALID_KEY, raw);
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[sheetor] Could not quarantine the invalid saved song', err);
  }
};

export const loadSong = (fallback: TabSong): TabSong => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[sheetor] Could not read the saved song', err);
    return fallback;
  }
  if (raw === null || raw.length === 0) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    quarantine(raw, err instanceof Error ? err.message : 'unreadable JSON');
    return fallback;
  }

  const result = parseSong(parsed);
  if (!result.ok) {
    quarantine(raw, result.error);
    return fallback;
  }
  return result.song;
};

export const saveSong = (song: TabSong): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(song));
  } catch (err) {
    console.warn('[sheetor] Could not save song', err);
  }
};

export const clearSavedSong = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(INVALID_KEY);
  } catch (err) {
    console.warn('[sheetor] Could not clear the saved song', err);
  }
};
