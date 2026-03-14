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
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
