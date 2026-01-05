import './globals.css';
import type { ReactNode } from 'react';
import { AppLayout } from '../src/modules/app-shell/components/AppLayout';
import { AppShellProvider } from '../src/modules/app-shell/AppShellProvider';
import { SessionProvider } from '../src/modules/identity-access/session';
import { fetchServerSession } from '../src/modules/identity-access/serverSession';

export const metadata = {
  title: 'GhostL Dashboard',
  description: 'Blockchain management dashboard'
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await fetchServerSession();
  const initialSession =
    session.user || session.roles || session.permissions
      ? { user: { email: session.user?.email, roles: session.roles, permissions: session.permissions }, loading: false }
      : undefined;
  return (
    <html lang="en">
      <body>
        <SessionProvider initial={initialSession}>
          <AppShellProvider>
            <AppLayout>{children}</AppLayout>
          </AppShellProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
