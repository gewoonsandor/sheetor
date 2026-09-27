import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router-dom';

import { fetchSong } from '../../library/libraryApi';
import { rememberSong } from '../../library/libraryStore';
import type { LibraryEntry } from '../../library/libraryStore';
import TabSheetEditor from '../components/TabSheetEditor';
import { createSongChannel } from '../songChannel';

const SongNotice = ({ title, message }: { title: string; message: string }) => (
  <div className="app-error">
    <h2>{title}</h2>
    <p>{message}</p>
    <div className="app-error-actions">
      <Link className="btn btn-primary" to="/library">
        Back to library
      </Link>
    </div>
  </div>
);

/// One open song: its listing entry and its live channel, both keyed to the id, so
/// opening another song starts a fresh session instead of reusing this one.
const SongSession = ({ songId }: { songId: string }) => {
  const [channel] = useState(() => createSongChannel(songId));
  const live = useSyncExternalStore(channel.subscribe, channel.getState);
  const [meta, setMeta] = useState<LibraryEntry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    channel.connect();
    return () => channel.disconnect();
  }, [channel]);

  useEffect(() => {
    fetchSong(songId).then(
      (entry) => {
        setMeta(entry);
        rememberSong(entry.id);
      },
      (err: unknown) => setLoadError(err instanceof Error ? err.message : 'not found'),
    );
  }, [songId]);

  if (loadError !== null) {
    return (
      <SongNotice
        title="This song is not available"
        message="It may have been deleted, or its folder is no longer shared with you."
      />
    );
  }
  if (live.status === 'unavailable' || live.status === 'invalid') {
    return <SongNotice title="This song is not available" message={live.error ?? ''} />;
  }
  if (meta === null || live.status === 'connecting') {
    return <div className="page-loading">Opening song…</div>;
  }
  return <TabSheetEditor meta={meta} channel={channel} />;
};

export const EditorPage = () => {
  const { songId } = useParams();
  if (songId === undefined) return null;
  return <SongSession key={songId} songId={songId} />;
};
