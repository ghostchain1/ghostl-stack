import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s | GhostChain Bridge", default: "GhostChain Bridge — Cross-Layer Asset Transfers" },
  description: "Transfer GST and assets between GhostChain L1, GhostL2, and GhostL3 via the official GhostChain bridge.",
  metadataBase: new URL("https://bridge.ghostchain.world"),
  openGraph: { siteName: "GhostChain Bridge", locale: "en_US", type: "website" },
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
