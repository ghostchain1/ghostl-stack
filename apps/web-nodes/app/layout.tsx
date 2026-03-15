import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Node Operators — GhostChain",
  description: "Run a GhostChain validator or full node. Staking guides, monitoring, and reward analytics.",
  keywords:    ["GhostChain", "blockchain", "L1", "L2", "L3", "GST"],
  openGraph: {
    type:    "website",
    title:   "Node Operators — GhostChain",
    description: "Run a GhostChain validator or full node. Staking guides, monitoring, and reward analytics.",
    siteName: "GhostChain",
  },
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
    other: [{ rel: 'icon', url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
