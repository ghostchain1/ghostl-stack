import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s | GhostScan", default: "GhostScan — GhostChain Block Explorer" },
  description: "GhostScan is the official block explorer for GhostChain L1, GhostL2, and GhostL3. Browse blocks, transactions, and validators.",
  metadataBase: new URL("https://explorer.ghostchain.world"),
  openGraph: { siteName: "GhostScan", locale: "en_US", type: "website" },
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
