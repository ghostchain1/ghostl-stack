import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s | GhostChain Live", default: "GhostChain Live — On-Chain Streaming Platform" },
  description: "GhostChain Live — watch, host, and monetize live streams with GST on the GhostChain L3 network.",
  metadataBase: new URL("https://live.ghostchain.live"),
  openGraph: { siteName: "GhostChain Live", locale: "en_US", type: "website" },
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
