import { Component } from 'react';
import type { ErrorInfo, PropsWithChildren, ReactNode } from 'react';

import { clearSavedSong } from '../features/editor/components/persistence';

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
          If this happens again right after reloading, the autosaved song is likely at fault.
          Resetting it keeps a copy under the <code>sheetor-song.invalid</code> key.
        </p>
        <div className="app-error-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              clearSavedSong();
              window.location.reload();
            }}
          >
            Reset saved song
          </button>
        </div>
      </div>
    );
  }
}
