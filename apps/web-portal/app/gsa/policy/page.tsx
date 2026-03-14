"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const CHANGES = [
  { id: 1, agent: "ai.policy-engine", subsystem: "GSX", param: "reserveRatio",  from: "10%",   to: "12%",     conf: 9810, status: "pending",  rationale: "Reserve stress-test shows 340% coverage gap under tail-risk scenario. Increasing ratio provides additional system stability." },
  { id: 2, agent: "ai.policy-engine", subsystem: "GCM", param: "interestRate",  from: "4.50%", to: "4.25%",   conf: 9650, status: "pending",  rationale: "Inflation trajectory -0.3% MoM for 3 consecutive months. Model recommends 25bps reduction to stimulate credit issuance." },
  { id: 3, agent: "ai.policy-engine", subsystem: "GSN", param: "batchSize",     from: "500",   to: "750",     conf: 9920, status: "approved", rationale: "Settlement queue depth averaging 680 transactions. Increasing batch size reduces finality latency by ~42%." },
  { id: 4, agent: "ai.policy-engine", subsystem: "GSE", param: "tariffBasePts", from: "150",   to: "120",     conf: 9540, status: "rejected", rationale: "Trade volume sensitivity analysis shows 5.2% reduction per 10bps tariff rise. Reduction recommended to stimulate trade." },
];

const STATUS_COLOR: Record<string,string> = { pending: "#f59e0b", approved: "#10b981", rejected: "#ef4444" };

export default function PolicyPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#0a0508)" }}>
          <div className="container">
            <a href="/gsa" style={{ color: "#dc2626", fontSize: "0.85rem", textDecoration: "none" }}>← GSA</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Autonomous <span style={{ color: "#dc2626" }}>Policy</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>GhostBrain autonomously proposes parameter changes across GhostStack subsystems with AI-generated rationale and confidence scores. All changes require governance approval before execution.</p>
          </div>
        </section>

        <section style={{ padding: "40px 24px 80px" }}>
          <div className="container">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {CHANGES.map((c) => (
                <div key={c.id} className="card" style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ background: "#dc262622", color: "#dc2626", padding: "2px 10px", borderRadius: 10, fontSize: "0.75rem", fontWeight: 700 }}>{c.subsystem}</span>
                      <span style={{ fontWeight: 700, fontSize: "1rem" }}>{c.param}</span>
                      <span style={{ color: "#64748b" }}>{c.from} → <span style={{ color: "#cbd5e1", fontWeight: 700 }}>{c.to}</span></span>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ color: "#10b981", fontSize: "0.8rem" }}>conf {(parseInt(String(c.conf)) / 100).toFixed(1)}%</span>
                      <span style={{ background: (STATUS_COLOR[c.status]??"#64748b") + "22", color: STATUS_COLOR[c.status]??"#64748b", padding: "2px 10px", borderRadius: 10, fontSize: "0.75rem", fontWeight: 700 }}>
                        {c.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div style={{ color: "#64748b", fontSize: "0.78rem", marginBottom: 8 }}>Agent: <span style={{ color: "#dc2626" }}>{c.agent}</span></div>
                  <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.6 }}>{c.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
