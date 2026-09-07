import type { PropsWithChildren } from 'react';
import { AppHeader } from './AppHeader';

export const AppLayout = ({ children }: PropsWithChildren) => {
  return (
    <div className="app-wrapper">
      <AppHeader />
      <main className="app-main">{children}</main>
    </div>
  );
};
