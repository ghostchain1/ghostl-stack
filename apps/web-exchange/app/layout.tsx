import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Institutional Exchange — GhostChain",
  description: "Institutional OTC trading, treasury markets, KYC onboarding, and custody settlement.",
  keywords:    ["GhostChain", "blockchain", "L1", "L2", "L3", "GST"],
  openGraph: {
    type:    "website",
    title:   "Institutional Exchange — GhostChain",
    description: "Institutional OTC trading, treasury markets, KYC onboarding, and custody settlement.",
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
