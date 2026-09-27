import * as Y from 'yjs';

import { isRole } from '../library/libraryStore';
import type { Role } from '../library/libraryStore';
import { isRecord } from './components/songSchema';
import type { TabSong } from './components/types';
import { REMOTE_ORIGIN, readSongDoc, writeSongDoc } from './songDoc';

export type ChannelStatus = 'connecting' | 'live' | 'reconnecting' | 'unavailable' | 'invalid';

export interface PeerCursor {
  trackId: string;
  measureId: string;
  beatId: string;
}

export interface Peer {
  connectionId: string;
  userId: number;
  name: string;
  role: Role;
  cursor: PeerCursor | null;
}

export interface ChannelState {
  status: ChannelStatus;
  role: Role | null;
  peers: Peer[];
  error: string | null;
}

/// One song's live session: the shared document, the socket that keeps it in step
/// with everyone else, and who else is in it.
export interface SongChannel {
  connect: () => void;
  disconnect: () => void;
  subscribe: (listener: () => void) => () => void;
  getState: () => ChannelState;
  onRemoteSong: (listener: (song: TabSong) => void) => () => void;
  snapshot: () => TabSong | null;
  publish: (song: TabSong) => void;
  sendCursor: (cursor: PeerCursor) => void;
}

const RETRY_DELAYS = [1000, 2000, 5000, 10000];

// Close codes after which reconnecting cannot help.
const FINAL_CLOSES: Record<number, string> = {
  4400: 'The server rejected an edit. Reload the page to continue.',
  4403: 'You no longer have access to this song.',
  4404: 'This song was deleted.',
};

// An update with no changes encodes as two zero bytes.
const isEmptyUpdate = (update: Uint8Array): boolean => update.length <= 2;

const readCursor = (value: unknown): PeerCursor | null => {
  if (!isRecord(value)) return null;
  const { track_id, measure_id, beat_id } = value;
  if (typeof track_id !== 'string' || typeof measure_id !== 'string') return null;
  if (typeof beat_id !== 'string') return null;
  return { trackId: track_id, measureId: measure_id, beatId: beat_id };
};

const readPeer = (value: unknown): Peer | null => {
  if (!isRecord(value)) return null;
  const { connection_id, user_id, name, role } = value;
  if (typeof connection_id !== 'string' || typeof user_id !== 'number') return null;
  if (typeof name !== 'string' || !isRole(role)) return null;
  return { connectionId: connection_id, userId: user_id, name, role, cursor: readCursor(value.cursor) };
};

const liveUrl = (songId: string): string => {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/api/v1/songs/${encodeURIComponent(songId)}/live`;
};

export const createSongChannel = (songId: string): SongChannel => {
  const doc = new Y.Doc();
  const listeners = new Set<() => void>();
  const remoteListeners = new Set<(song: TabSong) => void>();
  let state: ChannelState = { status: 'connecting', role: null, peers: [], error: null };
  let socket: WebSocket | null = null;
  let retry: number | null = null;
  let stopped = true;
  let synced = false;
  let awaitingState = true;
  let attempt = 0;
  let connectionId: string | null = null;
  let cursor: PeerCursor | null = null;

  // A new object on every change, so `useSyncExternalStore` sees it.
  const setState = (patch: Partial<ChannelState>): void => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const send = (data: string | Uint8Array): void => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(data);
  };

  const sendCursorNow = (at: PeerCursor): void =>
    send(JSON.stringify({
      type: 'cursor',
      cursor: { track_id: at.trackId, measure_id: at.measureId, beat_id: at.beatId },
    }));

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE_ORIGIN) send(update);
  });

  const stop = (patch: Partial<ChannelState>): void => {
    stopped = true;
    release();
    setState({ ...patch, peers: [] });
  };

  /// The first frame of a connection is the server's whole document. Edits made while
  /// disconnected are pushed back now; Yjs merges them as if they had never been late.
  const onInitialState = (serverState: Uint8Array): boolean => {
    awaitingState = false;
    if (!synced) {
      const first = readSongDoc(doc);
      if (!first.ok) {
        stop({ status: 'invalid', error: first.error });
        return false;
      }
    } else if (state.role !== 'viewer') {
      const missing = Y.encodeStateAsUpdate(doc, Y.encodeStateVectorFromUpdate(serverState));
      if (!isEmptyUpdate(missing)) send(missing);
    }
    synced = true;
    attempt = 0;
    setState({ status: 'live', error: null });
    return true;
  };

  const onBinary = (bytes: Uint8Array): void => {
    Y.applyUpdate(doc, bytes, REMOTE_ORIGIN);
    if (awaitingState && !onInitialState(bytes)) return;
    const result = readSongDoc(doc);
    if (result.ok) remoteListeners.forEach((listener) => listener(result.song));
  };

  const onText = (text: string): void => {
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (!isRecord(message)) return;
    if (message.type === 'welcome' && typeof message.connection_id === 'string' && isRole(message.role)) {
      connectionId = message.connection_id;
      setState({ role: message.role });
      if (cursor !== null) sendCursorNow(cursor);
    } else if (message.type === 'presence' && Array.isArray(message.peers)) {
      const peers = message.peers
        .map(readPeer)
        .filter((peer): peer is Peer => peer !== null && peer.connectionId !== connectionId);
      setState({ peers });
    } else if (message.type === 'role' && isRole(message.role)) {
      setState({ role: message.role });
    }
  };

  const onClose = (code: number): void => {
    socket = null;
    if (stopped) return;
    const final = FINAL_CLOSES[code];
    if (final !== undefined) {
      stop({ status: 'unavailable', error: final });
      return;
    }
    setState({ status: synced ? 'reconnecting' : 'connecting', peers: [] });
    retry = window.setTimeout(open, RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]);
    attempt += 1;
  };

  // Handlers ignore a socket that has since been replaced, so a late close from a
  // previous connection can never schedule a second one.
  const open = (): void => {
    retry = null;
    awaitingState = true;
    const ws = new WebSocket(liveUrl(songId));
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (ws !== socket) return;
      if (typeof event.data === 'string') onText(event.data);
      else onBinary(new Uint8Array(event.data));
    };
    ws.onclose = (event: CloseEvent) => {
      if (ws === socket) onClose(event.code);
    };
    socket = ws;
  };

  const release = (): void => {
    if (retry !== null) window.clearTimeout(retry);
    retry = null;
    const closing = socket;
    socket = null;
    closing?.close(1000);
  };

  // A page parked in the back/forward cache would keep its socket open, and everyone
  // else would go on seeing a collaborator who has left.
  const onPageHide = (): void => release();
  const onPageShow = (event: PageTransitionEvent): void => {
    if (!event.persisted || stopped || socket !== null) return;
    setState({ status: 'reconnecting', peers: [] });
    open();
  };

  return {
    connect: () => {
      stopped = false;
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('pageshow', onPageShow);
      if (socket === null && retry === null) open();
    },
    disconnect: () => {
      stopped = true;
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      release();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
    onRemoteSong: (listener) => {
      remoteListeners.add(listener);
      return () => {
        remoteListeners.delete(listener);
      };
    },
    snapshot: () => {
      const result = readSongDoc(doc);
      return result.ok ? result.song : null;
    },
    publish: (song) => {
      if (state.role !== 'viewer') writeSongDoc(doc, song);
    },
    sendCursor: (at) => {
      cursor = at;
      sendCursorNow(at);
    },
  };
};
