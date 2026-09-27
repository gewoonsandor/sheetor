import * as Y from 'yjs';

import { isRecord, parseSong } from './components/songSchema';
import type { ParseSongResult } from './components/songSchema';
import type { TabSong } from './components/types';

/// The root map every client and the server keep the `TabSong` fields in.
export const ROOT = 'song';
export const LOCAL_ORIGIN = 'local';
export const REMOTE_ORIGIN = 'remote';

export const createSongDoc = (song: TabSong): Y.Doc => {
  const doc = new Y.Doc();
  writeSongDoc(doc, song);
  return doc;
};

export const encodeSong = (song: TabSong): Uint8Array => Y.encodeStateAsUpdate(createSongDoc(song));

export const readSongDoc = (doc: Y.Doc): ParseSongResult => {
  const json: Record<string, unknown> = doc.getMap(ROOT).toJSON();
  // A collaborator clearing the title to retype it must not make the song unreadable.
  if (typeof json.title !== 'string' || json.title.trim() === '') json.title = 'Untitled';
  return parseSong(json);
};

/// Brings the document in line with `song` by changing only what differs, so edits
/// made concurrently elsewhere in the song merge instead of being overwritten.
export const writeSongDoc = (doc: Y.Doc, song: TabSong): void => {
  doc.transact(() => {
    syncMap(doc.getMap(ROOT), song as unknown as Record<string, unknown>);
  }, LOCAL_ORIGIN);
};

const toYValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const array = new Y.Array<unknown>();
    array.push(value.map(toYValue));
    return array;
  }
  if (isRecord(value)) {
    const map = new Y.Map<unknown>();
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) map.set(key, toYValue(item));
    }
    return map;
  }
  return value;
};

const syncMap = (map: Y.Map<unknown>, value: Record<string, unknown>): void => {
  for (const key of Array.from(map.keys())) {
    if (value[key] === undefined) map.delete(key);
  }
  for (const [key, next] of Object.entries(value)) {
    if (next !== undefined) syncSlot(map.get(key), next, (fresh) => map.set(key, fresh));
  }
};

const syncSlot = (current: unknown, next: unknown, replace: (fresh: unknown) => void): void => {
  if (Array.isArray(next)) {
    if (current instanceof Y.Array) syncArray(current, next);
    else replace(toYValue(next));
  } else if (isRecord(next)) {
    if (current instanceof Y.Map) syncMap(current, next);
    else replace(toYValue(next));
  } else if (current !== next) {
    replace(next);
  }
};

const idOf = (value: unknown): string | null => {
  const id = value instanceof Y.Map ? value.get('id') : isRecord(value) ? value.id : null;
  return typeof id === 'string' ? id : null;
};

/// Tracks, bars and beats carry ids, so they are matched by id; anything else by position.
const syncArray = (array: Y.Array<unknown>, next: unknown[]): void => {
  const keyed =
    next.every((item) => isRecord(item) && idOf(item) !== null) &&
    array.toArray().every((item) => item instanceof Y.Map && idOf(item) !== null);
  if (keyed) syncKeyed(array, next);
  else syncPositional(array, next);
};

const syncPositional = (array: Y.Array<unknown>, next: unknown[]): void => {
  const shared = Math.min(array.length, next.length);
  for (let i = 0; i < shared; i++) {
    syncSlot(array.get(i), next[i], (fresh) => {
      array.delete(i, 1);
      array.insert(i, [fresh]);
    });
  }
  if (array.length > next.length) array.delete(next.length, array.length - next.length);
  else if (next.length > array.length) array.push(next.slice(array.length).map(toYValue));
};

const syncKeyed = (array: Y.Array<unknown>, next: unknown[]): void => {
  const wanted = new Set(next.map(idOf));
  const items = array.toArray();
  const first = new Map<string | null, number>();
  items.forEach((item, i) => {
    if (!first.has(idOf(item))) first.set(idOf(item), i);
  });
  // From the end, so earlier indices stay valid. Two clients moving one item at once
  // can leave a duplicate; only its first copy survives.
  for (let i = items.length - 1; i >= 0; i--) {
    const id = idOf(items[i]);
    if (!wanted.has(id) || first.get(id) !== i) array.delete(i, 1);
  }

  next.forEach((item, i) => {
    const id = idOf(item);
    const current = i < array.length ? array.get(i) : null;
    if (current instanceof Y.Map && idOf(current) === id) {
      syncMap(current, item as Record<string, unknown>);
      return;
    }
    // A moved item is re-created at its new place; the editor never reorders, so
    // losing a concurrent edit inside one is acceptable.
    const moved = array.toArray().findIndex((existing, j) => j > i && idOf(existing) === id);
    if (moved !== -1) array.delete(moved, 1);
    array.insert(i, [toYValue(item)]);
  });
};
