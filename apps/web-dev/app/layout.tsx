import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Developer Portal — GhostChain",
  description: "SDKs, RPC endpoints, documentation, and grants for developers building on GhostChain.",
  keywords:    ["GhostChain", "blockchain", "L1", "L2", "L3", "GST"],
  openGraph: {
    type:    "website",
    title:   "Developer Portal — GhostChain",
    description: "SDKs, RPC endpoints, documentation, and grants for developers building on GhostChain.",
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
