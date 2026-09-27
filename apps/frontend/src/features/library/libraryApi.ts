import { FALLBACK_MESSAGE, failWith, request, sendJson } from '../../app/http';
import type { Reply } from '../../app/http';
import { encodeSong } from '../editor/songDoc';
import type { TabSong } from '../editor/components/types';
import { isRecord } from '../editor/components/songSchema';
import { isRole } from './libraryStore';
import type { Library, LibraryEntry, LibraryFolder, Share } from './libraryStore';

const API = '/api/v1';

const nullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const readFolder = (value: unknown): LibraryFolder | null => {
  if (!isRecord(value)) return null;
  const { id, name, parent_id, owner_id, owner_name, role, is_shared } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || !nullableString(parent_id)) return null;
  if (typeof owner_id !== 'number' || typeof owner_name !== 'string') return null;
  if (!isRole(role) || typeof is_shared !== 'boolean') return null;
  return {
    id,
    name,
    parentId: parent_id,
    ownerId: owner_id,
    ownerName: owner_name,
    role,
    isShared: is_shared,
  };
};

const readEntry = (value: unknown): LibraryEntry | null => {
  if (!isRecord(value)) return null;
  const { id, title, artist, folder_id, owner_id, role, bpm, track_count, bar_count } = value;
  const { updated_at, updated_by_name } = value;
  if (typeof id !== 'string' || typeof title !== 'string' || typeof artist !== 'string') return null;
  if (!nullableString(folder_id) || typeof owner_id !== 'number' || !isRole(role)) return null;
  if (typeof bpm !== 'number' || typeof track_count !== 'number') return null;
  if (typeof bar_count !== 'number' || typeof updated_at !== 'number') return null;
  if (updated_by_name !== undefined && !nullableString(updated_by_name)) return null;
  return {
    id,
    title,
    artist,
    folderId: folder_id,
    ownerId: owner_id,
    role,
    bpm,
    trackCount: track_count,
    barCount: bar_count,
    updatedAt: updated_at,
    updatedByName: updated_by_name ?? null,
  };
};

const readShare = (value: unknown): Share | null => {
  if (!isRecord(value)) return null;
  const { user_id, username, email, role } = value;
  if (typeof user_id !== 'number' || typeof username !== 'string') return null;
  if (typeof email !== 'string' || !isRole(role)) return null;
  return { userId: user_id, username, email, role };
};

// A list keeps whatever items it can read; one malformed item never hides the rest.
const readList = <T>(value: unknown, read: (item: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.map(read).filter((item): item is T => item !== null) : [];

const readOne = <T>(reply: Reply, read: (item: unknown) => T | null): T => {
  if (!reply.ok) failWith(reply);
  const item = read(reply.body);
  if (item === null) throw new Error(FALLBACK_MESSAGE);
  return item;
};

const expectOk = (reply: Reply): void => {
  if (!reply.ok) failWith(reply);
};

export const fetchLibrary = async (): Promise<Library> => {
  const reply = await request(`${API}/library`);
  if (!reply.ok) failWith(reply);
  const body = isRecord(reply.body) ? reply.body : {};
  return { folders: readList(body.folders, readFolder), entries: readList(body.songs, readEntry) };
};

export const createFolder = async (name: string, parentId: string | null): Promise<LibraryFolder> =>
  readOne(await sendJson('POST', `${API}/folders/create`, { name, parent_id: parentId }), readFolder);

export const renameFolder = async (id: string, name: string): Promise<LibraryFolder> =>
  readOne(await sendJson('PUT', `${API}/folders/${id}/name`, { name }), readFolder);

export const moveFolder = async (id: string, parentId: string | null): Promise<void> =>
  expectOk(await sendJson('PUT', `${API}/folders/${id}/parent`, { parent_id: parentId }));

export const deleteFolder = async (id: string): Promise<void> =>
  expectOk(await sendJson('DELETE', `${API}/folders/${id}`));

export const fetchShares = async (folderId: string): Promise<Share[]> => {
  const reply = await request(`${API}/folders/${folderId}/shares`);
  if (!reply.ok) failWith(reply);
  return readList(reply.body, readShare);
};

export const shareFolder = async (
  folderId: string,
  email: string,
  role: 'editor' | 'viewer',
): Promise<Share> =>
  readOne(await sendJson('PUT', `${API}/folders/${folderId}/shares`, { email, role }), readShare);

export const unshareFolder = async (folderId: string, userId: number): Promise<void> =>
  expectOk(await sendJson('DELETE', `${API}/folders/${folderId}/shares/${userId}`));

export const createSong = async (song: TabSong, folderId: string | null): Promise<LibraryEntry> => {
  const query = folderId === null ? '' : `?folder_id=${encodeURIComponent(folderId)}`;
  const reply = await request(`${API}/songs/create${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: new Uint8Array(encodeSong(song)),
  });
  return readOne(reply, readEntry);
};

export const fetchSong = async (id: string): Promise<LibraryEntry> =>
  readOne(await request(`${API}/songs/${encodeURIComponent(id)}`), readEntry);

export const duplicateSong = async (id: string): Promise<LibraryEntry> =>
  readOne(await sendJson('POST', `${API}/songs/${id}/duplicate`), readEntry);

export const moveSong = async (id: string, folderId: string | null): Promise<void> =>
  expectOk(await sendJson('PUT', `${API}/songs/${id}/folder`, { folder_id: folderId }));

export const deleteSong = async (id: string): Promise<void> =>
  expectOk(await sendJson('DELETE', `${API}/songs/${id}`));
