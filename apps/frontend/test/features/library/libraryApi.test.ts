import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';

import { createEmptySong } from '../../../src/features/editor/components/songUtils';
import { ROOT } from '../../../src/features/editor/songDoc';
import { createSong, fetchLibrary, shareFolder } from '../../../src/features/library/libraryApi';

type Call = { url: string; init: RequestInit | undefined };

let calls: Call[] = [];

const answer = (status: number, body: unknown): void => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
};

const FOLDER = {
  id: 'f1',
  name: 'Band',
  parent_id: null,
  owner_id: 1,
  owner_name: 'Ada',
  role: 'editor',
  is_shared: true,
};

const SONG = {
  id: 's1',
  folder_id: 'f1',
  owner_id: 1,
  title: 'Riff',
  artist: 'Band',
  bpm: 120,
  track_count: 1,
  bar_count: 4,
  role: 'editor',
  updated_at: 1700000000000,
  updated_by_name: 'Ben',
};

describe('fetchLibrary', () => {
  it('reads the server shape and drops what it cannot read', async () => {
    answer(200, { folders: [FOLDER, { ...FOLDER, id: 'f2', role: 'admin' }], songs: [SONG] });

    const library = await fetchLibrary();

    expect(library.folders).toEqual([
      { id: 'f1', name: 'Band', parentId: null, ownerId: 1, ownerName: 'Ada', role: 'editor', isShared: true },
    ]);
    expect(library.entries).toEqual([
      {
        id: 's1',
        title: 'Riff',
        artist: 'Band',
        folderId: 'f1',
        ownerId: 1,
        role: 'editor',
        bpm: 120,
        trackCount: 1,
        barCount: 4,
        updatedAt: 1700000000000,
        updatedByName: 'Ben',
      },
    ]);
  });
});

describe('createSong', () => {
  it('uploads the song as a yjs document into the folder', async () => {
    answer(201, SONG);
    const song = { ...createEmptySong(), title: 'Riff' };

    await createSong(song, 'f1');

    expect(calls[0].url).toBe('/api/v1/songs/create?folder_id=f1');
    expect(calls[0].init?.method).toBe('POST');
    expect(new Headers(calls[0].init?.headers).get('content-type')).toBe('application/octet-stream');
    const doc = new Y.Doc();
    Y.applyUpdate(doc, calls[0].init?.body as Uint8Array);
    expect(doc.getMap(ROOT).get('title')).toBe('Riff');
  });
});

describe('errors', () => {
  it("surfaces the server's message", async () => {
    answer(403, { message: 'you do not have permission to do that' });

    await expect(shareFolder('f1', 'ben@example.com', 'viewer')).rejects.toThrow(
      'you do not have permission to do that',
    );
  });
});
