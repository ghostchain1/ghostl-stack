import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s | GhostChain", default: "GhostChain — The Sovereign Blockchain" },
  description: "GhostChain is a sovereign, AI-powered Layer-1 blockchain with integrated L2 and L3 scaling.",
  metadataBase: new URL("https://ghostchain.world"),
  openGraph: {
    siteName: "GhostChain",
    locale: "en_US",
    type: "website",
  },
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
