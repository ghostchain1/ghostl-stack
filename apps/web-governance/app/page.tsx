"use client";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const proposals = [
  { id: "GIP-042", title: "Increase L2 block gas limit to 50M", status: "active", votes: { for: 67, against: 21, abstain: 12 }, ends: "3 days" },
  { id: "GIP-041", title: "Ghost Builder Grants Season 2 — $500K allocation", status: "passed", votes: { for: 88, against: 8, abstain: 4 }, ends: "Passed" },
  { id: "GIP-040", title: "Reduce validator commission cap to 20%", status: "passed", votes: { for: 74, against: 19, abstain: 7 }, ends: "Passed" },
  { id: "GIP-039", title: "Integrate ZK proof verification on L1", status: "failed", votes: { for: 41, against: 53, abstain: 6 }, ends: "Failed" },
];

const statusStyle: Record<string, { bg: string; color: string }> = {
  active: { bg: "#FFD70022", color: "#FFD700" },
  passed: { bg: "#10B98122", color: "#10B981" },
  failed: { bg: "#EF444422", color: "#EF4444" },
};

export default function GovernancePage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Connect Wallet", href: "https://portal.ghostchain.cloud" }} />
      <main>
        {/* Hero */}
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">On-Chain Governance</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,4rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              Shape the <span style={{ color: "#FFAA00" }}>Future</span> of Ghost
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600, margin: "0 auto 40px", fontSize: "1.1rem" }}>
              Every GST holder can propose and vote on protocol upgrades, treasury allocations, and ecosystem policies. AI-assisted proposal drafting available.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/propose" className="btn-primary">Submit Proposal</a>
              <a href="/constitution" className="btn-secondary">Read Constitution</a>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section style={{ padding: "40px 24px", background: "#0A0A0A" }}>
          <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 20, textAlign: "center" }}>
            {[
              { label: "Total Proposals", value: "42" },
              { label: "Pass Rate", value: "76%" },
              { label: "Active Voters", value: "1,420" },
              { label: "GST in Governance", value: "210M" },
              { label: "Avg Quorum", value: "12%" },
            ].map((s) => (
              <div key={s.label} className="card" style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#FFAA00" }}>{s.value}</div>
                <div style={{ color: "#64748b", fontSize: "0.85rem", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Proposals */}
        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 32 }}>Recent Proposals</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {proposals.map((p) => (
                <div key={p.id} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <span style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 600 }}>{p.id}</span>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, ...statusStyle[p.status], padding: "2px 10px", borderRadius: 20, textTransform: "capitalize" }}>{p.status}</span>
                      </div>
                      <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>{p.title}</h3>
                    </div>
                    <div style={{ color: "#64748b", fontSize: "0.85rem" }}>{p.ends}</div>
                  </div>
                  {/* Vote bar */}
                  <div style={{ height: 8, borderRadius: 4, overflow: "hidden", background: "#1e293b", display: "flex" }}>
                    <div style={{ width: p.votes.for + "%", background: "#10B981" }} />
                    <div style={{ width: p.votes.against + "%", background: "#EF4444" }} />
                    <div style={{ width: p.votes.abstain + "%", background: "#64748b" }} />
                  </div>
                  <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: "0.8rem", color: "#64748b" }}>
                    <span style={{ color: "#10B981" }}>For {p.votes.for}%</span>
                    <span style={{ color: "#EF4444" }}>Against {p.votes.against}%</span>
                    <span>Abstain {p.votes.abstain}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Council */}
        <section style={{ padding: "60px 24px", background: "#0A0A0A", textAlign: "center" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 16 }}>Ghost Council</h2>
            <p style={{ color: "#94a3b8", marginBottom: 32, maxWidth: 520, margin: "0 auto 32px" }}>A 7-member elected council with veto power over critical protocol changes. Elections every 6 months.</p>
            <a href="/council" className="btn-secondary">Meet the Council</a>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
