import Link from "next/link";
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
          <Link href="https://ghostchain.cloud" className="hover:text-zinc-300 transition-colors">Home</Link>
          <Link href="https://docs.ghostchain.online" className="hover:text-zinc-300 transition-colors">Docs</Link>
          <Link href="https://explorer.ghostchain.world" className="hover:text-zinc-300 transition-colors">GhostScan</Link>
          <Link href="https://bridge.ghostchain.world" className="hover:text-zinc-300 transition-colors">Bridge</Link>
          <Link href="https://rpc.ghostchain.cloud" className="hover:text-zinc-300 transition-colors">RPC</Link>
        </nav>
      </div>
    </footer>
  );
}
