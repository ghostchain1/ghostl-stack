import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "App Ecosystem — GhostChain",
  description: "Explore the GhostChain decentralized application ecosystem.",
  keywords:    ["GhostChain", "blockchain", "L1", "L2", "L3", "GST"],
  openGraph: {
    type:    "website",
    title:   "App Ecosystem — GhostChain",
    description: "Explore the GhostChain decentralized application ecosystem.",
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
