import { Ghostnavbar } from "@ghostchain/ui-components";
import { GhostFooter } from "@ghostchain/ui-components";
import { ChainBadge } from "@ghostchain/ui-components";
import Link from "next/link";

const NAV = [
  { label: "Send", href: "/send" },
  { label: "Receive", href: "/receive" },
  { label: "History", href: "/history" },
  { label: "Settings", href: "/settings" },
];

const LAYER_RPCS = [
  { chain: "L1" as const, label: "GhostChain L1", chainId: "14000101", symbol: "GST", balance: "—" },
  { chain: "L2" as const, label: "GhostL2",       chainId: "901",       symbol: "GST", balance: "—" },
  { chain: "L3" as const, label: "GhostL3",       chainId: "903",       symbol: "GST", balance: "—" },
];

export default function WalletPage() {
  return (
    <>
      <Ghostnavbar appName="GhostWallet" nav={NAV} />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-12 w-full">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-zinc-100 mb-1">GhostWallet</h1>
          <p className="text-zinc-400 text-sm">Multi-chain GST wallet for GhostChain L1, L2, and L3.</p>
        </div>

        {/* Portfolio summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {LAYER_RPCS.map(({ chain, label, chainId, symbol, balance }) => (
            <div key={chain} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <ChainBadge chain={chain} />
                <span className="text-xs text-zinc-500">Chain {chainId}</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-zinc-100">{balance}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{symbol} balance</div>
              </div>
              <div className="text-xs text-zinc-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 mb-10">
          <Link
            href="/send"
            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Send GST →
          </Link>
          <Link
            href="/receive"
            className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl text-sm font-medium border border-zinc-700 transition-colors"
          >
            Receive
          </Link>
          <Link
            href="https://bridge.ghostchain.cloud"
            className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl text-sm font-medium border border-zinc-700 transition-colors"
          >
            Bridge
          </Link>
        </div>

        {/* Notice */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          Connect your GhostWallet to view real-time GST balances across all three layers. 
          All transactions use the <span className="text-violet-400 font-medium">ghost_</span> RPC namespace.
        </div>
      </main>

      <GhostFooter />
    </>
  );
}
