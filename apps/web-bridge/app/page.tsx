import { headers } from "next/headers";
import { ChainBadge, GhostFooter, Ghostnavbar } from "@ghostchain/ui-components";

const NAV = [
  { label: "Bridge", href: "/" },
  { label: "History", href: "/history" },
  { label: "Status", href: "/status" },
];

const ROUTES = [
  { from: "L3" as const, to: "L2" as const, via: "L2L3Bridge", addr: "0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2" },
  { from: "L2" as const, to: "L1" as const, via: "L1 Rollup", addr: "0xad32D5C2Da9f4159C4cc98686C005852b3905355" },
  { from: "L1" as const, to: "L2" as const, via: "L1 Rollup", addr: "0xad32D5C2Da9f4159C4cc98686C005852b3905355" },
  { from: "L2" as const, to: "L3" as const, via: "L2 Rollup", addr: "0x130A46b6E41DB6E1e18fb9c759F223c459190e90" },
];

const domainVariants = {
  default: {
    appName: "Bridge",
    title: "GhostChain Bridge",
    subtitle: "Transfer GST between GhostChain L1, GhostL2, and GhostL3 while respecting the canonical routing law.",
    banner: "Routing law: GhostL3 → GhostL2 → GhostChain L1. L3 never settles directly to L1.",
  },
  "ghostchainlink.com": {
    appName: "GhostChain Link",
    title: "GhostChain Link",
    subtitle: "The branded link layer for canonical GST routing, bridge proofs, and cross-layer connectivity.",
    banner: "ghostchainlink.com lands on the canonical bridge surface and keeps all transfers inside the GhostChain routing law.",
  },
  "ghostschain.com": {
    appName: "GhostChain Link",
    title: "GhostChain Link",
    subtitle: "Defensive alias for the GhostChain bridge and routing surface.",
    banner: "ghostschain.com resolves to the same canonical bridge workflows and keeps GST routing on the branded surface.",
  },
} as const;

function normalizeHost(value: string | null) {
  return (value || "").split(":")[0].replace(/^www\./, "").toLowerCase();
}

async function getVariant() {
  const requestHeaders = await headers();
  const host = normalizeHost(requestHeaders.get("x-forwarded-host") || requestHeaders.get("host"));
  return domainVariants[host as keyof typeof domainVariants] || domainVariants.default;
}

export default async function BridgePage() {
  const variant = await getVariant();

  return (
    <>
      <Ghostnavbar appName={variant.appName} nav={NAV} />

      <main className="flex-1 max-w-2xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm text-violet-200 mb-8">
          {variant.banner}
        </div>

        <div className="mb-10">
          <h1 className="text-3xl font-bold text-zinc-100 mb-1">{variant.title}</h1>
          <p className="text-zinc-400 text-sm">{variant.subtitle}</p>
        </div>

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
              Route GST →
            </button>
          </div>
        </div>

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
          <div className="mt-4 text-xs text-zinc-500">
            L3 withdrawals must transit GhostL2 before GhostChain L1 settlement. No GhostL3 path bypasses the canonical routing law.
          </div>
        </div>
      </main>

      <GhostFooter />
    </>
  );
}
