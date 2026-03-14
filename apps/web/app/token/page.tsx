import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ghost Token (GST) — Tokenomics | GhostChain",
  description: "GST is the native currency of GhostChain — powering validator rewards, governance, and the sovereign AI economy.",
};

const DISTRIBUTION = [
  { label: "Community & Staking",   pct: 45, color: "#FFD700" },
  { label: "Treasury & Ecosystem",  pct: 30, color: "#FFAA00" },
  { label: "Validator Rewards",     pct: 25, color: "#C0C0C0" },
];

export default function TokenPage() {
  return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh", padding: "4rem 2rem", color: "#e2e8f0" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "5rem" }}>
          <div style={{ color: "#FFAA00", fontSize: "0.8rem", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Native Currency</div>
          <h1 style={{
            fontFamily: "'Orbitron','Inter',sans-serif",
            fontSize: "clamp(2rem, 5vw, 3.5rem)",
            fontWeight: 900,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#FFD700",
            textShadow: "0 0 24px rgba(255,215,0,0.6)",
          }}>Ghost Token</h1>
          <p style={{ color: "#C0C0C0", marginTop: "1rem", fontSize: "1.05rem", letterSpacing: "0.04em" }}>
            Ticker: <strong style={{ color: "#FFD700" }}>GST</strong>
          </p>
          <p style={{ color: "#94a3b8", maxWidth: "520px", margin: "1rem auto 0", lineHeight: 1.7 }}>
            GST powers every transaction, governance vote, and AI computation fee
            across GhostChain, GhostL2, GhostL3, and all GhostStack applications.
          </p>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.25rem", marginBottom: "5rem" }}>
          {[
            { label: "Total Supply",   value: "1B GST" },
            { label: "Burn Rate",      value: "2% / tx" },
            { label: "Max Inflation",  value: "3% / yr" },
            { label: "Chains",         value: "L1 · L2 · L3" },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,215,0,0.18)",
              borderRadius: "12px",
              padding: "1.5rem",
              textAlign: "center",
            }}>
              <div style={{ color: "#FFD700", fontSize: "1.6rem", fontWeight: 800, fontFamily: "'Orbitron','Inter',sans-serif" }}>{s.value}</div>
              <div style={{ color: "#64748b", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "0.4rem" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Distribution */}
        <h2 style={{ color: "#FFD700", fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "1.2rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1.5rem" }}>
          Token Distribution
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {DISTRIBUTION.map(d => (
            <div key={d.label}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ color: "#C0C0C0", fontSize: "0.9rem" }}>{d.label}</span>
                <span style={{ color: d.color, fontWeight: 700 }}>{d.pct}%</span>
              </div>
              <div style={{ height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "999px", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${d.pct}%`,
                  background: `linear-gradient(90deg, ${d.color}, ${d.color}88)`,
                  borderRadius: "999px",
                  boxShadow: `0 0 8px ${d.color}60`,
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* Use cases */}
        <h2 style={{ color: "#FFD700", fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "1.2rem", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "4rem", marginBottom: "1.5rem" }}>
          GST Use Cases
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
          {[
            { icon: "⛽", t: "Transaction Fees",    d: "All on-chain operations cost GST. 2% is burned, deflationary by design." },
            { icon: "🗳️", t: "Governance",          d: "Vote on protocol upgrades, treasury allocations, and AI advisory proposals." },
            { icon: "🏦", t: "Validator Staking",    d: "Validators bond GST to secure GhostChain and earn block rewards." },
            { icon: "🔗", t: "Bridge Collateral",    d: "Cross-chain liquidity via GhostL2 uses GST as the base collateral asset." },
            { icon: "🤖", t: "AI Compute Credits",   d: "GhostBrain AI operations — monitoring, prediction, healing — are priced in GST." },
            { icon: "💎", t: "NFT Marketplace",      d: "GhostNFT listings, royalties, and auctions settle in GST." },
          ].map(u => (
            <div key={u.t} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,215,0,0.15)",
              borderRadius: "10px",
              padding: "1.25rem",
            }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{u.icon}</div>
              <h3 style={{ color: "#FFD700", fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.4rem" }}>{u.t}</h3>
              <p style={{ color: "#64748b", fontSize: "0.82rem", lineHeight: 1.6 }}>{u.d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
