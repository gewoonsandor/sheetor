import type { PropsWithChildren } from 'react';
import { AppHeader } from './AppHeader';
import { AppFooter } from './AppFooter';

export const AppLayout = ({ children }: PropsWithChildren) => {
  return (
    <div className="app-wrapper">
      <AppHeader />
      <main className="app-main">{children}</main>
      <AppFooter />
    </div>
  );
};
