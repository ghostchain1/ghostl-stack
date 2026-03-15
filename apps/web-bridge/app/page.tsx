import { Ghostnavbar } from "@ghostchain/ui-components";
import { GhostFooter } from "@ghostchain/ui-components";
import { ChainBadge } from "@ghostchain/ui-components";

const NAV = [
  { label: "Bridge",  href: "/" },
  { label: "History", href: "/history" },
  { label: "Status",  href: "/status" },
];

const ROUTES = [
  { from: "L3" as const, to: "L2" as const, via: "L2L3Bridge", addr: "0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2" },
  { from: "L2" as const, to: "L1" as const, via: "L1 Rollup",  addr: "0xad32D5C2Da9f4159C4cc98686C005852b3905355" },
  { from: "L1" as const, to: "L2" as const, via: "L1 Rollup",  addr: "0xad32D5C2Da9f4159C4cc98686C005852b3905355" },
  { from: "L2" as const, to: "L3" as const, via: "L2 Rollup",  addr: "0x130A46b6E41DB6E1e18fb9c759F223c459190e90" },
];

export default function BridgePage() {
  return (
    <>
      <Ghostnavbar appName="Bridge" nav={NAV} />

      <main className="flex-1 max-w-2xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-zinc-100 mb-1">GhostChain Bridge</h1>
          <p className="text-zinc-400 text-sm">Transfer GST between L1, L2, and L3. All routes transit through GhostChain L1.</p>
        </div>

        {/* Bridge form */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 mb-8">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">From</label>
                <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5 border border-zinc-700">
                  <ChainBadge chain="L2" showLabel={false} />
                  <span className="text-sm text-zinc-200">GhostL2</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">To</label>
                <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5 border border-zinc-700">
                  <ChainBadge chain="L1" showLabel={false} />
                  <span className="text-sm text-zinc-200">GhostChain L1</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Amount (GST)</label>
              <input
                type="number"
                placeholder="0.0"
                min="0"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-600"
              />
            </div>

            <button className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
              Bridge GST →
            </button>
          </div>
        </div>

        {/* Routing info */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold text-zinc-100 mb-4">Canonical Bridge Contracts</h2>
          <div className="flex flex-col gap-3">
            {ROUTES.map(({ from, to, via, addr }) => (
              <div key={`${from}-${to}`} className="flex items-center gap-2 text-xs">
                <ChainBadge chain={from} showLabel={false} />
                <span className="text-zinc-500">→</span>
                <ChainBadge chain={to} showLabel={false} />
                <span className="text-zinc-400 flex-1 ml-1">{via}</span>
                <span className="text-zinc-600 font-mono">{addr.slice(0, 10)}…</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <GhostFooter />
    </>
  );
}
