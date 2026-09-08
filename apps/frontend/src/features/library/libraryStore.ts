import type { TabSong } from '../editor/components/types';
import { isRecord, parseSong } from '../editor/components/songSchema';
import { createId } from '../editor/components/songUtils';

export interface LibraryEntry {
  id: string;
  title: string;
  artist: string;
  updatedAt: number;
  song: TabSong;
}

export interface Library {
  entries: LibraryEntry[];
  currentId: string | null;
}

const STORAGE_KEY = 'sheetor-library';
// A rejected library blob is moved here instead of being deleted, so the user
// can still recover the raw JSON by hand.
const INVALID_KEY = 'sheetor-library.invalid';
// The single-song key written by every build before the library existed.
const LEGACY_KEY = 'sheetor-song';

const emptyLibrary = (): Library => ({ entries: [], currentId: null });

export const saveLibrary = (library: Library): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch (err) {
    console.warn('[sheetor] Could not save the library', err);
  }
};

export const addSong = (library: Library, song: TabSong): { library: Library; entry: LibraryEntry } => {
  const entry: LibraryEntry = {
    id: createId(),
    title: song.title,
    artist: song.artist,
    updatedAt: Date.now(),
    song,
  };
  return { library: { entries: [entry, ...library.entries], currentId: entry.id }, entry };
};

export const replaceSong = (library: Library, id: string, song: TabSong): Library => {
  const existing = library.entries.find((entry) => entry.id === id);
  if (!existing) return library;
  const updated: LibraryEntry = {
    ...existing,
    title: song.title,
    artist: song.artist,
    updatedAt: Date.now(),
    song,
  };
  return {
    ...library,
    entries: [updated, ...library.entries.filter((entry) => entry.id !== id)],
  };
};

export const duplicateSong = (library: Library, id: string): Library => {
  const index = library.entries.findIndex((entry) => entry.id === id);
  if (index === -1) return library;
  const original = library.entries[index];
  const copy: LibraryEntry = {
    id: createId(),
    title: `${original.title} (copy)`,
    artist: original.artist,
    updatedAt: Date.now(),
    song: { ...structuredClone(original.song), title: `${original.song.title} (copy)` },
  };
  return {
    ...library,
    entries: [...library.entries.slice(0, index + 1), copy, ...library.entries.slice(index + 1)],
  };
};

export const deleteSong = (library: Library, id: string): Library => {
  const entries = library.entries.filter((entry) => entry.id !== id);
  if (entries.length === library.entries.length) return library;
  const currentId = library.currentId === id
    ? (entries.length > 0 ? entries[0].id : null)
    : library.currentId;
  return { entries, currentId };
};

export const setCurrentSong = (library: Library, id: string | null): Library => {
  if (id !== null && !library.entries.some((entry) => entry.id === id)) return library;
  return { ...library, currentId: id };
};

export const getCurrentEntry = (library: Library): LibraryEntry | null =>
  library.entries.find((entry) => entry.id === library.currentId) ?? null;

const parseEntry = (value: unknown): LibraryEntry | null => {
  if (!isRecord(value)) return null;
  const { id, title, artist, updatedAt } = value;
  if (typeof id !== 'string' || id.length === 0) return null;

  const result = parseSong(value.song);
  if (!result.ok) return null;
  const song = result.song;

  return {
    id,
    title: typeof title === 'string' ? title : song.title,
    artist: typeof artist === 'string' ? artist : song.artist,
    updatedAt: typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    song,
  };
};

// Returns null when the blob is unusable as a whole; an entry that fails
// validation is merely dropped, so one bad song never costs the whole library.
const parseLibrary = (value: unknown): Library | null => {
  if (!isRecord(value) || !Array.isArray(value.entries)) return null;

  const entries: LibraryEntry[] = [];
  for (const raw of value.entries) {
    const entry = parseEntry(raw);
    if (entry) entries.push(entry);
  }

  const stored = value.currentId;
  const currentId = typeof stored === 'string' && entries.some((entry) => entry.id === stored)
    ? stored
    : entries.length > 0 ? entries[0].id : null;

  return { entries, currentId };
};

const quarantine = (raw: string, reason: string): void => {
  console.warn(`[sheetor] Discarded invalid saved library: ${reason}`);
  try {
    localStorage.setItem(INVALID_KEY, raw);
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[sheetor] Could not quarantine the invalid saved library', err);
  }
};

const migrateLegacySong = (): Library => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch (err) {
    console.warn('[sheetor] Could not read the legacy saved song', err);
    return emptyLibrary();
  }
  if (raw === null || raw.length === 0) return emptyLibrary();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('[sheetor] Could not migrate the legacy saved song', err);
    return emptyLibrary();
  }

  const result = parseSong(parsed);
  if (!result.ok) {
    console.warn(`[sheetor] Could not migrate the legacy saved song: ${result.error}`);
    return emptyLibrary();
  }

  const { library } = addSong(emptyLibrary(), result.song);
  saveLibrary(library);
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch (err) {
    console.warn('[sheetor] Could not remove the legacy saved song', err);
  }
  return library;
};

export const loadLibrary = (): Library => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[sheetor] Could not read the saved library', err);
    return emptyLibrary();
  }
  if (raw === null || raw.length === 0) return migrateLegacySong();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    quarantine(raw, err instanceof Error ? err.message : 'unreadable JSON');
    return migrateLegacySong();
  }

  const library = parseLibrary(parsed);
  if (!library) {
    quarantine(raw, 'a library must be an object with an entries array');
    return migrateLegacySong();
  }
  return library;
};
