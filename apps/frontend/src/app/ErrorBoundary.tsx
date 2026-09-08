import { Component } from 'react';
import type { ErrorInfo, PropsWithChildren, ReactNode } from 'react';

import { deleteSong, loadLibrary, saveLibrary } from '../features/library/libraryStore';

const dropOpenSong = (): void => {
  const library = loadLibrary();
  if (library.currentId !== null) saveLibrary(deleteSong(library, library.currentId));
  window.location.reload();
};

interface ErrorBoundaryState {
  error: Error | null;
}

// React has no hook equivalent for error boundaries, so this is the one class
// component in the codebase.
export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[sheetor] Editor crashed', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-error">
        <h2>The editor crashed</h2>
        <p className="app-error-message">{error.message}</p>
        <p>
          If this happens again right after reloading, the song you had open is likely at fault.
          Discarding it removes that one song from your library and leaves the rest untouched.
        </p>
        <div className="app-error-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="btn btn-danger" onClick={dropOpenSong}>
            Discard the open song
          </button>
        </div>
      </div>
    );
  }
}
