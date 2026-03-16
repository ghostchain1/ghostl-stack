import Link from "next/link";
import { GHOST_SITES } from "@ghostchain/config";
import { GhostLogo } from "./GhostLogo";

export function GhostFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <GhostLogo size={22} />
          <span className="text-zinc-400 text-sm">
            &copy; {year} GhostChain. All rights reserved.
          </span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500">
          <Link href={GHOST_SITES.main.url} className="hover:text-zinc-300 transition-colors">Home</Link>
          <Link href={GHOST_SITES.docs.url} className="hover:text-zinc-300 transition-colors">Docs</Link>
          <Link href={GHOST_SITES.explorer.url} className="hover:text-zinc-300 transition-colors">GhostScan</Link>
          <Link href={GHOST_SITES.bridge.url} className="hover:text-zinc-300 transition-colors">Bridge</Link>
          <Link href={GHOST_SITES.rpc.url} className="hover:text-zinc-300 transition-colors">RPC</Link>
        </nav>
      </div>
    </footer>
  );
}
