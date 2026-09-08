import type { TabSong } from '../editor/components/types';
import { isRecord, parseSong } from '../editor/components/songSchema';
import { createId } from '../editor/components/songUtils';

export interface LibraryEntry {
  id: string;
  title: string;
  artist: string;
  updatedAt: number;
  // null means the song sits at the library root.
  folderId: string | null;
  song: TabSong;
}

// Folders are stored flat and reference their parent, so a move is a one-field
// edit and no mutator ever has to rewrite a nested tree.
export interface LibraryFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Library {
  entries: LibraryEntry[];
  folders: LibraryFolder[];
  currentId: string | null;
}

export interface FolderChoice {
  id: string;
  name: string;
  depth: number;
}

const STORAGE_KEY = 'sheetor-library';
// A rejected library blob is moved here instead of being deleted, so the user
// can still recover the raw JSON by hand.
const INVALID_KEY = 'sheetor-library.invalid';
// The single-song key written by every build before the library existed.
const LEGACY_KEY = 'sheetor-song';

const emptyLibrary = (): Library => ({ entries: [], folders: [], currentId: null });

export const saveLibrary = (library: Library): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch (err) {
    console.warn('[sheetor] Could not save the library', err);
  }
};

// --- Tree queries ---

const findFolder = (library: Library, id: string): LibraryFolder | undefined =>
  library.folders.find((folder) => folder.id === id);

const folderExists = (library: Library, id: string | null): boolean =>
  id === null || library.folders.some((folder) => folder.id === id);

// True when `id` sits anywhere below `ancestorId`. Guards the move against
// folding a folder into its own subtree.
const hasAncestor = (library: Library, id: string, ancestorId: string): boolean => {
  const seen = new Set<string>([id]);
  let cursor = findFolder(library, id)?.parentId ?? null;
  while (cursor !== null && !seen.has(cursor)) {
    if (cursor === ancestorId) return true;
    seen.add(cursor);
    cursor = findFolder(library, cursor)?.parentId ?? null;
  }
  return false;
};

// Root first, the named folder last. Empty for the root or an unknown id.
export const folderPath = (library: Library, id: string | null): LibraryFolder[] => {
  const path: LibraryFolder[] = [];
  const seen = new Set<string>();
  let cursor = id;
  while (cursor !== null && !seen.has(cursor)) {
    const folder = findFolder(library, cursor);
    if (!folder) return [];
    seen.add(cursor);
    path.unshift(folder);
    cursor = folder.parentId;
  }
  return path;
};

// Sibling folders read as a name-sorted shelf, not in creation order.
export const childFolders = (library: Library, parentId: string | null): LibraryFolder[] =>
  library.folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

// Newest-touched first, matching the order entries are stored in.
export const songsIn = (library: Library, folderId: string | null): LibraryEntry[] =>
  library.entries.filter((entry) => entry.folderId === folderId);

// Counts the whole subtree, so a folder of folders still reads as non-empty.
export const countSongsIn = (library: Library, folderId: string | null): number => {
  const subtree = new Set<string | null>([folderId]);
  const pending: (string | null)[] = [folderId];
  for (let i = 0; i < pending.length; i += 1) {
    for (const folder of library.folders) {
      if (folder.parentId === pending[i] && !subtree.has(folder.id)) {
        subtree.add(folder.id);
        pending.push(folder.id);
      }
    }
  }

  let total = 0;
  for (const entry of library.entries) {
    if (subtree.has(entry.folderId)) total += 1;
  }
  return total;
};

