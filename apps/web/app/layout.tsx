import './globals.css';
import type { ReactNode } from 'react';
import { GHOST_SITES } from '@ghostchain/config';
import { AppLayout } from '../src/modules/app-shell/components/AppLayout';
import { AppShellProvider } from '../src/modules/app-shell/AppShellProvider';
import { SessionProvider } from '../src/modules/identity-access/session';
import { fetchServerSession } from '../src/modules/identity-access/serverSession';
import { GhostStackStoreProvider } from '../src/store';

export const metadata = {
  title: {
    default: 'GhostChain Control Center',
    template: '%s | GhostChain'
  },
  description: 'GhostChain Sovereign L1/L2/L3 blockchain management, governance, treasury, and AI-powered operations dashboard.',
  applicationName: 'GhostChain Control Center',
  keywords: ['GhostChain', 'GST', 'blockchain', 'L1', 'L2', 'L3', 'sovereign', 'custom execution'],
  authors: [{ name: 'GhostChain', url: GHOST_SITES.main.url }],
  creator: 'GhostChain',
  publisher: 'GhostChain',
  robots: { index: false, follow: false },
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon.svg'
  },
  openGraph: {
    type: 'website',
    siteName: 'GhostChain Control Center',
    title: 'GhostChain Control Center',
    description: 'Sovereign L1/L2/L3 blockchain operations powered by GhostChain.',
    locale: 'en_US'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GhostChain Control Center',
    description: 'Sovereign L1/L2/L3 blockchain operations.'
  }
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await fetchServerSession();
  const initialSession = session.user ? { user: session.user, loading: false } : undefined;
  return (
    <html lang="en">
      <body>
        <SessionProvider initial={initialSession}>
          <AppShellProvider>
            <GhostStackStoreProvider>
              <AppLayout>{children}</AppLayout>
            </GhostStackStoreProvider>
          </AppShellProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
