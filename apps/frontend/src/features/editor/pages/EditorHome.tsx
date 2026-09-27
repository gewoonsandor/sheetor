import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createSong, fetchLibrary } from '../../library/libraryApi';
import { lastSongId } from '../../library/libraryStore';
import { loadSettings } from '../../settings/settingsStore';
import { createEmptySong } from '../components/songUtils';

/// The song `/` opens: the last one opened here if it still exists, else the newest
/// of your own, else any you can see, else a fresh one.
const pick = async (): Promise<string> => {
  const { entries } = await fetchLibrary();
  const last = lastSongId();
  const chosen =
    entries.find((entry) => entry.id === last) ??
    entries.find((entry) => entry.role === 'owner') ??
    entries[0];
  if (chosen) return chosen.id;
  const created = await createSong({ ...createEmptySong(), bpm: loadSettings().defaultBpm }, null);
  return created.id;
};

// StrictMode runs the effect twice; sharing one promise keeps that from creating two songs.
let pending: Promise<string> | null = null;

const resolveHomeSong = (): Promise<string> =>
  (pending ??= pick().finally(() => {
    pending = null;
  }));

export const EditorHome = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveHomeSong().then(
      (id) => {
        if (active) navigate(`/songs/${id}`, { replace: true });
      },
      (err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Your library did not load.');
      },
    );
    return () => {
      active = false;
    };
  }, [navigate]);

  if (error === null) return <div className="page-loading">Opening your library…</div>;

  return (
    <div className="app-error">
      <h2>Your library did not open</h2>
      <p className="app-error-message">{error}</p>
      <div className="app-error-actions">
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    </div>
  );
};
