import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ghost X — Order Book DEX",
  description: "Limit order book exchange on GhostChain L2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased min-h-screen">
        <header className="flex items-center gap-4 px-6 py-3 border-b border-gray-800 bg-gray-900">
          <span className="text-xl font-bold tracking-tight text-white">
            👻 Ghost<span className="text-violet-400">X</span>
          </span>
          <span className="text-xs text-gray-500 mt-0.5">Order Book DEX · GhostChain L2</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="text-center text-xs text-gray-600 py-4 border-t border-gray-800">
          © 2026 GhostChain — Ghost X Exchange
        </footer>
      </body>
    </html>
  );
}
