import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Network Status — GhostChain",
  description: "Real-time GhostChain network health: RPC uptime, validator status, bridge health.",
  keywords:    ["GhostChain", "blockchain", "L1", "L2", "L3", "GST"],
  openGraph: {
    type:    "website",
    title:   "Network Status — GhostChain",
    description: "Real-time GhostChain network health: RPC uptime, validator status, bridge health.",
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
