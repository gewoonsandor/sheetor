import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { TabSong } from '../../../src/features/editor/components/types';
import { createTrack } from '../../../src/features/editor/components/songUtils';
import type { Library, LibraryFolder } from '../../../src/features/library/libraryStore';
import {
  addSong, childFolders, countSongsIn, createFolder, deleteFolder, deleteSong, duplicateSong,
  folderChoices, folderPath, getCurrentEntry, loadLibrary, moveFolder, moveSong, renameFolder,
  replaceSong, saveLibrary, setCurrentSong, songsIn,
} from '../../../src/features/library/libraryStore';

interface MemoryStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  readonly size: number;
}

const makeMemoryStorage = (): MemoryStorage => {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    get size() {
      return entries.size;
    },
  };
};

const song = (title: string): TabSong => ({
  title,
  artist: 'Band',
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  tracks: [{ ...createTrack('guitar'), measures: [{ id: 'm1', beats: [{ id: 'b1', duration: '4', notes: [{ stringIndex: 0, fret: 3 }] }] }] }],
});

const entry = (id: string, title: string): Record<string, unknown> => ({
  id,
  title,
  artist: 'Band',
  updatedAt: 1700000000000,
  song: song(title),
});

const libraryOf = (...titles: string[]): Library => ({
  entries: titles.map((title, index) => ({
    id: `id-${index}`,
    title,
    artist: 'Band',
    updatedAt: 1700000000000 + index,
    folderId: null,
    song: song(title),
  })),
  folders: [],
  currentId: titles.length > 0 ? 'id-0' : null,
});

const folder = (id: string, name: string, parentId: string | null = null): LibraryFolder =>
  ({ id, name, parentId });

// Fixtures place songs and folders by hand: never through the mutators under test.
const shelve = (library: Library, placements: Record<string, string | null>): Library => ({
  ...library,
  entries: library.entries.map((it) => (it.id in placements ? { ...it, folderId: placements[it.id] } : it)),
});

const readStored = (key: string): unknown => {
  const raw = storage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
};

let storage: MemoryStorage;

