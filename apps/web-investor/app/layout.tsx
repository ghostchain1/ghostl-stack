import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Investor Portal — GhostChain",
  description: "Treasury data, tokenomics, yield and governance metrics for GhostChain investors.",
  keywords:    ["GhostChain", "blockchain", "L1", "L2", "L3", "GST"],
  openGraph: {
    type:    "website",
    title:   "Investor Portal — GhostChain",
    description: "Treasury data, tokenomics, yield and governance metrics for GhostChain investors.",
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
