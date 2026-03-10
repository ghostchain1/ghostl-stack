import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s | GhostBrain", default: "GhostBrain — AI-Powered Network Intelligence" },
  description: "GhostBrain is the AI core of GhostChain — transaction classification, risk scoring, fraud detection, and autonomous governance proposals.",
  metadataBase: new URL("https://ai.ghostchain.cloud"),
  openGraph: { siteName: "GhostBrain", locale: "en_US", type: "website" },
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
