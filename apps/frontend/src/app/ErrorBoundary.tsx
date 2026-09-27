import { Component } from 'react';
import type { ErrorInfo, PropsWithChildren, ReactNode } from 'react';

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
          If this happens again right after reloading, open a different song from the library
          and tell the owner which one fails.
        </p>
        <div className="app-error-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={() => window.location.assign('/library')}>
            Back to library
          </button>
        </div>
      </div>
    );
  }
}
