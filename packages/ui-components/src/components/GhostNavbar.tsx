"use client";

import Link from "next/link";
import { GhostLogo } from "./GhostLogo";

interface NavItem { label: string; href: string }

interface GhostNavbarProps {
  appName: string;
  nav?: NavItem[];
  rightSlot?: React.ReactNode;
}

export function Ghostnavbar({ appName, nav = [], rightSlot }: GhostNavbarProps) {
  return (
    <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <GhostLogo size={28} />
            <span className="font-bold text-zinc-100 text-sm">GhostChain</span>
            {appName && (
              <>
                <span className="text-zinc-600 text-sm">/</span>
                <span className="text-violet-400 text-sm font-medium">{appName}</span>
              </>
            )}
          </Link>
        </div>

        {nav.length > 0 && (
          <nav className="hidden md:flex items-center gap-1">
            {nav.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        )}

        {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
      </div>
    </header>
  );
}