beforeEach(() => {
  storage = makeMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('loadLibrary', () => {
  it('returns an empty library and writes nothing when storage is empty', () => {
    expect(loadLibrary()).toEqual({ entries: [], folders: [], currentId: null });
    expect(storage.size).toBe(0);
  });

  it('round-trips a saved library, folders and all', () => {
    const library: Library = {
      ...shelve(libraryOf('One', 'Two'), { 'id-1': 'f2' }),
      folders: [folder('f1', 'Practice'), folder('f2', 'Bach', 'f1')],
    };
    saveLibrary(library);
    expect(loadLibrary()).toEqual(library);
  });

  it('migrates the legacy single-song key and consumes it', () => {
    const legacy = song('Legacy');
    storage.setItem('sheetor-song', JSON.stringify(legacy));

    const library = loadLibrary();

    expect(library.entries).toHaveLength(1);
    expect(library.entries[0].title).toBe('Legacy');
    expect(library.entries[0].artist).toBe('Band');
    expect(library.entries[0].folderId).toBeNull();
    expect(library.entries[0].song).toEqual(legacy);
    expect(library.folders).toEqual([]);
    expect(library.currentId).toBe(library.entries[0].id);
    expect(storage.getItem('sheetor-song')).toBeNull();
    expect(readStored('sheetor-library')).toEqual(library);
  });

  it('leaves a quarantined legacy song untouched and ignores an invalid legacy blob', () => {
    storage.setItem('sheetor-song', '{"title":"x"}');
    storage.setItem('sheetor-song.invalid', '{old}');

    expect(loadLibrary()).toEqual({ entries: [], folders: [], currentId: null });
    expect(storage.getItem('sheetor-song.invalid')).toBe('{old}');
    expect(storage.getItem('sheetor-library')).toBeNull();
  });

  it('quarantines unreadable JSON', () => {
    storage.setItem('sheetor-library', '{not json');

    expect(loadLibrary()).toEqual({ entries: [], folders: [], currentId: null });
    expect(storage.getItem('sheetor-library')).toBeNull();
    expect(storage.getItem('sheetor-library.invalid')).toBe('{not json');
  });

  it('quarantines a root without an entries array, then still migrates the legacy song', () => {
    storage.setItem('sheetor-library', '{"entries":"nope"}');
    storage.setItem('sheetor-song', JSON.stringify(song('Legacy')));

    const library = loadLibrary();

    expect(library.entries).toHaveLength(1);
    expect(library.entries[0].title).toBe('Legacy');
    expect(storage.getItem('sheetor-library.invalid')).toBe('{"entries":"nope"}');
    expect(storage.getItem('sheetor-song')).toBeNull();
    expect(readStored('sheetor-library')).toEqual(library);
  });

  it('drops entries whose song fails validation or that have no id', () => {
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [entry('a', 'Keep'), { id: 'b', song: { title: 'broken' } }, { song: song('No id') }],
      currentId: 'a',
    }));

    const library = loadLibrary();

    expect(library.entries.map((it) => it.id)).toEqual(['a']);
    expect(library.currentId).toBe('a');
  });

  it('repairs a dangling currentId to the first surviving entry', () => {
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [entry('a', 'One'), entry('b', 'Two')],
      currentId: 'gone',
    }));

    expect(loadLibrary().currentId).toBe('a');
  });

  it('repairs currentId to null when nothing survives', () => {
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [{ id: 'b', song: { title: 'broken' } }],
      currentId: 'b',
    }));

    expect(loadLibrary()).toEqual({ entries: [], folders: [], currentId: null });
  });

  it('repairs a missing title, artist and updatedAt from the song', () => {
    const stored = song('From Song');
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [{ id: 'a', title: 7, updatedAt: 'soon', song: stored }],
      currentId: 'a',
    }));

    const [loaded] = loadLibrary().entries;
    expect(loaded.title).toBe('From Song');
    expect(loaded.artist).toBe('Band');
    expect(Number.isFinite(loaded.updatedAt)).toBe(true);
  });

  it('reads a library saved before folders existed as a flat one', () => {
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [entry('a', 'One')],
      currentId: 'a',
    }));

    const library = loadLibrary();

    expect(library.folders).toEqual([]);
    expect(library.entries[0].folderId).toBeNull();
  });

  it('sends a song in a folder that no longer exists back to the root', () => {
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [{ ...entry('a', 'One'), folderId: 'gone' }, { ...entry('b', 'Two'), folderId: 'f1' }],
      folders: [folder('f1', 'Practice')],
      currentId: 'a',
    }));

    const library = loadLibrary();

    expect(library.entries.map((it) => it.folderId)).toEqual([null, 'f1']);
  });

  it('reparents a folder with a missing parent, and drops duplicate folder ids', () => {
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [],
      folders: [folder('f1', 'Orphan', 'gone'), folder('f1', 'Shadow'), folder('f2', 'Kept')],
      currentId: null,
    }));

    expect(loadLibrary().folders).toEqual([folder('f1', 'Orphan'), folder('f2', 'Kept')]);
  });

  it('breaks a folder cycle by reparenting every folder in it to the root', () => {
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [],
      folders: [folder('a', 'A', 'b'), folder('b', 'B', 'a'), folder('c', 'C', 'a')],
      currentId: null,
    }));

    expect(loadLibrary().folders).toEqual([
      folder('a', 'A'),
      folder('b', 'B'),
      folder('c', 'C', 'a'),
    ]);
  });

  it('names a folder with a blank or non-string name, and drops one without an id', () => {
    storage.setItem('sheetor-library', JSON.stringify({
      entries: [],
      folders: [{ id: 'f1', name: '   ' }, { id: 'f2', name: 12 }, { name: 'No id' }],
      currentId: null,
    }));

    expect(loadLibrary().folders).toEqual([
      folder('f1', 'Untitled folder'),
      folder('f2', 'Untitled folder'),
    ]);
  });
});

