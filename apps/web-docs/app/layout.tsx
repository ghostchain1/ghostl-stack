import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s | GhostChain Docs", default: "GhostChain Docs — Developer Documentation" },
  description: "Official developer documentation for GhostChain, GhostL2, GhostL3, GhostBrain AI, GNS, GhostXchange, and the GST token.",
  metadataBase: new URL("https://docs.ghostchain.online"),
  openGraph: { siteName: "GhostChain Docs", locale: "en_US", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
