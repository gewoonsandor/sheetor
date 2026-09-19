import { useEffect, useSyncExternalStore } from 'react';
import type { PropsWithChildren } from 'react';

import { fetchSession } from '../features/user/authApi';
import { getSessionStatus, subscribeSession } from '../features/user/session';
import { LoginPage } from '../features/user/pages/LoginPage';

/// Nothing renders until the cookie has been checked, so the application is
/// never briefly visible to someone who is not signed in, and a returning
/// visitor never sees the form flash before `/users/me` answers.
export const AuthGate = ({ children }: PropsWithChildren) => {
  const status = useSyncExternalStore(subscribeSession, getSessionStatus);

  useEffect(() => {
    void fetchSession();
  }, []);

  if (status === 'checking') return <div className="login-splash">Checking your session…</div>;
  if (status === 'out') return <LoginPage />;
  return <>{children}</>;
};
