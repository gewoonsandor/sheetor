import { useSyncExternalStore } from 'react';
import { Link, NavLink, useMatch } from 'react-router-dom';

import { deriveInitials, getUserSnapshot, subscribeUser } from '../../features/user/userStore';

const navClass = ({ isActive }: { isActive: boolean }): string =>
  isActive ? 'app-nav-link is-active' : 'app-nav-link';

export const AppHeader = () => {
  const user = useSyncExternalStore(subscribeUser, getUserSnapshot);
  const onSong = useMatch('/songs/:songId') !== null;

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
        <NavLink
          to="/"
          className={({ isActive }) => navClass({ isActive: isActive || onSong })}
          end
        >
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
      </nav>

      <Link to="/settings" className="app-user" title="User settings">
        <span className="app-user-avatar" aria-hidden="true">{deriveInitials(user.name)}</span>
        <span className="app-user-name">{user.name}</span>
      </Link>
    </header>
  );
};
