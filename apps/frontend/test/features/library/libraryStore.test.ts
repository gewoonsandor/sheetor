import { describe, it, expect } from 'vitest';

import type { Library, LibraryEntry, LibraryFolder, Role } from '../../../src/features/library/libraryStore';
import {
  childFolders, countSongsIn, folderChoices, folderPath, searchSongs, songsIn, sortSongs,
} from '../../../src/features/library/libraryStore';

const entry = (id: string, title: string, folderId: string | null): LibraryEntry => ({
  id,
  title,
  artist: 'Band',
  folderId,
  ownerId: 1,
  role: 'owner',
  bpm: 120,
  trackCount: 1,
  barCount: 4,
  updatedAt: 1700000000000,
  updatedByName: null,
});

const folder = (
  id: string,
  name: string,
  parentId: string | null = null,
  ownerId = 1,
  role: Role = 'owner',
): LibraryFolder => ({ id, name, parentId, ownerId, ownerName: 'Ada', role, isShared: false });

describe('tree queries', () => {
  // Practice > Bach; Practice > Etudes; Jazz. Songs: One in Practice, Two in
  // Bach, Three at the root.
  const library = (): Library => ({
    folders: [
      folder('practice', 'Practice'),
      folder('bach', 'Bach', 'practice'),
      folder('etudes', 'Etudes', 'practice'),
      folder('jazz', 'Jazz'),
    ],
    entries: [entry('one', 'One', 'practice'), entry('two', 'Two', 'bach'), entry('three', 'Three', null)],
  });

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
      folders: [folder('a', 'set 10'), folder('b', 'Set 2'), folder('c', 'set 1')],
      entries: [],
    };

    expect(childFolders(start, null).map((it) => it.name)).toEqual(['set 1', 'Set 2', 'set 10']);
  });

  it('songsIn lists only that folder, keeping the server order', () => {
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
    expect(folderChoices(library(), 1)).toEqual([
      { id: 'jazz', name: 'Jazz', depth: 0 },
      { id: 'practice', name: 'Practice', depth: 0 },
      { id: 'bach', name: 'Bach', depth: 1 },
      { id: 'etudes', name: 'Etudes', depth: 1 },
    ]);
  });

  it('folderChoices can exclude a subtree, which is what a folder may not move into', () => {
    expect(folderChoices(library(), 1, 'practice').map((it) => it.id)).toEqual(['jazz']);
  });

  // Items never cross owners, and a view-only folder cannot receive anything.
  it("folderChoices lists only the owner's folders the user can edit", () => {
    const mixed: Library = {
      folders: [
        folder('mine', 'Mine'),
        folder('band', 'Band', null, 2, 'editor'),
        folder('demos', 'Demos', 'band', 2, 'editor'),
        folder('press', 'Press', null, 2, 'viewer'),
      ],
      entries: [],
    };

    expect(folderChoices(mixed, 2).map((it) => it.id)).toEqual(['band', 'demos']);
    expect(folderChoices(mixed, 1).map((it) => it.id)).toEqual(['mine']);
  });
});

describe('searchSongs', () => {
  const library: Library = {
    folders: [],
    entries: [
      { ...entry('a', 'Midnight Riff', null), artist: 'Beyoncé' },
      { ...entry('b', 'Café Blues', 'f'), artist: 'Nobody' },
      { ...entry('c', 'Morning', null), artist: 'Midnight Choir' },
    ],
  };
  const ids = (query: string) => searchSongs(library, query).map((it) => it.id);

  it('ignores case, accents and word order', () => {
    expect(ids('RIFF midnight')).toEqual(['a']);
    expect(ids('cafe')).toEqual(['b']);
    expect(ids('beyonce riff')).toEqual(['a']);
  });

  it('matches the artist and keeps server order', () => {
    expect(ids('midnight')).toEqual(['a', 'c']);
  });

  it('finds nothing for a blank query', () => {
    expect(ids('')).toEqual([]);
    expect(ids('   ')).toEqual([]);
  });
});

describe('sortSongs', () => {
  const songs = [entry('a', 'song 10', null), entry('b', '', null), entry('c', 'Song 2', null), entry('d', 'alpha', null)];

  it("orders 'title' naturally with untitled songs last", () => {
    expect(sortSongs(songs, 'title').map((it) => it.id)).toEqual(['d', 'c', 'a', 'b']);
  });

  it("returns 'updated' as a new array in the input order without mutating it", () => {
    const before = [...songs];
    const sorted = sortSongs(songs, 'updated');
    expect(sorted).toEqual(before);
    expect(sorted).not.toBe(songs);
    sortSongs(songs, 'title');
    expect(songs).toEqual(before);
  });
});
