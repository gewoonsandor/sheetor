import { useEffect, useState, useSyncExternalStore } from 'react';
import type { DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { FALLBACK_MESSAGE } from '../../../app/http';
import { createEmptySong } from '../../editor/components/songUtils';
import { loadSettings } from '../../settings/settingsStore';
import { getUserSnapshot, subscribeUser } from '../../user/userStore';
import { ShareDialog } from '../components/ShareDialog';
import {
  createFolder,
  createSong,
  deleteFolder,
  deleteSong,
  duplicateSong,
  fetchLibrary,
  moveFolder,
  moveSong,
  renameFolder,
  unshareFolder,
} from '../libraryApi';
import {
  canEdit,
  childFolders,
  countSongsIn,
  folderChoices,
  folderPath,
  lastSongId,
  songsIn,
} from '../libraryStore';
import type { Library, LibraryFolder } from '../libraryStore';
import '../LibraryPage.css';

// The library root is not a folder, so the move menus need a value for it that
// no generated id can collide with.
const ROOT_VALUE = '#root';

interface Dragged {
  kind: 'song' | 'folder';
  id: string;
  ownerId: number;
}

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : FALLBACK_MESSAGE);

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

const accessLabel = (folder: LibraryFolder): string =>
  `${folder.ownerName} · ${canEdit(folder.role) ? 'can edit' : 'can view'}`;

const FolderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7.5a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6l1.4 1.4H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const LibraryPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const me = Number(useSyncExternalStore(subscribeUser, getUserSnapshot).id);
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [sharing, setSharing] = useState<LibraryFolder | null>(null);

  // Collaborators change the library too, so it is re-read whenever the tab regains focus.
  useEffect(() => {
    const load = (): void => {
      fetchLibrary().then(setLibrary, (err: unknown) => setError(messageOf(err)));
    };
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  const reload = async (): Promise<void> => {
    try {
      setLibrary(await fetchLibrary());
    } catch (err) {
      setError(messageOf(err));
    }
  };

  /// Every change is a request followed by a fresh read, so the page always shows
  /// what the server decided rather than what it was asked.
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(messageOf(err));
    }
    await reload();
  };

  if (library === null) {
    return (
      <div className="page-shell">
        <header className="page-header">
          <h1 className="page-title">Library</h1>
          <p className="page-subtitle">{error ?? 'Loading your library…'}</p>
        </header>
      </div>
    );
  }

  // The open folder lives in the URL, so browser back walks back out of it.
  const requested = searchParams.get('folder');
  const folderId = requested !== null && library.folders.some((it) => it.id === requested)
    ? requested
    : null;

  const path = folderPath(library, folderId);
  const here = path.length > 0 ? path[path.length - 1] : null;
  const children = childFolders(library, folderId);
  // At the root, folders other people shared with you get their own shelf.
  const folders = here ? children : children.filter((it) => it.role === 'owner');
  const sharedWithMe = here ? [] : children.filter((it) => it.role !== 'owner');
  const songs = songsIn(library, folderId);
  const canCreateHere = here === null || canEdit(here.role);
  const currentId = lastSongId();

  const openFolder = (id: string | null): void => {
    setPendingDelete(null);
    setRenaming(null);
    setSearchParams(id === null ? {} : { folder: id });
  };

  const newSong = async (): Promise<void> => {
    setError(null);
    try {
      const created = await createSong({ ...createEmptySong(), bpm: loadSettings().defaultBpm }, folderId);
      navigate(`/songs/${created.id}`);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const createSubfolder = (): Promise<void> =>
    run(async () => {
      const folder = await createFolder('New folder', folderId);
      setRenaming({ id: folder.id, draft: folder.name });
    });

  const commitRename = (): void => {
    if (!renaming) return;
    const { id, draft } = renaming;
    setRenaming(null);
    const current = library.folders.find((it) => it.id === id);
    if (current && draft.trim().length > 0 && draft.trim() !== current.name) {
      void run(() => renameFolder(id, draft));
    }
  };

  const move = (item: Dragged, targetId: string | null): void => {
    void run(() => (item.kind === 'song' ? moveSong(item.id, targetId) : moveFolder(item.id, targetId)));
  };

  // Items never leave their owner's library, and only land where you may edit.
  const canReceive = (item: Dragged, targetId: string | null): boolean => {
    if (targetId === null) return item.ownerId === me;
    const target = library.folders.find((it) => it.id === targetId);
    return target !== undefined && target.ownerId === item.ownerId && canEdit(target.role);
  };

  // A song may go anywhere it is not already; a folder may not swallow itself.
  const canDrop = (targetId: string | null): boolean => {
    if (!dragged || !canReceive(dragged, targetId)) return false;
    if (dragged.kind === 'song') {
      return library.entries.find((it) => it.id === dragged.id)?.folderId !== targetId;
    }
    if (dragged.id === targetId) return false;
    const folder = library.folders.find((it) => it.id === dragged.id);
    if (!folder || folder.parentId === targetId) return false;
    return !folderPath(library, targetId).some((it) => it.id === dragged.id);
  };

  const dragProps = (item: Dragged, enabled: boolean) => (enabled ? {
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
  } : {});

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
      {item.ownerId === me && (
        <option value={ROOT_VALUE} disabled={currentParent === null}>
          Library
        </option>
      )}
      {folderChoices(library, item.ownerId, item.kind === 'folder' ? item.id : null).map((choice) => (
        <option key={choice.id} value={choice.id} disabled={choice.id === currentParent}>
          {`${'\u00a0\u00a0'.repeat(choice.depth + 1)}${choice.name}`}
        </option>
      ))}
    </select>
  );

  const subtitle = (): string => {
    if (here === null) {
      const owned = library.entries.filter((it) => it.ownerId === me).length;
      return `${plural(owned, 'song')} · stored on your account`;
    }
    if (here.role === 'owner') return plural(countSongsIn(library, here.id), 'song');
    return `Shared by ${here.ownerName} · you can ${canEdit(here.role) ? 'edit' : 'view'}`;
  };

  const folderCard = (folder: LibraryFolder) => {
    const isOwner = folder.role === 'owner';
    const isShareRoot = !isOwner && folder.parentId === null;
    const movable = canEdit(folder.role) && (isOwner || folder.parentId !== null);
    const isRenaming = renaming?.id === folder.id;
    const isConfirmingDelete = pendingDelete === folder.id;
    const songCount = countSongsIn(library, folder.id);
    const childCount = childFolders(library, folder.id).length;
    const badge = isShareRoot ? accessLabel(folder) : isOwner && folder.isShared ? 'Shared' : null;
    const drop = dropProps(folder.id);
    const item: Dragged = { kind: 'folder', id: folder.id, ownerId: folder.ownerId };

    return (
      <li
        key={folder.id}
        className={`library-card card library-folder ${drop.className}`}
        {...dragProps(item, movable)}
        onDragEnter={drop.onDragEnter}
        onDragOver={drop.onDragOver}
        onDragLeave={drop.onDragLeave}
        onDrop={drop.onDrop}
      >
        <div className="library-card-head">
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
            <button type="button" className="library-folder-open" onClick={() => openFolder(folder.id)}>
              <span className="library-folder-icon">
                <FolderIcon />
              </span>
              <span className="library-folder-name">{folder.name}</span>
            </button>
          )}
          {badge !== null && <span className="library-card-badge eyebrow">{badge}</span>}
        </div>

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
                  setPendingDelete(null);
                  void run(() => deleteFolder(folder.id));
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
              {canEdit(folder.role) && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setRenaming({ id: folder.id, draft: folder.name })}
                >
                  Rename
                </button>
              )}
              {movable && moveMenu(item, folder.parentId, folder.name)}
              {isOwner && (
                <button type="button" className="btn" onClick={() => setSharing(folder)}>
                  Share
                </button>
              )}
              {isOwner && (
                <button type="button" className="btn btn-danger" onClick={() => setPendingDelete(folder.id)}>
                  Delete
                </button>
              )}
              {isShareRoot && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void run(() => unshareFolder(folder.id, me))}
                >
                  Leave
                </button>
              )}
            </>
          )}
        </div>
      </li>
    );
  };

  const isEmpty = folders.length === 0 && sharedWithMe.length === 0 && songs.length === 0;
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
        <p className="page-subtitle">{subtitle()}</p>
        {canCreateHere && (
          <div className="library-header-actions">
            <button type="button" className="btn" onClick={() => void createSubfolder()}>
              New folder
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void newSong()}>
              New song
            </button>
          </div>
        )}
      </header>

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {isEmpty ? (
        <div className="library-empty">
          <span className="eyebrow">{here ? 'Empty folder' : 'Empty library'}</span>
          <h2 className="library-empty-title">
            {here ? `Nothing in ${here.name} yet` : 'Start your first song'}
          </h2>
          <p className="library-empty-body">
            {here
              ? 'Drag a song card onto this folder from the library, or start a new song here — it will be filed in this folder.'
              : 'Songs are saved to your account. Put them in a folder to share them with other people and edit together in real time.'}
          </p>
          {canCreateHere && (
            <button type="button" className="btn btn-primary" onClick={() => void newSong()}>
              New song
            </button>
          )}
        </div>
      ) : (
        <>
          {folders.length > 0 && <h2 className="library-section eyebrow">Folders</h2>}
          <ul className="library-grid library-grid-folders">{folders.map(folderCard)}</ul>

          {sharedWithMe.length > 0 && (
            <>
              <h2 className="library-section eyebrow">Shared with me</h2>
              <ul className="library-grid library-grid-folders">{sharedWithMe.map(folderCard)}</ul>
            </>
          )}

          {(folders.length > 0 || sharedWithMe.length > 0) && songs.length > 0 && (
            <h2 className="library-section eyebrow">Songs</h2>
          )}
          <ul className="library-grid">
            {songs.map((entry) => {
              const isCurrent = entry.id === currentId;
              const isConfirmingDelete = pendingDelete === entry.id;
              const editable = canEdit(entry.role);
              const item: Dragged = { kind: 'song', id: entry.id, ownerId: entry.ownerId };

              return (
                <li
                  key={entry.id}
                  className={`library-card card ${isCurrent ? 'is-current' : ''}`}
                  {...dragProps(item, editable)}
                >
                  <div className="library-card-head">
                    <h2 className="library-card-title">{entry.title || 'Untitled'}</h2>
                    {isCurrent && <span className="library-card-badge eyebrow">Current</span>}
                  </div>
                  <p className="library-card-artist">{entry.artist || 'Unknown artist'}</p>

                  <p className="library-card-meta">
                    <span>{plural(entry.trackCount, 'track')}</span>
                    <span>{plural(entry.barCount, 'bar')}</span>
                    <span>{entry.bpm} BPM</span>
                    <span>
                      {formatUpdated(entry.updatedAt)}
                      {entry.updatedByName !== null && ` by ${entry.updatedByName}`}
                    </span>
                  </p>

                  <div className="library-card-actions">
                    {isConfirmingDelete ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => {
                            setPendingDelete(null);
                            void run(() => deleteSong(entry.id));
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
                          onClick={() => navigate(`/songs/${entry.id}`)}
                        >
                          Open
                        </button>
                        {editable && (
                          <button type="button" className="btn" onClick={() => void run(() => duplicateSong(entry.id))}>
                            Duplicate
                          </button>
                        )}
                        {editable && moveMenu(item, entry.folderId, entry.title || 'Untitled')}
                        {editable && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => setPendingDelete(entry.id)}
                          >
                            Delete
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {sharing !== null && (
        <ShareDialog
          folder={sharing}
          onClose={() => {
            setSharing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
};
