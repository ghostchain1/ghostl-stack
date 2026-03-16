import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s | GhostWallet", default: "GhostWallet — Multi-Chain GST Wallet" },
  description: "GhostWallet is the official web wallet for GhostChain (L1/L2/L3). Send, receive, and manage GST across all layers.",
  metadataBase: new URL("https://wallet.ghostchain.cloud"),
  openGraph: { siteName: "GhostWallet", locale: "en_US", type: "website" },
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
