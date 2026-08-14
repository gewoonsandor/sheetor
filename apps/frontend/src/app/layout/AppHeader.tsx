export const AppHeader = () => {
  return (
    <header className="app-header">
      <div className="logo-area">
        <span className="logo-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M9 3.5 19.5 2v3L9 6.5v9.2a3.3 3.3 0 1 1-2-3V3.5Z" />
          </svg>
        </span>
        <span className="logo-text">Sheetor</span>
      </div>
      <p className="header-tagline">Guitar tab &amp; sheet music engraver</p>
    </header>
  );
};
