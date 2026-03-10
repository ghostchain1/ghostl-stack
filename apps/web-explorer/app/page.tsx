import { Ghostnavbar } from "@ghostchain/ui-components";
import { GhostFooter } from "@ghostchain/ui-components";
import { ChainBadge } from "@ghostchain/ui-components";

const NAV = [
  { label: "Blocks",     href: "/blocks" },
  { label: "Txns",       href: "/txns" },
  { label: "Tokens",     href: "/tokens" },
  { label: "Validators", href: "/validators" },
  { label: "Governance", href: "/governance" },
];

const CHAINS = [
  { chain: "L1" as const, chainId: "14000101", rpc: "ghostchain.world:18545",  label: "GhostChain L1" },
  { chain: "L2" as const, chainId: "901",       rpc: "ghostchain.world:29545",  label: "GhostL2" },
  { chain: "L3" as const, chainId: "903",       rpc: "ghostchain.world:39545",  label: "GhostL3" },
];

export default function ExplorerPage() {
  return (
    <>
      <Ghostnavbar appName="GhostScan" nav={NAV} />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-zinc-100 mb-1">GhostScan</h1>
          <p className="text-zinc-400 text-sm">The official block explorer for GhostChain L1, GhostL2, and GhostL3.</p>
        </div>

        {/* Search */}
        <div className="mb-10">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search by address, tx hash, block number…"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-600"
            />
            <button className="px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
              Search
            </button>
          </div>
        </div>

        {/* Chain cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {CHAINS.map(({ chain, chainId, rpc, label }) => (
            <div key={chain} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <ChainBadge chain={chain} />
                <span className="text-xs text-zinc-500 font-mono">ID {chainId}</span>
              </div>
              <div>
                <div className="text-lg font-bold text-zinc-100">{label}</div>
                <div className="text-xs text-zinc-500 font-mono mt-1">{rpc}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                <div>Latest block<div className="text-zinc-300 font-medium mt-0.5">—</div></div>
                <div>Avg block time<div className="text-zinc-300 font-medium mt-0.5">—</div></div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent blocks placeholder */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-100 text-sm">Recent Blocks</h2>
            <ChainBadge chain="L1" showLabel={false} />
          </div>
          <div className="p-8 text-center text-zinc-500 text-sm">
            Connect to a GhostChain RPC endpoint to view live block data.
          </div>
        </div>
      </main>

      <GhostFooter />
    </>
  );
}
