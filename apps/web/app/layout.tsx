import './globals.css';
import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { AppLayout } from '../src/modules/app-shell/components/AppLayout';
import { AppShellProvider } from '../src/modules/app-shell/AppShellProvider';
import { SessionProvider } from '../src/modules/identity-access/session';
import { fetchServerSession } from '../src/modules/identity-access/serverSession';

export const viewport: Viewport = {
  themeColor: '#0B0F14',
  colorScheme: 'dark',
};

export const metadata = {
  title: 'GhostStack — Autonomy Secured.',
  description:
    'GhostStack is an AI-governed sovereign multichain federation engineered for constitutional governance, energy-efficient consensus, and long-horizon digital sovereignty.',
  keywords: [
    'GhostStack',
    'GhostChain',
    'sovereign blockchain',
    'AI governance',
    'multichain infrastructure',
    'constitutional smart contracts',
    'GST token',
    'Ghost Federation'
  ],
  authors: [{ name: 'GhostStack Foundation' }],
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'GhostStack — Autonomy Secured.',
    description:
      'AI-Governed Sovereign Multichain Infrastructure. L3 → L2 → L1. Constitutional governance. Closed-loop treasury.',
    type: 'website',
    siteName: 'GhostStack',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: 'GhostStack — Autonomy Secured.',
    description: 'AI-Governed Sovereign Multichain Infrastructure.',
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await fetchServerSession();
  const initialSession = session.user ? { user: session.user, loading: false } : undefined;
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
