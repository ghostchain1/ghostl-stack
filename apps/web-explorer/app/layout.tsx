import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Block Explorer — GhostChain",
  description: "Explore blocks, transactions, contracts, and validators on GhostChain L1, L2, and L3.",
  keywords:    ["GhostChain", "blockchain", "L1", "L2", "L3", "GST"],
  openGraph: {
    type:    "website",
    title:   "Block Explorer — GhostChain",
    description: "Explore blocks, transactions, contracts, and validators on GhostChain L1, L2, and L3.",
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
