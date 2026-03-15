import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ecosystem | GhostChain",
  description: "Explore the full GhostStack ecosystem — GhostChain L1, GhostL2, GhostL3 apps, GhostBrain AI, and the complete sovereign AI infrastructure.",
};

const LAYERS = [
  {
    id: "L3",
    label: "L3 — Application Layer",
    color: "#C0C0C0",
    glow: "rgba(192,192,192,0.3)",
    border: "rgba(192,192,192,0.2)",
    description: "Purpose-built appchains and ZK rollups for DeFi, NFT markets, gaming, AI agents, and enterprise applications.",
    items: [
      { name: "GhostFi",      desc: "Sovereign AMM, lending, and yield" },
      { name: "GhostNFT",     desc: "AI-curated NFT marketplace" },
      { name: "GhostPay",     desc: "Instant settlement payments" },
      { name: "GhostID",      desc: "Decentralized identity & KYC" },
      { name: "GhostGames",   desc: "Fully on-chain game engine" },
      { name: "GhostAgent",   desc: "Autonomous AI agent runtime" },
    ],
  },
  {
    id: "L2",
    label: "L2 — Exchange Layer",
    color: "#FFAA00",
    glow: "rgba(255,170,0,0.4)",
    border: "rgba(255,170,0,0.25)",
    description: "High-throughput EVM-compatible rollup handling token bridging, DEX routing, and cross-chain liquidity between all L3 chains.",
    items: [
      { name: "Ghost DEX",        desc: "Cross-chain swap aggregator" },
      { name: "Ghost Bridge",     desc: "L1↔L2↔L3 asset bridge" },
      { name: "Liquidity Pools",  desc: "Unified LP with auto-rebalancing" },
      { name: "Order Book",       desc: "On-chain limit order engine" },
    ],
  },
  {
    id: "L1",
    label: "L1 — GhostChain",
    color: "#FFD700",
    glow: "rgba(255,215,0,0.6)",
    border: "rgba(255,215,0,0.35)",
    description: "The sovereign AI blockchain — IBFT2 PoA consensus with 128 validators, sub-second finality, GhostVM, and GhostBrain AI governance.",
    items: [
      { name: "GhostVM",      desc: "EVM-compatible + AI opcodes" },
      { name: "IBFT2",        desc: "128-validator PoA finality" },
      { name: "GhostBrain",   desc: "Autonomous AI governance engine" },
      { name: "GST Token",    desc: "Native currency & staking" },
    ],
  },
];

const INTEGRATIONS = [
  { name: "Ethereum", logo: "⟠", desc: "Canonical bridge + EVM compatibility" },
  { name: "Bitcoin",  logo: "₿", desc: "BTC wrapped asset + payment rail" },
  { name: "IPFS",     logo: "🌐", desc: "Decentralized content addressing" },
  { name: "Chainlink", logo: "🔗", desc: "Oracle data feeds for DeFi protocols" },
  { name: "The Graph", logo: "◈", desc: "Subgraph-based on-chain indexing" },
  { name: "Cosmos IBC", logo: "∞", desc: "Interchain messaging and token transfers" },
];

export default function EcosystemPage() {
  return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh", padding: "4rem 2rem", color: "#e2e8f0" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "5rem" }}>
          <p style={{ color: "#FFAA00", fontSize: "0.75rem", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Architecture</p>
          <h1 style={{
            fontFamily: "'Orbitron','Inter',sans-serif",
            fontSize: "clamp(2rem, 5vw, 3rem)",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: "#FFD700",
            textShadow: "0 0 24px rgba(255,215,0,0.5)",
            marginBottom: "1rem",
          }}>
            GhostStack Ecosystem
          </h1>
          <p style={{ color: "#94a3b8", maxWidth: "520px", margin: "0 auto", lineHeight: 1.7 }}>
            A vertically integrated sovereign blockchain — from L1 consensus to L3 dApps,
            powered by GhostBrain AI and unified by GST.
          </p>
        </div>

        {/* Layer diagrams */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "5rem" }}>
          {LAYERS.map((layer, li) => (
            <div
              key={layer.id}
              style={{
                border: `1px solid ${layer.border}`,
                borderRadius: "14px",
                padding: "1.75rem",
                background: `radial-gradient(ellipse at 50% 0%, ${layer.glow.replace("0.", "0.05")}, transparent 70%)`,
                position: "relative",
                overflow: "hidden",
                margin: li === 1 ? "0 2rem" : li === 2 ? "0 4rem" : "0",
              }}
            >
              {/* Layer label */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.6rem" }}>
                <span style={{
                  fontFamily: "'Orbitron','Inter',sans-serif",
                  color: layer.color,
                  fontWeight: 900,
                  fontSize: "0.75rem",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                }}>{layer.label}</span>
              </div>
              <p style={{ color: "#64748b", fontSize: "0.82rem", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                {layer.description}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
                {layer.items.map(item => (
                  <div key={item.name} style={{
                    background: `${layer.glow.replace("0.", "0.08")}`,
                    border: `1px solid ${layer.border}`,
                    borderRadius: "8px",
                    padding: "0.5rem 0.85rem",
                  }}>
                    <span style={{ color: layer.color, fontWeight: 700, fontSize: "0.8rem" }}>{item.name}</span>
                    <span style={{ color: "#64748b", fontSize: "0.72rem", marginLeft: "0.5rem" }}>{item.desc}</span>
                  </div>
                ))}
              </div>

              {/* Connector arrow (not on the last layer) */}
              {li < LAYERS.length - 1 && (
                <div style={{
                  position: "absolute",
                  bottom: "-1.75rem",
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 10,
                  color: "#FFD700",
                  fontSize: "1.5rem",
                  textShadow: "0 0 8px rgba(255,215,0,0.6)",
                }}>↓</div>
              )}
            </div>
          ))}
        </div>

        {/* stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "5rem" }}>
          {[
            { v: "< 1s",   l: "Finality" },
            { v: "10,000+", l: "TPS (L2)" },
            { v: "128",    l: "Validators" },
            { v: "3",      l: "Layers" },
          ].map(s => (
            <div key={s.l} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,215,0,0.15)",
              borderRadius: "10px",
              padding: "1.25rem",
              textAlign: "center",
            }}>
              <div style={{ color: "#FFD700", fontSize: "1.75rem", fontWeight: 900, fontFamily: "'Orbitron','Inter',sans-serif" }}>{s.v}</div>
              <div style={{ color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "0.35rem" }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Integrations */}
        <h2 style={{ color: "#FFD700", fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "1rem", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1.5rem" }}>
          Integrations & Partners
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          {INTEGRATIONS.map(i => (
            <div key={i.name} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,215,0,0.12)",
              borderRadius: "10px",
              padding: "1.1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}>
              <span style={{ fontSize: "1.5rem" }}>{i.logo}</span>
              <div>
                <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: "0.85rem" }}>{i.name}</div>
                <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.2rem" }}>{i.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
