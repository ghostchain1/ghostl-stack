import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { WalletProvider } from "../context/WalletContext";
import WalletButton from "../components/WalletButton";

export const metadata: Metadata = {
  title: "Ghost X — Order Book DEX",
  description: "Limit order book exchange on GhostChain L2",
};

const NAV_LINKS = [
  { href: "/",        label: "Trade"   },
  { href: "/staking", label: "Stake"   },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased min-h-screen">
        <WalletProvider>
          <header className="flex items-center gap-4 px-6 py-3 border-b border-gray-800 bg-gray-900 sticky top-0 z-50">
            {/* Brand */}
            <Link href="/" className="text-xl font-bold tracking-tight text-white shrink-0">
              👻 Ghost<span className="text-violet-400">X</span>
            </Link>

            {/* Nav */}
            <nav className="flex items-center gap-1 ml-2">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="px-3 py-1.5 rounded-md text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </nav>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Wallet button (client component) */}
            <WalletButton />
          </header>

          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

          <footer className="text-center text-xs text-gray-600 py-4 border-t border-gray-800">
            © 2026 GhostChain — Ghost X Exchange · GhostChain L2
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
