import type { Metadata } from "next";
import { GHOST_SITES } from "@ghostchain/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s | GhostChain RPC Portal", default: "GhostChain RPC Portal — Developer API Access" },
  description: "Connect to GhostChain L1, GhostL2, and GhostL3 with managed RPC endpoints, API keys, and usage analytics.",
  metadataBase: new URL(GHOST_SITES.rpc.url),
  openGraph: { siteName: "GhostChain RPC Portal", locale: "en_US", type: "website" },
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