// Depth-first, name-sorted list for the "move to" menus. `excludeSubtreeId`
// drops a folder and everything under it, which is exactly the set a folder
// may not move into.
export const folderChoices = (
  library: Library,
  excludeSubtreeId: string | null = null,
): FolderChoice[] => {
  const choices: FolderChoice[] = [];
  const walk = (parentId: string | null, depth: number): void => {
    for (const folder of childFolders(library, parentId)) {
      if (folder.id === excludeSubtreeId) continue;
      choices.push({ id: folder.id, name: folder.name, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return choices;
};

// --- Song mutators ---

export const addSong = (
  library: Library,
  song: TabSong,
  folderId: string | null = null,
): { library: Library; entry: LibraryEntry } => {
  const entry: LibraryEntry = {
    id: createId(),
    title: song.title,
    artist: song.artist,
    updatedAt: Date.now(),
    folderId: folderExists(library, folderId) ? folderId : null,
    song,
  };
  return {
    library: { ...library, entries: [entry, ...library.entries], currentId: entry.id },
    entry,
  };
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
    folderId: original.folderId,
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
  return { ...library, entries, currentId };
};

// Moving is not editing: the entry keeps its place in the recency order and its
// `updatedAt`.
export const moveSong = (library: Library, id: string, folderId: string | null): Library => {
  const entry = library.entries.find((it) => it.id === id);
  if (!entry || entry.folderId === folderId || !folderExists(library, folderId)) return library;
  return {
    ...library,
    entries: library.entries.map((it) => (it.id === id ? { ...it, folderId } : it)),
  };
};

export const setCurrentSong = (library: Library, id: string | null): Library => {
  if (id !== null && !library.entries.some((entry) => entry.id === id)) return library;
  return { ...library, currentId: id };
};

export const getCurrentEntry = (library: Library): LibraryEntry | null =>
  library.entries.find((entry) => entry.id === library.currentId) ?? null;

// --- Folder mutators ---

export const createFolder = (
  library: Library,
  name: string,
  parentId: string | null = null,
): { library: Library; folder: LibraryFolder } => {
  const trimmed = name.trim();
  const folder: LibraryFolder = {
    id: createId(),
    name: trimmed.length > 0 ? trimmed : 'New folder',
    parentId: folderExists(library, parentId) ? parentId : null,
  };
  return { library: { ...library, folders: [...library.folders, folder] }, folder };
};

export const renameFolder = (library: Library, id: string, name: string): Library => {
  const trimmed = name.trim();
  const folder = findFolder(library, id);
  if (!folder || trimmed.length === 0 || folder.name === trimmed) return library;
  return {
    ...library,
    folders: library.folders.map((it) => (it.id === id ? { ...it, name: trimmed } : it)),
  };
};

export const moveFolder = (library: Library, id: string, parentId: string | null): Library => {
  const folder = findFolder(library, id);
  if (!folder || folder.parentId === parentId || id === parentId) return library;
  if (!folderExists(library, parentId)) return library;
  if (parentId !== null && hasAncestor(library, parentId, id)) return library;
  return {
    ...library,
    folders: library.folders.map((it) => (it.id === id ? { ...it, parentId } : it)),
  };
};

// Deleting a folder never deletes a song: the folders and songs it held move up
// to where it lived, so the only way to lose music is `deleteSong`.
export const deleteFolder = (library: Library, id: string): Library => {
  const folder = findFolder(library, id);
  if (!folder) return library;
  const { parentId } = folder;
  return {
    ...library,
    folders: library.folders
      .filter((it) => it.id !== id)
      .map((it) => (it.parentId === id ? { ...it, parentId } : it)),
    entries: library.entries.map((it) => (it.folderId === id ? { ...it, folderId: parentId } : it)),
  };
};

// --- Loading ---

const parseEntry = (value: unknown): LibraryEntry | null => {
  if (!isRecord(value)) return null;
  const { id, title, artist, updatedAt, folderId } = value;
  if (typeof id !== 'string' || id.length === 0) return null;

  const result = parseSong(value.song);
  if (!result.ok) return null;
  const song = result.song;

  return {
    id,
    title: typeof title === 'string' ? title : song.title,
    artist: typeof artist === 'string' ? artist : song.artist,
    updatedAt: typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    folderId: typeof folderId === 'string' && folderId.length > 0 ? folderId : null,
    song,
  };
};

const parseFolder = (value: unknown): LibraryFolder | null => {
  if (!isRecord(value)) return null;
  const { id, name, parentId } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return {
    id,
    name: trimmed.length > 0 ? trimmed : 'Untitled folder',
    parentId: typeof parentId === 'string' && parentId.length > 0 ? parentId : null,
  };
};

// A hand-edited blob can point a folder at a missing parent or into a cycle.
// Both are repaired by reparenting to the root — dropping the folder instead
// would strand every song inside it — and the cut is as small as possible: only
// the folders actually in the cycle move, so anything hanging below one keeps
// its place once its ancestors are rooted again.
const parseFolders = (value: unknown): LibraryFolder[] => {
  if (!Array.isArray(value)) return [];

  const folders: LibraryFolder[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    const folder = parseFolder(raw);
    if (!folder || ids.has(folder.id)) continue;
    ids.add(folder.id);
    folders.push(folder);
  }

  const parents = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  const closesLoop = (id: string): boolean => {
    const seen = new Set<string>([id]);
    let cursor = parents.get(id) ?? null;
    while (cursor !== null) {
      if (cursor === id) return true;
      // A loop that does not run through `id` is someone else's to break.
      if (seen.has(cursor) || !parents.has(cursor)) return false;
      seen.add(cursor);
      cursor = parents.get(cursor) ?? null;
    }
    return false;
  };

  return folders.map((folder) => {
    if (folder.parentId === null) return folder;
    if (!parents.has(folder.parentId)) return { ...folder, parentId: null };
    return closesLoop(folder.id) ? { ...folder, parentId: null } : folder;
  });
};

// Returns null when the blob is unusable as a whole; an entry that fails
// validation is merely dropped, so one bad song never costs the whole library.
// A library saved before folders existed simply has none.
const parseLibrary = (value: unknown): Library | null => {
  if (!isRecord(value) || !Array.isArray(value.entries)) return null;

  const folders = parseFolders(value.folders);
  const folderIds = new Set(folders.map((folder) => folder.id));

  const entries: LibraryEntry[] = [];
  for (const raw of value.entries) {
    const entry = parseEntry(raw);
    if (!entry) continue;
    entries.push(
      entry.folderId !== null && !folderIds.has(entry.folderId)
        ? { ...entry, folderId: null }
        : entry,
    );
  }

  const stored = value.currentId;
  const currentId = typeof stored === 'string' && entries.some((entry) => entry.id === stored)
    ? stored
    : entries.length > 0 ? entries[0].id : null;

  return { entries, folders, currentId };
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
