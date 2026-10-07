import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { createSongChannel } from '../../../src/features/editor/songChannel';
import type { PeerCursor } from '../../../src/features/editor/songChannel';
import { createSongDoc, readSongDoc, writeSongDoc } from '../../../src/features/editor/songDoc';
import { createEmptyMeasure, createEmptySong } from '../../../src/features/editor/components/songUtils';
import type { TabSong } from '../../../src/features/editor/components/types';

/// Stands in for the live socket: keeps what the channel sent, and delivers the server's frames.
class FakeSocket {
  static OPEN = 1;
  static current: FakeSocket;
  readyState = 1;
  binaryType = 'blob';
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  sent: Uint8Array[] = [];

  constructor() {
    FakeSocket.current = this;
  }

  send(data: string | Uint8Array): void {
    if (typeof data !== 'string') this.sent.push(data);
  }

  close(): void {}

  deliver(update: Uint8Array): void {
    this.onmessage?.({ data: update.slice().buffer as ArrayBuffer });
  }
}

const read = (doc: Y.Doc): TabSong => {
  const result = readSongDoc(doc);
  if (!result.ok) throw new Error(result.error);
  return result.song;
};

const withNote = (song: TabSong, fret: number): TabSong => ({
  ...song,
  tracks: song.tracks.map((track) => ({
    ...track,
    measures: track.measures.map((m, i) => i !== 1 ? m : {
      ...m,
      beats: m.beats.map((beat, j) => j === 0 ? { ...beat, isRest: false, notes: [{ stringIndex: 0, fret }] } : beat),
    }),
  })),
});

const bar2Notes = (song: TabSong) => song.tracks[0].measures[1].beats[0].notes;

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', { protocol: 'http:', host: 'sheetor.test' });
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {}, setTimeout, clearTimeout });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('songChannel undo', () => {
  it('reverts only this person\'s edit and goes back to where it was made', () => {
    const initial = createEmptySong();
    const song = { ...initial, tracks: [{ ...initial.tracks[0], measures: [createEmptyMeasure(), createEmptyMeasure()] }] };
    const server = createSongDoc(song);
    const channel = createSongChannel('song');
    const received: { song: TabSong; at: PeerCursor | null }[] = [];
    channel.onRemoteSong((fresh, at) => received.push({ song: fresh, at }));
    channel.connect();
    const socket = FakeSocket.current;
    socket.deliver(Y.encodeStateAsUpdate(server));

    const bar2 = song.tracks[0].measures[1];
    const editedAt = { trackId: song.tracks[0].id, measureId: bar2.id, beatId: bar2.beats[0].id };
    channel.sendCursor(editedAt);
    channel.publish(withNote(song, 5));

    // A collaborator renames the song afterwards, and the cursor moves on to bar 1.
    socket.sent.forEach((update) => Y.applyUpdate(server, update));
    writeSongDoc(server, { ...read(server), title: 'Renamed' });
    socket.deliver(Y.encodeStateAsUpdate(server));
    const bar1 = song.tracks[0].measures[0];
    channel.sendCursor({ ...editedAt, measureId: bar1.id, beatId: bar1.beats[0].id });

    channel.undo();
    const undone = received[received.length - 1];
    expect(undone.song.title).toBe('Renamed');
    expect(bar2Notes(undone.song)).toEqual([]);
    expect(undone.at).toEqual(editedAt);
    expect(channel.getState()).toMatchObject({ canUndo: false, canRedo: true });

    channel.redo();
    const redone = received[received.length - 1];
    expect(bar2Notes(redone.song)).toEqual([{ stringIndex: 0, fret: 5 }]);
    expect(redone.song.title).toBe('Renamed');
    expect(redone.at).toEqual(editedAt);
    expect(channel.getState()).toMatchObject({ canUndo: true, canRedo: false });
  });
});

describe('songChannel close codes', () => {
  it.each([4413, 4429, 4503])('stops with a reason instead of retrying after %i', (code) => {
    const channel = createSongChannel('song');
    channel.connect();
    FakeSocket.current.onclose?.({ code });

    const { status, error } = channel.getState();
    expect(status).toBe('unavailable');
    expect(error).toEqual(expect.any(String));
  });

  it('reconnects after the account signed out elsewhere, to sign in again', () => {
    const channel = createSongChannel('song');
    channel.connect();
    FakeSocket.current.onclose?.({ code: 4401 });

    expect(channel.getState()).toMatchObject({ status: 'connecting', error: null });
    channel.disconnect();
  });
});
