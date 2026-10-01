/// The library as the server reports it to one user. Every mutation is an API
/// call (`libraryApi.ts`); this module only types the data and derives the tree.

export type Role = 'owner' | 'editor' | 'viewer';

const ROLES: readonly Role[] = ['owner', 'editor', 'viewer'];

export const isRole = (value: unknown): value is Role => ROLES.includes(value as Role);

export const canEdit = (role: Role): boolean => role !== 'viewer';

// Folders are flat and reference their parent, so the tree is only ever derived.
// A folder shared with you arrives with `parentId: null` when you cannot see its parent.
export interface LibraryFolder {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: number;
  ownerName: string;
  role: Role;
  isShared: boolean;
}

export interface LibraryEntry {
  id: string;
  title: string;
  artist: string;
  // null means the song sits at its owner's library root.
  folderId: string | null;
  ownerId: number;
  role: Role;
  bpm: number;
  trackCount: number;
  barCount: number;
  updatedAt: number;
  updatedByName: string | null;
}

export interface Library {
  folders: LibraryFolder[];
  entries: LibraryEntry[];
}

export interface Share {
  userId: number;
  username: string;
  email: string;
  role: Role;
}

export interface FolderChoice {
  id: string;
  name: string;
  depth: number;
}

// Only which song was open last; the songs themselves live on the server.
const LAST_SONG_KEY = 'sheetor-last-song';

export const rememberSong = (id: string): void => {
  try {
    localStorage.setItem(LAST_SONG_KEY, id);
  } catch (err) {
    console.warn('[sheetor] Could not remember the open song', err);
  }
};

export const lastSongId = (): string | null => {
  try {
    return localStorage.getItem(LAST_SONG_KEY);
  } catch (err) {
    console.warn('[sheetor] Could not read the last open song', err);
    return null;
  }
};

// --- Tree queries ---

const findFolder = (library: Library, id: string): LibraryFolder | undefined =>
  library.folders.find((folder) => folder.id === id);

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

// Most recently changed first, the order the server sends.
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

// Depth-first, name-sorted list for the "move to" menus: only folders in `ownerId`'s
// library that the user may edit, since items never cross owners. `excludeSubtreeId`
// drops a folder and everything under it, which is exactly the set a folder may not
// move into.
export const folderChoices = (
  library: Library,
  ownerId: number,
  excludeSubtreeId: string | null = null,
): FolderChoice[] => {
  const choices: FolderChoice[] = [];
  const walk = (parentId: string | null, depth: number): void => {
    for (const folder of childFolders(library, parentId)) {
      if (folder.id === excludeSubtreeId) continue;
      if (folder.ownerId === ownerId && canEdit(folder.role)) {
        choices.push({ id: folder.id, name: folder.name, depth });
      }
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return choices;
};

// --- Search and order ---

const fold = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Every query word must occur in the title or the artist, ignoring case and
// accents. Keeps the server order; a blank query finds nothing.
export const searchSongs = (library: Library, query: string): LibraryEntry[] => {
  const words = fold(query).split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [];
  return library.entries.filter((entry) => {
    const haystack = `${fold(entry.title)} ${fold(entry.artist)}`;
    return words.every((word) => haystack.includes(word));
  });
};

export type SongOrder = 'updated' | 'title';

// 'updated' is the server order; 'title' is natural order with untitled songs last.
export const sortSongs = (entries: LibraryEntry[], order: SongOrder): LibraryEntry[] => {
  const sorted = [...entries];
  if (order === 'title') {
    sorted.sort((a, b) => {
      if (!a.title || !b.title) return Number(!a.title) - Number(!b.title);
      return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
    });
  }
  return sorted;
};
