import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Governance — GhostChain",
  description: "On-chain governance, proposals, voting, and constitutional charter for GhostChain.",
  keywords:    ["GhostChain", "blockchain", "L1", "L2", "L3", "GST"],
  openGraph: {
    type:    "website",
    title:   "Governance — GhostChain",
    description: "On-chain governance, proposals, voting, and constitutional charter for GhostChain.",
    siteName: "GhostChain",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
