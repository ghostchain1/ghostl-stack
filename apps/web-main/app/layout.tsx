import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "GhostChain — Sovereign AI Blockchain",
  description: "The sovereign, AI-powered multi-layer blockchain ecosystem. L1, L2, L3.",
  keywords:    ["GhostChain", "blockchain", "L1", "L2", "L3", "GST"],
  openGraph: {
    type:    "website",
    title:   "GhostChain — Sovereign AI Blockchain",
    description: "The sovereign, AI-powered multi-layer blockchain ecosystem. L1, L2, L3.",
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
