"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const modules = [
  { icon: "📊", title: "GDP Dashboard",          href: "/gse/gdp",       desc: "Real-time national GDP records, growth trends, and historical economic output across all registered sovereign nations." },
  { icon: "💰", title: "Tax System",             href: "/gse/tax",       desc: "Programmable sovereign tax policies — income, corporate, VAT, and trade tariff collection flowing to on-chain treasuries." },
  { icon: "🏛️", title: "Budget Management",      href: "/gse/budget",    desc: "National budget allocations across infrastructure, defence, healthcare, education, and research with on-chain disbursement." },
  { icon: "🌐", title: "Trade Network",           href: "/gse/trade",     desc: "International sovereign trade flows — commodity exports/imports with atomic settlement through GSN." },
  { icon: "🏗️", title: "Infrastructure Funding", href: "/gse/infra",     desc: "Sovereign infrastructure bonds for highways, ports, power grids, and railways. Track project funding and bond positions." },
  { icon: "🤖", title: "Economic Intelligence",   href: "/gse/ai",        desc: "AI-driven macroeconomic forecasting, recession detection, inflation monitoring, and resource demand prediction via GhostBrain." },
];

const stats = [
  { label: "Registered Nations",  value: "—" },
  { label: "Total GDP Tracked",   value: "—" },
  { label: "Active Projects",     value: "—" },
  { label: "Trade Volume (24h)",  value: "—" },
];

export default function GSEIndexPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        {/* Hero */}
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#07060e 0%,#050507 100%)" }}>
          <div className="container">
            <span className="tag">Sovereign Economy</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              Ghost<span style={{ color: "#10b981" }}>SE</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 640, margin: "0 auto 32px", fontSize: "1.1rem" }}>
              Sovereign Economy Engine — programmable national economies, GDP accounting, taxation, budgets, trade, and infrastructure funding on GhostChain L1.
            </p>
            <div style={{ display: "inline-block", background: "#10b98122", color: "#10b981", padding: "6px 16px", borderRadius: 20, fontSize: "0.85rem", fontWeight: 600 }}>
              Federal &amp; Sovereign Governments Only
            </div>
          </div>
        </section>

        {/* Live stats */}
        <section style={{ padding: "40px 24px", background: "#07060e" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16 }}>
              {stats.map((s) => (
                <div key={s.label} className="card" style={{ textAlign: "center", padding: "20px 16px" }}>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#10b981", marginBottom: 6 }}>{s.value}</div>
                  <div style={{ color: "#64748b", fontSize: "0.8rem" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Module grid */}
        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <h2 style={{ fontWeight: 700, fontSize: "1.5rem", marginBottom: 32 }}>Economy Modules</h2>
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

        {/* Architecture banner */}
        <section style={{ padding: "60px 24px", background: "#07060e" }}>
          <div className="container">
            <h2 style={{ fontWeight: 700, fontSize: "1.3rem", marginBottom: 24, textAlign: "center" }}>Stack Integration</h2>
            <pre style={{ color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.8, overflowX: "auto", background: "#0f0e17", padding: 24, borderRadius: 12 }}>{`GhostChain L1
│
├ GSE  Sovereign Economy Engine  ← you are here
├ GWF  World Finance Network
├ GCM  Central Bank Network
├ GSN  Global Settlement Network
├ GSX  Sovereign Exchange
└ GSR  Strategic Reserves Network`}</pre>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
