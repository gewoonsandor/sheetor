import { describe, it, expect } from 'vitest';

import type { Library, LibraryEntry, LibraryFolder, Role } from '../../../src/features/library/libraryStore';
import {
  childFolders, countSongsIn, folderChoices, folderPath, songsIn,
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
