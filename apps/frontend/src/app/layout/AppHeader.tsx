import { NavLink } from 'react-router-dom';

const navClass = ({ isActive }: { isActive: boolean }): string =>
  isActive ? 'app-nav-link is-active' : 'app-nav-link';

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

      <nav className="app-nav" aria-label="Sections">
        <NavLink to="/" className={navClass} end>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
          <span>Editor</span>
        </NavLink>
        <NavLink to="/library" className={navClass}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5v14M8 5v14" />
            <path d="M12 5h7a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-7z" />
          </svg>
          <span>Library</span>
        </NavLink>
        <NavLink to="/settings" className={navClass}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" />
          </svg>
          <span>Settings</span>
        </NavLink>
      </nav>
    </header>
  );
};
