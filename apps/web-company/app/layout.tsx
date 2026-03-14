import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "GhostChain — Company",
  description: "Meet the team behind GhostChain. Careers, press resources, and legal information.",
  keywords:    ["GhostChain", "blockchain", "L1", "L2", "L3", "GST"],
  openGraph: {
    type:    "website",
    title:   "GhostChain — Company",
    description: "Meet the team behind GhostChain. Careers, press resources, and legal information.",
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
