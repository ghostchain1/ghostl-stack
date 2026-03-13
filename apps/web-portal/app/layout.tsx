import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title:       "GhostStack Portal — Control Center",
  description: "Unified GhostStack control center for chain management, AI, governance, and DevOps.",
  keywords:    ["GhostChain", "blockchain", "L1", "L2", "L3", "GST"],
  openGraph: {
    type:    "website",
    title:   "GhostStack Portal — Control Center",
    description: "Unified GhostStack control center for chain management, AI, governance, and DevOps.",
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
