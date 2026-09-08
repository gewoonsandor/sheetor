import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { Library, LibraryEntry } from '../libraryStore';
import {
  addSong,
  deleteSong,
  duplicateSong,
  loadLibrary,
  saveLibrary,
  setCurrentSong,
} from '../libraryStore';
import { createEmptySong } from '../../editor/components/songUtils';
import { loadSettings } from '../../settings/settingsStore';
import '../LibraryPage.css';

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

const formatUpdated = (timestamp: number): string => {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${plural(hours, 'hour')} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${plural(days, 'day')} ago`;
  return new Date(timestamp).toLocaleDateString();
};

const barCount = (entry: LibraryEntry): number => entry.song.tracks[0]?.measures.length ?? 0;

export const LibraryPage = () => {
  const navigate = useNavigate();
  const [library, setLibrary] = useState<Library>(loadLibrary);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const commit = (next: Library): void => {
    saveLibrary(next);
    setLibrary(next);
  };

  const createSong = (): void => {
    const { library: next } = addSong(library, {
      ...createEmptySong(),
      bpm: loadSettings().defaultBpm,
    });
    saveLibrary(next);
    navigate('/');
  };

  const openSong = (id: string): void => {
    saveLibrary(setCurrentSong(library, id));
    navigate('/');
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <h1 className="page-title">Library</h1>
        <p className="page-subtitle">
          {library.entries.length === 0
            ? 'Nothing saved yet. Songs live in this browser and autosave as you edit.'
            : `${plural(library.entries.length, 'song')} saved in this browser, autosaved as you edit.`}
        </p>
        <button type="button" className="btn btn-primary" onClick={createSong}>
          New song
        </button>
      </header>

      {library.entries.length === 0 ? (
        <div className="library-empty">
          <span className="popover-title">Empty library</span>
          <h2 className="library-empty-title">Start your first song</h2>
          <p className="library-empty-body">
            A new song opens in the editor with one guitar track in standard tuning. Everything you
            type is saved here automatically — nothing leaves this browser.
          </p>
          <button type="button" className="btn btn-primary" onClick={createSong}>
            New song
          </button>
        </div>
      ) : (
        <ul className="library-grid">
          {library.entries.map((entry) => {
            const isCurrent = entry.id === library.currentId;
            const isConfirmingDelete = pendingDelete === entry.id;

            return (
              <li key={entry.id} className={`library-card ${isCurrent ? 'is-current' : ''}`}>
                <div className="library-card-head">
                  <h2 className="library-card-title">{entry.title || 'Untitled'}</h2>
                  {isCurrent && <span className="library-card-badge popover-title">Current</span>}
                </div>
                <p className="library-card-artist">{entry.artist || 'Unknown artist'}</p>

                <p className="library-card-meta">
                  <span>{plural(entry.song.tracks.length, 'track')}</span>
                  <span>{plural(barCount(entry), 'bar')}</span>
                  <span>{entry.song.bpm} BPM</span>
                  <span>{formatUpdated(entry.updatedAt)}</span>
                </p>

                <div className="library-card-actions">
                  {isConfirmingDelete ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => {
                          commit(deleteSong(library, entry.id));
                          setPendingDelete(null);
                        }}
                      >
                        Delete for good
                      </button>
                      <button type="button" className="btn" onClick={() => setPendingDelete(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => openSong(entry.id)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => commit(duplicateSong(library, entry.id))}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => setPendingDelete(entry.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
