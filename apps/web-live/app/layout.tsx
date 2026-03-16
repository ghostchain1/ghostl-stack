import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s | LitVyb Live", default: "LitVyb Live — On-Chain Streaming Platform" },
  description: "LitVyb Live — watch, host, and monetize live streams with GST on the GhostChain L3 network.",
  metadataBase: new URL("https://ghostchain.live"),
  openGraph: { siteName: "LitVyb Live", locale: "en_US", type: "website" },
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
