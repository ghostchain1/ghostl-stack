import { GHOST_RPC_ENDPOINTS, GHOST_SITES } from "@ghostchain/config";
import { Ghostnavbar } from "@ghostchain/ui-components";
import { GhostFooter } from "@ghostchain/ui-components";
import { ChainBadge } from "@ghostchain/ui-components";

const NAV = [
  { label: "Endpoints", href: "/" },
  { label: "API Keys",  href: "/keys" },
  { label: "Usage",     href: "/usage" },
  { label: "Docs",      href: GHOST_SITES.docs.url },
];

const ENDPOINTS = [
  { chain: "L1" as const, url: GHOST_RPC_ENDPOINTS.l1.publicUrl, ns: "ghost_", port: GHOST_RPC_ENDPOINTS.l1.port },
  { chain: "L2" as const, url: GHOST_RPC_ENDPOINTS.l2.publicUrl, ns: "ghost_", port: GHOST_RPC_ENDPOINTS.l2.port },
  { chain: "L3" as const, url: GHOST_RPC_ENDPOINTS.l3.publicUrl, ns: "ghost_", port: GHOST_RPC_ENDPOINTS.l3.port },
];

export default function RpcPortalPage() {
  return (
    <>
      <Ghostnavbar appName="RPC Portal" nav={NAV} />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-zinc-100 mb-1">RPC Portal</h1>
          <p className="text-zinc-400 text-sm">
            Managed RPC endpoints for GhostChain L1, L2, and L3 — all using the <span className="text-violet-400 font-mono">ghost_</span> namespace.
          </p>
        </div>

        {/* Endpoint cards */}
        <div className="flex flex-col gap-4 mb-10">
          {ENDPOINTS.map(({ chain, url, ns, port }) => (
            <div key={chain} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <ChainBadge chain={chain} />
              <div className="flex-1">
                <div className="font-mono text-sm text-zinc-200">{url}</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  RPC namespace: <span className="text-violet-400">{ns}</span> · local port: <span className="text-zinc-400">{port}</span>
                </div>
              </div>
              <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-xs font-medium border border-zinc-700 transition-colors whitespace-nowrap">
                Copy URL
              </button>
            </div>
          ))}
        </div>

        {/* Quick start */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-sm font-semibold text-zinc-100 mb-4">Quick Start</h2>
          <pre className="bg-zinc-950 rounded-xl p-4 text-xs text-zinc-300 overflow-x-auto font-mono">
{`// ghost-sdk-core (preferred)
import { createGhostProvider } from "@ghostchain/ghost-sdk-core";

const provider = createGhostProvider({
  rpcUrl: "${GHOST_RPC_ENDPOINTS.l1.publicUrl}",
  chainId: ${GHOST_RPC_ENDPOINTS.l1.chainId},
});

const block = await provider.ghost_getBlockByNumber("latest", false);`}
          </pre>
        </div>
      </main>

      <GhostFooter />
    </>
  );
}
