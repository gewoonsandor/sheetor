import { useEffect, useState, useSyncExternalStore } from 'react';
import type { DragEvent, ReactNode, SyntheticEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { FALLBACK_MESSAGE } from '../../../app/http';
import { MenuButton } from '../../../app/MenuButton';
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
  searchSongs,
  songsIn,
  sortSongs,
} from '../libraryStore';
import type { Library, LibraryEntry, LibraryFolder, SongOrder } from '../libraryStore';
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

const NoteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const DotsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
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
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<SongOrder>('updated');
  // The item whose ⋯ menu is open.
  const [openMenu, setOpenMenu] = useState<string | null>(null);

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
        </header>
        {error === null ? (
          <ul className="library-list card" aria-busy="true" aria-label="Loading your library">
            {Array.from({ length: 5 }, (_, index) => (
              <li key={index} className="library-row skeleton" />
            ))}
          </ul>
        ) : (
          <div className="library-load-error">
            <p className="form-error" role="alert">
              {error}
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setError(null);
                void reload();
              }}
            >
              Retry
            </button>
          </div>
        )}
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
    setOpenMenu(null);
    setSearchParams(id === null ? {} : { folder: id });
  };

  // An action closes its menu; focus goes back to the ⋯ trigger rather than
  // falling to the page when the popover unmounts.
  const closeMenu = (event: SyntheticEvent<HTMLElement>): void => {
    event.currentTarget.closest('.menu')?.querySelector<HTMLElement>('button')?.focus();
    setOpenMenu(null);
    setPendingDelete(null);
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
      className="control-select"
      aria-label={`Move ${label} to a folder`}
      value=""
      onChange={(event) => {
        const target = event.target.value === ROOT_VALUE ? null : event.target.value;
        closeMenu(event);
        move(item, target);
      }}
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

  const actionsMenu = (id: string, name: string, items: ReactNode) => (
    <MenuButton
      label={`Actions for ${name}`}
      iconOnly
      icon={<DotsIcon />}
      placement="down"
      align="end"
      triggerClassName="btn-sm btn-ghost btn-icon"
      open={openMenu === id}
      onToggle={() => {
        setPendingDelete(null);
        setOpenMenu((prev) => (prev === id ? null : id));
      }}
    >
      {items}
    </MenuButton>
  );

  // While a delete is pending, the menu asks before acting. The keys make these fresh
  // buttons rather than reused menu rows, so Cancel takes focus.
  const confirmDelete = (hint: string, label: string, onConfirm: () => void) => (
    <>
      <p className="popover-hint">{hint}</p>
      <button
        key="confirm"
        type="button"
        className="btn btn-danger"
        onClick={(event) => {
          closeMenu(event);
          onConfirm();
        }}
      >
        {label}
      </button>
      <button key="cancel" type="button" className="btn" autoFocus onClick={closeMenu}>
        Cancel
      </button>
    </>
  );

  const folderRow = (folder: LibraryFolder) => {
    const isOwner = folder.role === 'owner';
    const isShareRoot = !isOwner && folder.parentId === null;
    const editable = canEdit(folder.role);
    const movable = editable && (isOwner || folder.parentId !== null);
    const isRenaming = renaming?.id === folder.id;
    const songCount = countSongsIn(library, folder.id);
    const childCount = childFolders(library, folder.id).length;
    const contents = [
      ...(songCount > 0 ? [plural(songCount, 'song')] : []),
      ...(childCount > 0 ? [plural(childCount, 'folder')] : []),
    ];
    const badge = isShareRoot ? accessLabel(folder) : isOwner && folder.isShared ? 'Shared' : null;
    const drop = dropProps(folder.id);
    const item: Dragged = { kind: 'folder', id: folder.id, ownerId: folder.ownerId };

    return (
      <li
        key={folder.id}
        className={`library-row ${drop.className}`}
        {...dragProps(item, movable)}
        onDragEnter={drop.onDragEnter}
        onDragOver={drop.onDragOver}
        onDragLeave={drop.onDragLeave}
        onDrop={drop.onDrop}
      >
        <span className="library-row-icon">
          <FolderIcon />
        </span>
        <div className="library-row-name">
          {isRenaming ? (
            <input
              className="library-rename"
              aria-label="Folder name"
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
          ) : (
            <button type="button" className="library-row-open" onClick={() => openFolder(folder.id)}>
              {folder.name}
            </button>
          )}
        </div>
        <span className="library-row-meta">{contents.length > 0 ? contents.join(' · ') : 'Empty'}</span>
        <span className="library-row-aside">
          {badge !== null && <span className="library-badge eyebrow">{badge}</span>}
        </span>
        <div className="library-row-actions">
          {(editable || isOwner || isShareRoot) && actionsMenu(folder.id, folder.name, pendingDelete === folder.id
            ? confirmDelete(
              songCount === 0 && childCount === 0
                ? 'Nothing inside — this only removes the folder.'
                : `Everything inside moves to ${here ? here.name : 'Library'}. No song is deleted.`,
              'Delete folder',
              () => void run(() => deleteFolder(folder.id)),
            )
            : (
              <>
                {editable && (
                  <button
                    type="button"
                    className="btn"
                    onClick={(event) => {
                      closeMenu(event);
                      setRenaming({ id: folder.id, draft: folder.name });
                    }}
                  >
                    Rename
                  </button>
                )}
                {movable && moveMenu(item, folder.parentId, folder.name)}
                {isOwner && (
                  <button
                    type="button"
                    className="btn"
                    onClick={(event) => {
                      closeMenu(event);
                      setSharing(folder);
                    }}
                  >
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
                    onClick={(event) => {
                      closeMenu(event);
                      void run(() => unshareFolder(folder.id, me));
                    }}
                  >
                    Leave
                  </button>
                )}
              </>
            ))}
        </div>
      </li>
    );
  };

  const songRow = (entry: LibraryEntry, meta: string) => {
    const title = entry.title || 'Untitled';
    const isCurrent = entry.id === currentId;
    const editable = canEdit(entry.role);
    const item: Dragged = { kind: 'song', id: entry.id, ownerId: entry.ownerId };

    return (
      <li key={entry.id} className={`library-row ${isCurrent ? 'is-current' : ''}`} {...dragProps(item, editable)}>
        <span className="library-row-icon">
          <NoteIcon />
        </span>
        <div className="library-row-name">
          <Link to={`/songs/${entry.id}`} className="library-row-open" draggable={false}>
            {title}
          </Link>
          <span className="library-row-sub">{entry.artist || 'Unknown artist'}</span>
        </div>
        <span className="library-row-meta">{meta}</span>
        <span className="library-row-aside">
          {isCurrent ? (
            <span className="library-badge eyebrow">Current</span>
          ) : (
            `${formatUpdated(entry.updatedAt)}${entry.updatedByName !== null ? ` by ${entry.updatedByName}` : ''}`
          )}
        </span>
        <div className="library-row-actions">
          {editable && actionsMenu(entry.id, title, pendingDelete === entry.id
            ? confirmDelete(
              `Deletes “${title}” for everyone it is shared with.`,
              'Delete for good',
              () => void run(() => deleteSong(entry.id)),
            )
            : (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={(event) => {
                    closeMenu(event);
                    void run(() => duplicateSong(entry.id));
                  }}
                >
                  Duplicate
                </button>
                {moveMenu(item, entry.folderId, title)}
                <button type="button" className="btn btn-danger" onClick={() => setPendingDelete(entry.id)}>
                  Delete
                </button>
              </>
            ))}
        </div>
      </li>
    );
  };

  const listSection = (title: string, rows: ReactNode[]) => rows.length > 0 && (
    <section>
      <h2 className="library-section eyebrow">{title}</h2>
      <ul className="library-list card">{rows}</ul>
    </section>
  );

  const trimmedQuery = query.trim();
  const isEmpty = folders.length === 0 && sharedWithMe.length === 0 && songs.length === 0;
  const rootDrop = dropProps(null);

  let content: ReactNode;
  if (trimmedQuery) {
    const results = sortSongs(searchSongs(library, query), order);
    content = results.length > 0
      ? listSection('Results', results.map((entry) => songRow(
        entry,
        folderPath(library, entry.folderId).map((it) => it.name).join(' / ') || 'Library',
      )))
      : <p className="library-no-results">No songs match “{trimmedQuery}”.</p>;
  } else if (isEmpty) {
    content = (
      <div className="library-empty">
        <span className="eyebrow">{here ? 'Empty folder' : 'Empty library'}</span>
        <h2 className="library-empty-title">
          {here ? `Nothing in ${here.name} yet` : 'Start your first song'}
        </h2>
        <p className="library-empty-body">
          {here
            ? 'Drag a song onto this folder from the library, or start a new song here — it will be filed in this folder.'
            : 'Songs are saved to your account. Put them in a folder to share them with other people and edit together in real time.'}
        </p>
        {canCreateHere && (
          <button type="button" className="btn btn-primary" onClick={() => void newSong()}>
            New song
          </button>
        )}
      </div>
    );
  } else {
    content = (
      <>
        {listSection('Folders', folders.map(folderRow))}
        {listSection('Shared with me', sharedWithMe.map(folderRow))}
        {listSection('Songs', sortSongs(songs, order).map((entry) => songRow(
          entry,
          `${plural(entry.trackCount, 'track')} · ${plural(entry.barCount, 'bar')} · ${entry.bpm} BPM`,
        )))}
      </>
    );
  }

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

      <div className="library-toolbar">
        <input
          type="search"
          className="control-input"
          placeholder="Search songs"
          aria-label="Search songs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="control-select"
          aria-label="Sort songs"
          value={order}
          onChange={(event) => setOrder(event.target.value === 'title' ? 'title' : 'updated')}
        >
          <option value="updated">Recently edited</option>
          <option value="title">Title A–Z</option>
        </select>
      </div>

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {content}

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
