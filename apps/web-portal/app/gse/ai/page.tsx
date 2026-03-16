"use client";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const ALERTS = [
  { type: "INFLATION", severity: "warning", msg: "Global inflation elevated at 4.2%. Recommend coordinated rate adjustment via GCM monetary policy.",    ts: "2026-03-13 18:00 UTC" },
  { type: "TRADE",     severity: "info",    msg: "Asia-Pacific trade surplus widening. Monitor LITHIUM/USD and WHEAT/USD reserves on GSR.",              ts: "2026-03-13 16:30 UTC" },
  { type: "GDP",       severity: "info",    msg: "EU GDP growth revised upward to +1.8% Q1 2026. Infrastructure bond markets stable.",                   ts: "2026-03-13 14:00 UTC" },
  { type: "LIQUIDITY", severity: "warning", msg: "USD liquidity pool in GCM approaching 80% utilisation. Recommend expansion via monetary policy vote.", ts: "2026-03-13 12:00 UTC" },
];

const SEV_COLOR: Record<string, string> = { warning: "#f59e0b", info: "#10b981", critical: "#ef4444" };

const FORECASTS = [
  { indicator: "US GDP Growth",       q2: "+2.1%", q3: "+2.4%", confidence: "High" },
  { indicator: "EU Inflation",        q2: "3.1%",  q3: "2.7%",  confidence: "Medium" },
  { indicator: "Global Trade Volume", q2: "+3.8%", q3: "+4.2%", confidence: "Medium" },
  { indicator: "Oil Demand",          q2: "+1.2%", q3: "+0.8%", confidence: "High" },
];

export default function EconomicAIPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#050507)" }}>
          <div className="container">
            <a href="/gse" style={{ color: "#10b981", fontSize: "0.85rem", textDecoration: "none" }}>← GSE</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Economic <span style={{ color: "#10b981" }}>Intelligence</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>AI-driven macroeconomic analysis powered by GhostBrain Core. Forecasts, alerts, and policy recommendations in real-time.</p>
          </div>
        </section>

        <section style={{ padding: "40px 24px" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 20 }}>Active Alerts</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {ALERTS.map((a, i) => (
                <div key={i} className="card" style={{ borderLeft: `3px solid ${SEV_COLOR[a.severity]}`, padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ background: SEV_COLOR[a.severity] + "22", color: SEV_COLOR[a.severity], padding: "2px 10px", borderRadius: 10, fontSize: "0.75rem", fontWeight: 700 }}>
                      {a.type}
                    </span>
                    <span style={{ color: "#64748b", fontSize: "0.75rem" }}>{a.ts}</span>
                  </div>
                  <p style={{ margin: 0, color: "#cbd5e1", fontSize: "0.9rem" }}>{a.msg}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "40px 24px 80px" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 20 }}>Q2/Q3 2026 Forecasts</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b" }}>
                    {["Indicator", "Q2 2026", "Q3 2026", "Confidence"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FORECASTS.map((f) => (
                    <tr key={f.indicator} style={{ borderBottom: "1px solid #0f172a" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 600 }}>{f.indicator}</td>
                      <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>{f.q2}</td>
                      <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>{f.q3}</td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8" }}>{f.confidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
