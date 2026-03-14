"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const FEEDS = [
  { name: "gdp.usa.forecast",    value: "28.4T",    unit: "USD",  conf: 9700, agent: "ai.gdp-forecaster",   updated: "2026-03-13 17:00 UTC" },
  { name: "gdp.eu.forecast",     value: "19.1T",    unit: "EUR",  conf: 9650, agent: "ai.gdp-forecaster",   updated: "2026-03-13 17:00 UTC" },
  { name: "risk.gsx.exchange",   value: "2.4%",     unit: "%",    conf: 9820, agent: "ai.risk-assessor",    updated: "2026-03-13 18:15 UTC" },
  { name: "risk.gsn.settlement", value: "0.8%",     unit: "%",    conf: 9900, agent: "ai.risk-assessor",    updated: "2026-03-13 18:15 UTC" },
  { name: "risk.gcm.credit",     value: "1.2%",     unit: "%",    conf: 9780, agent: "ai.risk-assessor",    updated: "2026-03-13 18:00 UTC" },
  { name: "price.gold.usd",      value: "2,847",    unit: "USD/oz",conf: 9850,agent: "ai.oracle-feeder",    updated: "2026-03-13 18:20 UTC" },
  { name: "price.oil.brent",     value: "84.20",    unit: "USD/b",conf: 9810, agent: "ai.oracle-feeder",    updated: "2026-03-13 18:20 UTC" },
  { name: "inflation.usa",       value: "3.1%",     unit: "%",    conf: 9600, agent: "ai.gdp-forecaster",   updated: "2026-03-13 12:00 UTC" },
  { name: "rate.fed.forecast",   value: "4.25%",    unit: "%",    conf: 9420, agent: "ai.policy-engine",    updated: "2026-03-13 10:00 UTC" },
];

export default function OraclePage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#0a0508)" }}>
          <div className="container">
            <a href="/gsa" style={{ color: "#dc2626", fontSize: "0.85rem", textDecoration: "none" }}>← GSA</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              AI Oracle <span style={{ color: "#dc2626" }}>Network</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>Real-time AI-generated data feeds — economic forecasts, risk scores, and commodity prices committed to GhostChain L1 with confidence ratings and cryptographic computation proofs.</p>
          </div>
        </section>

        <section style={{ padding: "40px 24px 80px" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
              {FEEDS.map((f) => (
                <div key={f.name} className="card" style={{ padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, color: "#dc2626", fontSize: "0.85rem", fontFamily: "monospace" }}>{f.name}</div>
                    <span style={{ background: "#10b98122", color: "#10b981", padding: "2px 8px", borderRadius: 8, fontSize: "0.72rem", fontWeight: 700 }}>
                      {(f.conf / 100).toFixed(1)}% conf
                    </span>
                  </div>
                  <div style={{ fontSize: "1.8rem", fontWeight: 800, margin: "6px 0" }}>
                    {f.value} <span style={{ fontSize: "0.9rem", color: "#64748b", fontWeight: 400 }}>{f.unit}</span>
                  </div>
                  <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: 8 }}>
                    <span style={{ color: "#dc2626" }}>{f.agent}</span> · {f.updated}
                  </div>
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
