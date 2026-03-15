"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const stats = [
  { label: "GST Market Cap", value: "$—", note: "live data soon" },
  { label: "Total Supply", value: "1,000,000,000", note: "GST" },
  { label: "Circulating", value: "—%", note: "of total supply" },
  { label: "Validator Yield", value: "~12%", note: "APY estimated" },
  { label: "Treasury", value: "$—", note: "on-chain reserve" },
  { label: "Burn Rate", value: "—/day", note: "GST destroyed" },
];

const tokenomics = [
  { label: "Validator Rewards", pct: 30, color: "#FFD700" },
  { label: "Treasury", pct: 20, color: "#FFAA00" },
  { label: "Ecosystem Fund", pct: 20, color: "#A855F7" },
  { label: "Team & Advisors", pct: 15, color: "#06B6D4" },
  { label: "Public Sale", pct: 10, color: "#8B5CF6" },
  { label: "Reserve", pct: 5, color: "#4B5563" },
];

export default function InvestorPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Get GST", href: "https://exchange.ghostchain.cloud" }} />
      <main>
        {/* Hero */}
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">Investor Relations</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,4rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              The <span style={{ color: "#FFD700" }}>GST</span> Token Economy
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600, margin: "0 auto 40px", fontSize: "1.1rem" }}>
              GhostChain Token (GST) powers every layer of the Ghost ecosystem — from validator staking and governance to gas fees and AI compute.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/tokenomics" className="btn-primary">View Tokenomics</a>
              <a href="/reports" className="btn-secondary">Financial Reports</a>
            </div>
          </div>
        </section>

        {/* Stats grid */}
        <section style={{ padding: "60px 24px", background: "#0A0A0A" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 32, textAlign: "center" }}>Live Metrics</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 20 }}>
              {stats.map((s) => (
                <div key={s.label} className="card" style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "2rem", fontWeight: 800, color: "#FFD700" }}>{s.value}</div>
                  <div style={{ fontWeight: 600, marginTop: 8 }}>{s.label}</div>
                  <div style={{ color: "#64748b", fontSize: "0.85rem", marginTop: 4 }}>{s.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tokenomics */}
        <section style={{ padding: "60px 24px", background: "#0A0A0A" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 8, textAlign: "center" }}>Token Allocation</h2>
            <p style={{ color: "#94a3b8", textAlign: "center", marginBottom: 48 }}>1,000,000,000 GST — fixed supply, no inflation</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16, maxWidth: 900, margin: "0 auto" }}>
              {tokenomics.map((t) => (
                <div key={t.label} className="card" style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: t.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.9rem", color: "#000", flexShrink: 0 }}>{t.pct}%</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{t.label}</div>
                    <div style={{ color: "#64748b", fontSize: "0.85rem" }}>{(t.pct * 10_000_000).toLocaleString()} GST</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "80px 24px", textAlign: "center" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 16 }}>Ready to participate?</h2>
            <p style={{ color: "#94a3b8", marginBottom: 32 }}>Stake GST, earn yield, and vote on the future of GhostChain.</p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="https://nodes.ghostchain.cloud" className="btn-primary">Become a Validator</a>
              <a href="https://governance.ghostchain.cloud" className="btn-secondary">Join Governance</a>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
