// GhostStack — Docs Home
import Link from "next/link";

const SECTIONS = [
  { href: "/docs/whitepaper",      icon: "📄", title: "Whitepaper v2",         desc: "Technical whitepaper — GhostChain architecture, tokenomics, governance, and security model" },
  { href: "/docs/getting-started", icon: "🚀", title: "Quick Start",           desc: "Set up a local devnet and connect to GhostChain L1, L2, and L3 in minutes" },
  { href: "/docs/architecture",    icon: "🏗", title: "System Architecture",   desc: "Deep dive into GhostChain L1 (Cosmos SDK + EVM), GhostL2/L3 (OP Stack), GhostBrain AI, and LGE" },
  { href: "/docs/api",             icon: "🔌", title: "API Reference",         desc: "REST API docs for all GhostStack services — chain, bridge, governance, staking, GNS, and AI" },
  { href: "/docs/contracts",       icon: "📋", title: "Smart Contracts",       desc: "Solidity contract docs — GhostChainGovernor, SovereignTreasury, bridges, LGE, GhostBrand" },
  { href: "/docs/sdk",             icon: "📦", title: "ghost-sdk-core",        desc: "Native TypeScript SDK with no ethers dependency — preferred for all new integrations" },
  { href: "/docs/deployment",      icon: "🚢", title: "Deployment Guide",       desc: "Docker Compose devnet, kubernetes helm charts, preflight checks and env setup" },
  { href: "/docs/governance-ops",  icon: "🏛", title: "Governance Operations", desc: "How AI proposals are drafted, validated, and ratified via governance quorum" },
];

export default function DocsHome() {
  return (
    <div className="wp-body" style={{ maxWidth: "900px" }}>
      <div className="wp-hero">
        <div className="wp-title">GhostStack Documentation</div>
        <div className="wp-subtitle">Everything you need to build on, run, and govern GhostChain</div>
        <div className="wp-meta">
          <span>📅 Updated March 2026</span>
          <span>⛓ GhostChain L1/L2/L3</span>
          <span>🤖 GhostBrain AI</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
        {SECTIONS.map(s => (
          <Link key={s.href} href={s.href} style={{ textDecoration: "none" }}>
            <div className="action-card" style={{ height: "100%", cursor: "pointer" }}>
              <div style={{ fontSize: "1.8rem" }}>{s.icon}</div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{s.title}</div>
              <div className="action-card-desc">{s.desc}</div>
              <div style={{ fontSize: "0.72rem", color: "var(--cyan)", marginTop: "auto" }}>Read →</div>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: "2.5rem", padding: "1.25rem", background: "rgba(124,58,237,0.07)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "10px" }}>
        <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>🏗 Architecture at a Glance</div>
        <div className="wp-code">{`GhostChain L1 (chain_id=14000101, RPC :18545)
  └── GhostL2   (chain_id=901, RPC :29545) — OP Stack, settlement to L1
        └── GhostL3 (chain_id=903, RPC :39545) — OP Stack, settlement to L2

Gas token:    GST (never ETH/WETH)
AI layer:     GhostBrain Core (port 7900)
Naming:       GNS — Ghost Name System
DEX:          GhostXchange
Explorer:     GhostScan
Wallet:       GhostWallet
Governance:   GhostChainGovernor (custom, not OZ)
Contracts:    Solidity 0.8.24 · via_ir=true · runs=200 · OZ v5.6.1`}</div>
      </div>
    </div>
  );
}
