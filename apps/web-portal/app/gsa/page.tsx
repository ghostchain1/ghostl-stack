"use client";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const modules = [
  { icon: "🤖", title: "AI Agent Registry",   href: "/gsa/agents",     desc: "All GhostBrain AI agents operating across GhostStack. Lifecycle management: register, activate, suspend, decommission." },
  { icon: "🏛️", title: "AI Governance",       href: "/gsa/governance", desc: "AI-assisted policy proposals, voting, and execution across GhostChain L1, L2, and L3 layers." },
  { icon: "📡", title: "AI Oracle Network",   href: "/gsa/oracle",     desc: "Real-time AI-generated data feeds: price forecasts, economic indicators, and risk scores published on-chain." },
  { icon: "⚙️", title: "Autonomous Policy",   href: "/gsa/policy",     desc: "AI-proposed parameter adjustments for GSX, GCM, GSE, and GSN — reviewed and executed via governance approval." },
  { icon: "📊", title: "System Monitor",      href: "/gsa/monitor",    desc: "GhostBrain system-wide monitoring: health, anomalies, and performance metrics across all GhostStack subsystems." },
  { icon: "⚠️", title: "Risk Intelligence",   href: "/gsa/risk",       desc: "AI risk scoring for market, credit, liquidity, and systemic risk — real-time threat assessment across the ecosystem." },
  { icon: "📋", title: "AI Audit Trail",      href: "/gsa/audit",      desc: "Immutable on-chain record of every AI agent decision, oracle update, policy proposal, and governance action." },
];

const stats = [
  { label: "Active AI Agents",   value: "—" },
  { label: "Oracle Feeds",       value: "—" },
  { label: "Policy Changes (7d)",value: "—" },
  { label: "Decisions (24h)",    value: "—" },
];

const STACK = [
  { sys: "GSI", desc: "Identity fraud detection + biometric verification" },
  { sys: "GSX", desc: "Market manipulation monitoring + risk assessment" },
  { sys: "GSN", desc: "Settlement anomaly detection" },
  { sys: "GCM", desc: "Monetary policy AI recommendations" },
  { sys: "GSE", desc: "Economic forecasting + GDP modelling" },
  { sys: "GSR", desc: "Reserve adequacy monitoring" },
  { sys: "GWF", desc: "Global macro crisis early-warning" },
];

export default function GSAIndexPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#07060e 0%,#0a0508 100%)" }}>
          <div className="container">
            <span className="tag">Sovereign AI</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              Ghost<span style={{ color: "#dc2626" }}>SA</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 640, margin: "0 auto 32px", fontSize: "1.1rem" }}>
              Ghost Sovereign AI Network — autonomous intelligence, oracle data, and AI governance for the entire GhostChain ecosystem. Powered by GhostBrain Core.
            </p>
            <div style={{ display: "inline-block", background: "#dc262622", color: "#dc2626", padding: "6px 16px", borderRadius: 20, fontSize: "0.85rem", fontWeight: 600 }}>
              Autonomous Intelligence Superlayer
            </div>
          </div>
        </section>

        <section style={{ padding: "40px 24px", background: "#07060e" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16 }}>
              {stats.map((s) => (
                <div key={s.label} className="card" style={{ textAlign: "center", padding: "20px 16px" }}>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#dc2626", marginBottom: 6 }}>{s.value}</div>
                  <div style={{ color: "#64748b", fontSize: "0.8rem" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <h2 style={{ fontWeight: 700, fontSize: "1.5rem", marginBottom: 32 }}>AI Modules</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 24 }}>
              {modules.map((m) => (
                <a key={m.title} href={m.href} className="card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                  <div style={{ fontSize: "2rem", marginBottom: 12 }}>{m.icon}</div>
                  <h3 style={{ fontWeight: 700, marginBottom: 8 }}>{m.title}</h3>
                  <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>{m.desc}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "60px 24px", background: "#07060e" }}>
          <div className="container">
            <h2 style={{ fontWeight: 700, fontSize: "1.3rem", marginBottom: 24, textAlign: "center" }}>GhostBrain Coverage Across GhostStack</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
              {STACK.map((s) => (
                <div key={s.sys} className="card" style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 18px" }}>
                  <span style={{ background: "#dc262622", color: "#dc2626", padding: "4px 12px", borderRadius: 10, fontWeight: 800, fontSize: "0.78rem", flexShrink: 0 }}>{s.sys}</span>
                  <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>{s.desc}</p>
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