describe('saveLibrary', () => {
  it('never throws when storage rejects a write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });

    expect(() => saveLibrary(libraryOf('Big'))).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('addSong', () => {
  it('prepends the new entry, makes it current and leaves the input untouched', () => {
    const library = libraryOf('One');
    const before = structuredClone(library);

    const { library: next, entry: added } = addSong(library, song('Fresh'));

    expect(next.entries.map((it) => it.title)).toEqual(['Fresh', 'One']);
    expect(next.currentId).toBe(added.id);
    expect(added.artist).toBe('Band');
    expect(added.folderId).toBeNull();
    expect(next.entries[0]).toBe(added);
    expect(library).toEqual(before);
    expect(storage.size).toBe(0);
  });

  it('files the new entry in the named folder', () => {
    const library: Library = { ...libraryOf('One'), folders: [folder('f1', 'Practice')] };

    const { entry: added } = addSong(library, song('Fresh'), 'f1');

    expect(added.folderId).toBe('f1');
  });

  it('falls back to the root for a folder that does not exist', () => {
    const { entry: added } = addSong(libraryOf('One'), song('Fresh'), 'gone');
    expect(added.folderId).toBeNull();
  });
});

describe('replaceSong', () => {
  it('swaps the song, re-denormalises and moves the entry to the front', () => {
    const library = libraryOf('One', 'Two', 'Three');
    const before = structuredClone(library);
    const replacement: TabSong = { ...song('Renamed'), artist: 'Other' };

    const next = replaceSong(library, 'id-2', replacement);

    expect(next.entries.map((it) => it.id)).toEqual(['id-2', 'id-0', 'id-1']);
    expect(next.entries[0].title).toBe('Renamed');
    expect(next.entries[0].artist).toBe('Other');
    expect(next.entries[0].song).toBe(replacement);
    expect(next.entries[0].updatedAt).toBeGreaterThan(before.entries[2].updatedAt);
    expect(next.currentId).toBe('id-0');
    expect(library).toEqual(before);
  });

  it('keeps the entry in its folder', () => {
    const library = shelve(
      { ...libraryOf('One'), folders: [folder('f1', 'Practice')] },
      { 'id-0': 'f1' },
    );

    expect(replaceSong(library, 'id-0', song('Renamed')).entries[0].folderId).toBe('f1');
  });

  it('returns the library unchanged for an unknown id', () => {
    const library = libraryOf('One');
    expect(replaceSong(library, 'nope', song('X'))).toBe(library);
  });
});

describe('duplicateSong', () => {
  it('inserts a deep copy right after the original without changing the current song', () => {
    const library = libraryOf('One', 'Two');
    const before = structuredClone(library);

    const next = duplicateSong(library, 'id-0');

    expect(next.entries.map((it) => it.title)).toEqual(['One', 'One (copy)', 'Two']);
    expect(next.entries[1].song.title).toBe('One (copy)');
    expect(next.entries[1].id).not.toBe('id-0');
    expect(next.entries[1].song).not.toBe(library.entries[0].song);
    expect(next.entries[1].song.tracks[0]).not.toBe(library.entries[0].song.tracks[0]);
    expect(next.currentId).toBe('id-0');
    expect(library).toEqual(before);
  });

  it('leaves the copy in the same folder as the original', () => {
    const library = shelve(
      { ...libraryOf('One'), folders: [folder('f1', 'Practice')] },
      { 'id-0': 'f1' },
    );

    expect(duplicateSong(library, 'id-0').entries[1].folderId).toBe('f1');
  });

  it('returns the library unchanged for an unknown id', () => {
    const library = libraryOf('One');
    expect(duplicateSong(library, 'nope')).toBe(library);
  });
});

describe('deleteSong', () => {
  it('drops the entry and moves currentId to the first survivor', () => {
    const library = libraryOf('One', 'Two');
    const before = structuredClone(library);

    const next = deleteSong(library, 'id-0');

    expect(next.entries.map((it) => it.id)).toEqual(['id-1']);
    expect(next.currentId).toBe('id-1');
    expect(library).toEqual(before);
  });

  it('keeps a currentId that was not deleted', () => {
    const library = setCurrentSong(libraryOf('One', 'Two'), 'id-1');
    expect(deleteSong(library, 'id-0').currentId).toBe('id-1');
  });

  it('clears currentId when the last entry goes, keeping the folders', () => {
    const library: Library = { ...libraryOf('One'), folders: [folder('f1', 'Practice')] };

    expect(deleteSong(library, 'id-0')).toEqual({
      entries: [],
      folders: [folder('f1', 'Practice')],
      currentId: null,
    });
  });

  it('returns the library unchanged for an unknown id', () => {
    const library = libraryOf('One');
    expect(deleteSong(library, 'nope')).toBe(library);
  });
});

describe('moveSong', () => {
  const library = (): Library => shelve(
    { ...libraryOf('One', 'Two'), folders: [folder('f1', 'Practice'), folder('f2', 'Bach', 'f1')] },
    { 'id-1': 'f1' },
  );

  it('files a song in a folder without touching its order or timestamp', () => {
    const start = library();
    const before = structuredClone(start);

    const next = moveSong(start, 'id-0', 'f2');

    expect(next.entries.map((it) => it.id)).toEqual(['id-0', 'id-1']);
    expect(next.entries[0].folderId).toBe('f2');
    expect(next.entries[0].updatedAt).toBe(before.entries[0].updatedAt);
    expect(start).toEqual(before);
  });

  it('sends a song back to the root', () => {
    expect(moveSong(library(), 'id-1', null).entries[1].folderId).toBeNull();
  });

  it('ignores an unknown song, an unknown folder and a move that changes nothing', () => {
    const start = library();
    expect(moveSong(start, 'nope', 'f1')).toBe(start);
    expect(moveSong(start, 'id-0', 'gone')).toBe(start);
    expect(moveSong(start, 'id-1', 'f1')).toBe(start);
  });
});

describe('setCurrentSong', () => {
  it('selects an existing entry and accepts null', () => {
    const library = libraryOf('One', 'Two');
    const before = structuredClone(library);

    expect(setCurrentSong(library, 'id-1').currentId).toBe('id-1');
    expect(setCurrentSong(library, null).currentId).toBeNull();
    expect(library).toEqual(before);
  });

  it('ignores an id that names no entry', () => {
    const library = libraryOf('One');
    expect(setCurrentSong(library, 'nope')).toBe(library);
  });
});

describe('getCurrentEntry', () => {
  it('returns the current entry', () => {
    const library = setCurrentSong(libraryOf('One', 'Two'), 'id-1');
    expect(getCurrentEntry(library)?.title).toBe('Two');
  });

  it('returns null for an empty library', () => {
    expect(getCurrentEntry({ entries: [], folders: [], currentId: null })).toBeNull();
  });
});

describe('createFolder', () => {
  it('appends a trimmed folder at the root and leaves the input untouched', () => {
    const start = libraryOf('One');
    const before = structuredClone(start);

    const { library: next, folder: made } = createFolder(start, '  Practice  ');

    expect(next.folders).toEqual([{ id: made.id, name: 'Practice', parentId: null }]);
    expect(next.entries).toBe(start.entries);
    expect(start).toEqual(before);
  });

  it('nests inside an existing folder', () => {
    const { library: next, folder: parent } = createFolder(libraryOf(), 'Practice');
    const { folder: child } = createFolder(next, 'Bach', parent.id);

    expect(child.parentId).toBe(parent.id);
  });

  it('names an unnamed folder and roots one with an unknown parent', () => {
    const { folder: made } = createFolder(libraryOf(), '   ', 'gone');

    expect(made.name).toBe('New folder');
    expect(made.parentId).toBeNull();
  });
});

describe('renameFolder', () => {
  const library = (): Library => ({ ...libraryOf(), folders: [folder('f1', 'Practice')] });

  it('renames with a trimmed name', () => {
    expect(renameFolder(library(), 'f1', '  Etudes ')).toEqual({
      entries: [],
      folders: [folder('f1', 'Etudes')],
      currentId: null,
    });
  });

  it('ignores a blank name, an unknown folder and a rename to the same name', () => {
    const start = library();
    expect(renameFolder(start, 'f1', '   ')).toBe(start);
    expect(renameFolder(start, 'nope', 'Etudes')).toBe(start);
    expect(renameFolder(start, 'f1', 'Practice')).toBe(start);
  });
});

describe('moveFolder', () => {
  // Practice > Bach > Cello, plus a sibling Jazz at the root.
  const library = (): Library => ({
    ...libraryOf(),
    folders: [
      folder('practice', 'Practice'),
      folder('bach', 'Bach', 'practice'),
      folder('cello', 'Cello', 'bach'),
      folder('jazz', 'Jazz'),
    ],
  });

  it('reparents a folder and leaves the input untouched', () => {
    const start = library();
    const before = structuredClone(start);

    const next = moveFolder(start, 'bach', 'jazz');

    expect(next.folders.find((it) => it.id === 'bach')?.parentId).toBe('jazz');
    expect(next.folders.find((it) => it.id === 'cello')?.parentId).toBe('bach');
    expect(start).toEqual(before);
  });

  it('moves a folder out to the root', () => {
    expect(moveFolder(library(), 'cello', null).folders[2].parentId).toBeNull();
  });

  it('refuses to move a folder into itself or its own subtree', () => {
    const start = library();
    expect(moveFolder(start, 'practice', 'practice')).toBe(start);
    expect(moveFolder(start, 'practice', 'bach')).toBe(start);
    expect(moveFolder(start, 'practice', 'cello')).toBe(start);
  });

  it('ignores an unknown folder, an unknown parent and a move that changes nothing', () => {
    const start = library();
    expect(moveFolder(start, 'nope', 'jazz')).toBe(start);
    expect(moveFolder(start, 'bach', 'gone')).toBe(start);
    expect(moveFolder(start, 'bach', 'practice')).toBe(start);
    expect(moveFolder(start, 'jazz', null)).toBe(start);
  });
});

describe('deleteFolder', () => {
  // Practice holds Bach and song One; Bach holds song Two.
  const library = (): Library => shelve(
    {
      ...libraryOf('One', 'Two'),
      folders: [folder('practice', 'Practice'), folder('bach', 'Bach', 'practice')],
    },
    { 'id-0': 'practice', 'id-1': 'bach' },
  );

  it('moves the folders and songs it held up one level, never deleting a song', () => {
    const start = library();
    const before = structuredClone(start);

    const next = deleteFolder(start, 'practice');

    expect(next.folders).toEqual([folder('bach', 'Bach')]);
    expect(next.entries.map((it) => it.folderId)).toEqual([null, 'bach']);
    expect(next.entries).toHaveLength(2);
    expect(start).toEqual(before);
  });

  it('moves contents into the parent folder when a nested folder goes', () => {
    const next = deleteFolder(library(), 'bach');

    expect(next.folders).toEqual([folder('practice', 'Practice')]);
    expect(next.entries.map((it) => it.folderId)).toEqual(['practice', 'practice']);
  });

  it('returns the library unchanged for an unknown folder', () => {
    const start = library();
    expect(deleteFolder(start, 'nope')).toBe(start);
  });
});

describe('tree queries', () => {
  // Practice > Bach; Practice > Etudes; Jazz. Songs: One in Practice, Two in
  // Bach, Three at the root.
  const library = (): Library => shelve(
    {
      ...libraryOf('One', 'Two', 'Three'),
      folders: [
        folder('practice', 'Practice'),
        folder('bach', 'Bach', 'practice'),
        folder('etudes', 'Etudes', 'practice'),
        folder('jazz', 'Jazz'),
      ],
    },
    { 'id-0': 'practice', 'id-1': 'bach' },
  );

  it('folderPath walks root first', () => {
    expect(folderPath(library(), 'bach').map((it) => it.name)).toEqual(['Practice', 'Bach']);
  });

  it('folderPath is empty for the root and for an unknown folder', () => {
    expect(folderPath(library(), null)).toEqual([]);
    expect(folderPath(library(), 'gone')).toEqual([]);
  });

  it('childFolders lists one level, sorted by name', () => {
    expect(childFolders(library(), null).map((it) => it.name)).toEqual(['Jazz', 'Practice']);
    expect(childFolders(library(), 'practice').map((it) => it.name)).toEqual(['Bach', 'Etudes']);
    expect(childFolders(library(), 'jazz')).toEqual([]);
  });

  it('childFolders sorts numerically and case-insensitively', () => {
    const start: Library = {
      ...libraryOf(),
      folders: [folder('a', 'set 10'), folder('b', 'Set 2'), folder('c', 'set 1')],
    };

    expect(childFolders(start, null).map((it) => it.name)).toEqual(['set 1', 'Set 2', 'set 10']);
  });

  it('songsIn lists only that folder, keeping the stored order', () => {
    expect(songsIn(library(), null).map((it) => it.title)).toEqual(['Three']);
    expect(songsIn(library(), 'practice').map((it) => it.title)).toEqual(['One']);
    expect(songsIn(library(), 'etudes')).toEqual([]);
  });

  it('countSongsIn counts the whole subtree', () => {
    expect(countSongsIn(library(), 'practice')).toBe(2);
    expect(countSongsIn(library(), 'bach')).toBe(1);
    expect(countSongsIn(library(), 'jazz')).toBe(0);
    expect(countSongsIn(library(), null)).toBe(3);
  });

  it('folderChoices is depth-first with a depth for every folder', () => {
    expect(folderChoices(library())).toEqual([
      { id: 'jazz', name: 'Jazz', depth: 0 },
      { id: 'practice', name: 'Practice', depth: 0 },
      { id: 'bach', name: 'Bach', depth: 1 },
      { id: 'etudes', name: 'Etudes', depth: 1 },
    ]);
  });

  it('folderChoices can exclude a subtree, which is what a folder may not move into', () => {
    expect(folderChoices(library(), 'practice').map((it) => it.id)).toEqual(['jazz']);
  });
});
