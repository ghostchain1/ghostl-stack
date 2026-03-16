"use client";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const RISK_SCORES = [
  { subsystem: "GSX", type: "Market Risk",    score: 2400, label: "Low",    color: "#10b981" },
  { subsystem: "GSX", type: "Liquidity Risk", score: 1800, label: "Low",    color: "#10b981" },
  { subsystem: "GSN", type: "Counterparty",   score: 1200, label: "Low",    color: "#10b981" },
  { subsystem: "GCM", type: "Credit Risk",    score: 1500, label: "Low",    color: "#10b981" },
  { subsystem: "GSE", type: "Macro Risk",     score: 3800, label: "Medium", color: "#f59e0b" },
  { subsystem: "GWF", type: "Systemic Risk",  score: 4200, label: "Medium", color: "#f59e0b" },
  { subsystem: "GSR", type: "Reserve Risk",   score: 900,  label: "Low",    color: "#10b981" },
  { subsystem: "GSI", type: "Identity Fraud", score: 2100, label: "Low",    color: "#10b981" },
];

const ALERTS = [
  { id: 1, type: "MACRO_STRESS",    severity: "medium", subsystem: "GWF", msg: "Elevated macro stress indicators in EU sovereign debt markets. Monitoring for contagion.", ts: "2026-03-13 16:45 UTC" },
  { id: 2, type: "VOLATILITY_RISE", severity: "low",    subsystem: "GSX", msg: "30-day realised volatility up 18% across commodity order books.", ts: "2026-03-13 12:00 UTC" },
];

const SEV_COLOR: Record<string,string> = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#64748b" };

export default function RiskPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#0a0508)" }}>
          <div className="container">
            <a href="/gsa" style={{ color: "#dc2626", fontSize: "0.85rem", textDecoration: "none" }}>← GSA</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Risk <span style={{ color: "#dc2626" }}>Intelligence</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>GhostBrain AI risk scoring across market, credit, liquidity, and systemic risk dimensions. Scores are in basis points (0 = no risk, 10000 = maximum risk).</p>
          </div>
        </section>

        <section style={{ padding: "40px 24px" }}>
          <div className="container">
            <h2 style={{ fontWeight: 700, fontSize: "1.2rem", marginBottom: 20 }}>Risk Scores by Subsystem</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
              {RISK_SCORES.map((r, i) => (
                <div key={i} className="card" style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ color: "#dc2626", fontWeight: 800 }}>{r.subsystem}</span>
                    <span style={{ background: r.color + "22", color: r.color, padding: "2px 8px", borderRadius: 8, fontSize: "0.72rem", fontWeight: 700 }}>{r.label}</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginBottom: 10 }}>{r.type}</div>
                  <div style={{ height: 6, background: "#1e293b", borderRadius: 3, marginBottom: 6 }}>
                    <div style={{ height: "100%", width: `${r.score / 100}%`, background: r.color, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: r.color }}>{(r.score / 100).toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "40px 24px 80px" }}>
          <div className="container">
            <h2 style={{ fontWeight: 700, fontSize: "1.2rem", marginBottom: 20 }}>Risk Alerts</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {ALERTS.map((a) => (
                <div key={a.id} className="card" style={{ borderLeft: `3px solid ${SEV_COLOR[a.severity]}`, padding: "14px 20px" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ background: (SEV_COLOR[a.severity]) + "22", color: SEV_COLOR[a.severity], padding: "2px 10px", borderRadius: 10, fontSize: "0.75rem", fontWeight: 800 }}>{a.severity.toUpperCase()}</span>
                    <span style={{ color: "#dc2626", fontWeight: 700, fontSize: "0.85rem" }}>{a.type}</span>
                    <span style={{ color: "#8b5cf6", fontSize: "0.8rem" }}>{a.subsystem}</span>
                    <span style={{ color: "#64748b", fontSize: "0.75rem", marginLeft: "auto" }}>{a.ts}</span>
                  </div>
                  <p style={{ margin: 0, color: "#cbd5e1", fontSize: "0.9rem" }}>{a.msg}</p>
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
