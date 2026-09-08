import { useState } from 'react';
import type { DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import type { Library, LibraryEntry } from '../libraryStore';
import {
  addSong,
  childFolders,
  countSongsIn,
  createFolder,
  deleteFolder,
  deleteSong,
  duplicateSong,
  folderChoices,
  folderPath,
  loadLibrary,
  moveFolder,
  moveSong,
  renameFolder,
  saveLibrary,
  setCurrentSong,
  songsIn,
} from '../libraryStore';
import { createEmptySong } from '../../editor/components/songUtils';
import { loadSettings } from '../../settings/settingsStore';
import '../LibraryPage.css';

// The library root is not a folder, so the move menus need a value for it that
// no generated id can collide with.
const ROOT_VALUE = '#root';

interface Dragged {
  kind: 'song' | 'folder';
  id: string;
}

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

const FolderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7.5a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6l1.4 1.4H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const LibraryPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [library, setLibrary] = useState<Library>(loadLibrary);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // The open folder lives in the URL, so browser back walks back out of it.
  const requested = searchParams.get('folder');
  const folderId = requested !== null && library.folders.some((it) => it.id === requested)
    ? requested
    : null;

  const path = folderPath(library, folderId);
  const here = path.length > 0 ? path[path.length - 1] : null;
  const folders = childFolders(library, folderId);
  const songs = songsIn(library, folderId);

  const commit = (next: Library): void => {
    saveLibrary(next);
    setLibrary(next);
  };

  const openFolder = (id: string | null): void => {
    setPendingDelete(null);
    setRenaming(null);
    setSearchParams(id === null ? {} : { folder: id });
  };

  const createSong = (): void => {
    const { library: next } = addSong(
      library,
      { ...createEmptySong(), bpm: loadSettings().defaultBpm },
      folderId,
    );
    saveLibrary(next);
    navigate('/');
  };

  const openSong = (id: string): void => {
    saveLibrary(setCurrentSong(library, id));
    navigate('/');
  };

  const createSubfolder = (): void => {
    const { library: next, folder } = createFolder(library, 'New folder', folderId);
    commit(next);
    setRenaming({ id: folder.id, draft: folder.name });
  };

  const commitRename = (): void => {
    if (renaming) commit(renameFolder(library, renaming.id, renaming.draft));
    setRenaming(null);
  };

  const move = (item: Dragged, targetId: string | null): void => {
    commit(item.kind === 'song'
      ? moveSong(library, item.id, targetId)
      : moveFolder(library, item.id, targetId));
  };

  // A song may go anywhere it is not already; a folder may not swallow itself.
  const canDrop = (targetId: string | null): boolean => {
    if (!dragged) return false;
    if (dragged.kind === 'song') {
      return library.entries.find((it) => it.id === dragged.id)?.folderId !== targetId;
    }
    if (dragged.id === targetId) return false;
    const folder = library.folders.find((it) => it.id === dragged.id);
    if (!folder || folder.parentId === targetId) return false;
    return !folderPath(library, targetId).some((it) => it.id === dragged.id);
  };

  const dragProps = (item: Dragged) => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
      setDragged(item);
    },
    onDragEnd: () => {
      setDragged(null);
      setDropTarget(null);
    },
  });

  const dropProps = (targetId: string | null) => {
    const key = targetId ?? ROOT_VALUE;
    // dragenter arms the target; dragover has to keep preventing default or the
    // browser refuses the drop.
    const over = (event: DragEvent<HTMLElement>) => {
      if (!canDrop(targetId)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget((prev) => (prev === key ? prev : key));
    };
    return {
      onDragEnter: over,
      onDragOver: over,
      onDragLeave: () => setDropTarget((prev) => (prev === key ? null : prev)),
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        if (dragged && canDrop(targetId)) move(dragged, targetId);
        setDragged(null);
        setDropTarget(null);
      },
      className: dropTarget === key ? 'is-drop-target' : '',
    };
  };

  const moveMenu = (item: Dragged, currentParent: string | null, label: string) => (
    <select
      className="library-move"
      aria-label={`Move ${label} to a folder`}
      value=""
      onChange={(event) => move(item, event.target.value === ROOT_VALUE ? null : event.target.value)}
    >
      <option value="" disabled>
        Move to…
      </option>
      <option value={ROOT_VALUE} disabled={currentParent === null}>
        Library
      </option>
      {folderChoices(library, item.kind === 'folder' ? item.id : null).map((choice) => (
        <option key={choice.id} value={choice.id} disabled={choice.id === currentParent}>
          {`${'\u00a0\u00a0'.repeat(choice.depth + 1)}${choice.name}`}
        </option>
      ))}
    </select>
  );

  const isEmpty = folders.length === 0 && songs.length === 0;

  const rootDrop = dropProps(null);

  return (
    <div className="page-shell">
      {here && (
        <nav className="library-breadcrumb" aria-label="Folder path">
          <button
            type="button"
            className={`library-crumb ${rootDrop.className}`}
            onClick={() => openFolder(null)}
            onDragEnter={rootDrop.onDragEnter}
            onDragOver={rootDrop.onDragOver}
            onDragLeave={rootDrop.onDragLeave}
            onDrop={rootDrop.onDrop}
          >
            Library
          </button>
          {path.map((folder, index) => {
            const drop = dropProps(folder.id);
            return (
              <span key={folder.id} className="library-crumb-step">
                <span className="library-crumb-sep" aria-hidden="true">
                  /
                </span>
                <button
                  type="button"
                  className={`library-crumb ${drop.className}`}
                  aria-current={index === path.length - 1 ? 'page' : undefined}
                  onClick={() => openFolder(folder.id)}
                  onDragEnter={drop.onDragEnter}
                  onDragOver={drop.onDragOver}
                  onDragLeave={drop.onDragLeave}
                  onDrop={drop.onDrop}
                >
                  {folder.name}
                </button>
              </span>
            );
          })}
        </nav>
      )}

      <header className="page-header">
        <h1 className="page-title">{here ? here.name : 'Library'}</h1>
        <p className="page-subtitle">
          {isEmpty
            ? here
              ? 'This folder is empty. Songs and folders you put here stay in this browser.'
              : 'Nothing saved yet. Songs live in this browser and autosave as you edit.'
            : [
                folders.length > 0 ? plural(folders.length, 'folder') : null,
                songs.length > 0 ? plural(songs.length, 'song') : null,
              ]
                .filter((part) => part !== null)
                .join(' · ') + (here ? '' : ' in this browser, autosaved as you edit.')}
        </p>
        <div className="library-header-actions">
          <button type="button" className="btn" onClick={createSubfolder}>
            New folder
          </button>
          <button type="button" className="btn btn-primary" onClick={createSong}>
            New song
          </button>
        </div>
      </header>

      {isEmpty ? (
        <div className="library-empty">
          <span className="popover-title">{here ? 'Empty folder' : 'Empty library'}</span>
          <h2 className="library-empty-title">
            {here ? `Nothing in ${here.name} yet` : 'Start your first song'}
          </h2>
          <p className="library-empty-body">
            {here
              ? 'Drag a song card onto this folder from the library, or start a new song here — it will be filed in this folder.'
              : 'A new song opens in the editor with one guitar track in standard tuning. Everything you type is saved here automatically — nothing leaves this browser. Use folders to group what you are working on.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={createSong}>
            New song
          </button>
        </div>
      ) : (
        <>
          {folders.length > 0 && (
            <h2 className="library-section popover-title">Folders</h2>
          )}
          <ul className="library-grid library-grid-folders">
          {folders.map((folder) => {
            const isRenaming = renaming?.id === folder.id;
            const isConfirmingDelete = pendingDelete === folder.id;
            const songCount = countSongsIn(library, folder.id);
            const childCount = childFolders(library, folder.id).length;
            const drop = dropProps(folder.id);

            return (
              <li
                key={folder.id}
                className={`library-card library-folder ${drop.className}`}
                {...dragProps({ kind: 'folder', id: folder.id })}
                onDragEnter={drop.onDragEnter}
                onDragOver={drop.onDragOver}
                onDragLeave={drop.onDragLeave}
                onDrop={drop.onDrop}
              >
                {isRenaming ? (
                  <div className="library-folder-head">
                    <span className="library-folder-icon">
                      <FolderIcon />
                    </span>
                    <input
                      className="library-rename"
                      value={renaming.draft}
                      autoFocus
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => setRenaming({ id: folder.id, draft: event.target.value })}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitRename();
                        if (event.key === 'Escape') setRenaming(null);
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="library-folder-open"
                    onClick={() => openFolder(folder.id)}
                  >
                    <span className="library-folder-icon">
                      <FolderIcon />
                    </span>
                    <span className="library-folder-name">{folder.name}</span>
                  </button>
                )}

                <p className="library-card-meta">
                  <span>{songCount === 0 ? 'Empty' : plural(songCount, 'song')}</span>
                  {childCount > 0 && <span>{plural(childCount, 'folder')}</span>}
                </p>

                <div className="library-card-actions">
                  {isConfirmingDelete ? (
                    <>
                      <p className="library-confirm">
                        {songCount === 0 && childCount === 0
                          ? 'Nothing inside — this only removes the folder.'
                          : `Everything inside moves to ${here ? here.name : 'Library'}. No song is deleted.`}
                      </p>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => {
                          commit(deleteFolder(library, folder.id));
                          setPendingDelete(null);
                        }}
                      >
                        Delete folder
                      </button>
                      <button type="button" className="btn" onClick={() => setPendingDelete(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setRenaming({ id: folder.id, draft: folder.name })}
                      >
                        Rename
                      </button>
                      {moveMenu({ kind: 'folder', id: folder.id }, folderId, folder.name)}
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => setPendingDelete(folder.id)}
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

          {folders.length > 0 && songs.length > 0 && (
            <h2 className="library-section popover-title">Songs</h2>
          )}
          <ul className="library-grid">
          {songs.map((entry) => {
            const isCurrent = entry.id === library.currentId;
            const isConfirmingDelete = pendingDelete === entry.id;

            return (
              <li
                key={entry.id}
                className={`library-card ${isCurrent ? 'is-current' : ''}`}
                {...dragProps({ kind: 'song', id: entry.id })}
              >
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
                      {moveMenu({ kind: 'song', id: entry.id }, entry.folderId, entry.title || 'Untitled')}
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
        </>
      )}
    </div>
  );
};
