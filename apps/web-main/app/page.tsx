import { Ghostnavbar } from "@ghostchain/ui-components";
import { GhostFooter } from "@ghostchain/ui-components";
import Link from "next/link";

const CHAIN_STATS = [
  { label: "Chain ID (L1)", value: "14000101" },
  { label: "Chain ID (L2)", value: "901" },
  { label: "Chain ID (L3)", value: "903" },
  { label: "Gas Token", value: "GST" },
];

const ECOSYSTEM = [
  { href: "https://explorer.ghostchain.world", label: "GhostScan", desc: "Block explorer for L1 / L2 / L3" },
  { href: "https://wallet.ghostchain.world",   label: "GhostWallet", desc: "Multi-chain web wallet" },
  { href: "https://bridge.ghostchain.world",   label: "Bridge", desc: "Cross-chain asset transfers" },
  { href: "https://ai.ghostchain.cloud",       label: "GhostBrain", desc: "AI-powered network intelligence" },
  { href: "https://rpc.ghostchain.cloud",      label: "RPC Portal", desc: "Developer API & RPC keys" },
  { href: "https://docs.ghostchain.online",    label: "Docs", desc: "Developer documentation" },
];

const NAV = [
  { label: "Ecosystem", href: "#ecosystem" },
  { label: "Tokenomics", href: "#tokenomics" },
  { label: "Governance", href: "#governance" },
  { label: "Developers", href: "https://docs.ghostchain.online" },
];

export default function HomePage() {
  return (
    <>
      <Ghostnavbar appName="" nav={NAV} />

      {/* Hero */}
      <section className="relative flex-1 flex flex-col items-center justify-center text-center px-4 py-32 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(124,58,237,0.18),transparent)] pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-full bg-violet-950 border border-violet-800 text-violet-300 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            GhostChain Mainnet — Live
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight mb-6">
            The Sovereign<br />
            <span className="text-violet-400">AI-Powered</span> Blockchain
          </h1>
          <p className="text-zinc-400 text-lg leading-relaxed mb-10 max-w-xl mx-auto">
            GhostChain is a fully custom Layer-1 blockchain with integrated L2 and L3 scaling, 
            AI-native governance, and GST as the native gas token.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="https://docs.ghostchain.online" className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium text-sm transition-colors shadow-violet-900/40 shadow-lg">
              Get Started →
            </Link>
            <Link href="https://explorer.ghostchain.world" className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-medium text-sm transition-colors border border-zinc-700">
              GhostScan Explorer
            </Link>
          </div>
        </div>
      </section>

      {/* Chain stats */}
      <section className="border-t border-zinc-800 bg-zinc-900/50">
        <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {CHAIN_STATS.map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold text-violet-400 font-mono">{value}</div>
              <div className="text-xs text-zinc-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Ecosystem */}
      <section id="ecosystem" className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-3">Ecosystem</h2>
          <p className="text-zinc-400 text-center mb-12">Everything built into GhostChain — no third-party dependencies.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ECOSYSTEM.map(({ href, label, desc }) => (
              <Link
                key={href}
                href={href}
                className="group block p-5 bg-zinc-900 border border-zinc-800 hover:border-violet-700 rounded-2xl transition-all"
              >
                <div className="text-sm font-semibold text-zinc-100 group-hover:text-violet-400 mb-1 transition-colors">{label}</div>
                <div className="text-xs text-zinc-500">{desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Tokenomics */}
      <section id="tokenomics" className="py-24 px-4 border-t border-zinc-800 bg-zinc-900/30">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-3">Tokenomics</h2>
          <p className="text-zinc-400 mb-10">GST powers every transaction across L1, L2, and L3.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl">
              <div className="text-xs text-zinc-500 mb-1">Gas Token</div>
              <div className="text-2xl font-bold text-violet-400">GST</div>
              <div className="text-xs text-zinc-600 mt-1">Sovereign — no ETH dependency</div>
            </div>
            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl">
              <div className="text-xs text-zinc-500 mb-1">Governance</div>
              <div className="text-2xl font-bold text-violet-400">DAO</div>
              <div className="text-xs text-zinc-600 mt-1">GhostChainGovernor on L1</div>
            </div>
            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl">
              <div className="text-xs text-zinc-500 mb-1">Treasury</div>
              <div className="text-2xl font-bold text-violet-400">STE</div>
              <div className="text-xs text-zinc-600 mt-1">SovereignTreasuryEngine</div>
            </div>
          </div>
        </div>
      </section>

      {/* Governance */}
      <section id="governance" className="py-24 px-4 border-t border-zinc-800">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-3">AI-Assisted Governance</h2>
          <p className="text-zinc-400 mb-8">
            GhostBrain drafts proposals. Humans ratify them. All on-chain governance uses
            GhostChainGovernor — sovereignty locked, no external dependencies.
          </p>
          <Link href="https://docs.ghostchain.online/governance" className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-medium text-sm transition-colors border border-zinc-700">
            Read the GhostConstitution →
          </Link>
        </div>
      </section>

      <GhostFooter />
    </>
  );
}
