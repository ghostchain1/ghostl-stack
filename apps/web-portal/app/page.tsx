"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";
import { useState } from "react";

const navSections = [
  {
    category: "Chains",
    icon: "⛓",
    items: [
      { label: "L1 Explorer", href: "https://explorer.ghostchain.cloud" },
      { label: "L2 Explorer", href: "https://explorer.ghostchain.cloud?layer=2" },
      { label: "L3 Explorer", href: "https://explorer.ghostchain.cloud?layer=3" },
    ],
  },
  {
    category: "Governance",
    icon: "🗳",
    items: [
      { label: "Active Proposals", href: "https://governance.ghostchain.cloud" },
      { label: "Council", href: "https://governance.ghostchain.cloud/council" },
      { label: "Constitution", href: "https://governance.ghostchain.cloud/constitution" },
    ],
  },
  {
    category: "Validators",
    icon: "🔒",
    items: [
      { label: "Validator Set", href: "https://nodes.ghostchain.cloud" },
      { label: "My Stake", href: "https://nodes.ghostchain.cloud/stake" },
      { label: "Rewards", href: "https://nodes.ghostchain.cloud/rewards" },
    ],
  },
  {
    category: "Treasury",
    icon: "💰",
    items: [
      { label: "Balance", href: "https://invest.ghostchain.cloud/treasury" },
      { label: "Tokenomics", href: "https://invest.ghostchain.cloud/tokenomics" },
      { label: "Reports", href: "https://invest.ghostchain.cloud/reports" },
    ],
  },
  {
    category: "Developer",
    icon: "⚡",
    items: [
      { label: "Docs", href: "https://dev.ghostchain.cloud/docs" },
      { label: "RPC Endpoints", href: "https://dev.ghostchain.cloud#rpc" },
      { label: "Grants", href: "https://dev.ghostchain.cloud/grants" },
    ],
  },
  {
    category: "Apps",
    icon: "🚀",
    items: [
      { label: "GhostSwap", href: "https://apps.ghostchain.cloud/ghostswap" },
      { label: "GhostWallet", href: "https://apps.ghostchain.cloud/wallet" },
      { label: "GhostBridge", href: "https://apps.ghostchain.cloud/bridge" },
    ],
  },
  {
    category: "Contracts",
    icon: "📜",
    items: [
      { label: "Deploy", href: "/contracts/deploy" },
      { label: "Verify", href: "/contracts/verify" },
      { label: "ABI Library", href: "/contracts/abi" },
    ],
  },
  {
    category: "Status",
    icon: "✓",
    items: [
      { label: "System Status", href: "https://status.ghostchain.cloud" },
      { label: "Alerts", href: "/alerts" },
      { label: "Incidents", href: "/incidents" },
    ],
  },
];

const quickStats = [
  { label: "TPS (L1)", value: "2,847" },
  { label: "Active Validators", value: "128" },
  { label: "GST Price", value: "—" },
  { label: "Treasury", value: "$—" },
  { label: "Active Proposals", value: "3" },
  { label: "Network Uptime", value: "99.97%" },
];

export default function PortalPage() {
  const [active, setActive] = useState("Chains");
  const section = navSections.find((s) => s.category === active)!;

  return (
    <>
      <PublicNavbar cta={{ label: "ghostchain.cloud", href: "https://ghostchain.cloud" }} />
      <main style={{ minHeight: "100vh" }}>
        {/* Header */}
        <section style={{ padding: "80px 24px 40px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">Super Portal</span>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 800, margin: "20px 0 12px" }}>
              Ghost <span style={{ color: "#FFD700" }}>Control Center</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 500, margin: "0 auto", fontSize: "1rem" }}>
              Unified dashboard for every GhostChain service — chains, governance, validators, treasury, and more.
            </p>
          </div>
        </section>

        {/* Quick stats */}
        <section style={{ padding: "24px", borderBottom: "1px solid #0f172a" }}>
          <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 16, textAlign: "center" }}>
            {quickStats.map((s) => (
              <div key={s.label}>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#FFD700" }}>{s.value}</div>
                <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Portal grid */}
        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 32, alignItems: "start" }}>
              {/* Sidebar */}
              <nav style={{ position: "sticky", top: 80 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {navSections.map((s) => (
                    <button key={s.category} onClick={() => setActive(s.category)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 8, border: "none", background: active === s.category ? "#FFD70022" : "transparent", color: active === s.category ? "#FFD700" : "#94a3b8", cursor: "pointer", textAlign: "left", fontWeight: active === s.category ? 700 : 400, fontSize: "0.9rem", transition: "all .15s" }}>
                      <span>{s.icon}</span>{s.category}
                    </button>
                  ))}
                </div>
              </nav>

              {/* Content */}
              <div>
                <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 24 }}>{section.icon} {section.category}</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
                  {section.items.map((item) => (
                    <a key={item.label} href={item.href} className="card" style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 600 }}>{item.label}</span>
                      <span style={{ color: "#FFD700", fontSize: "1.1rem" }}>→</span>
                    </a>
                  ))}
                </div>

                {/* All portals grid */}
                <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "48px 0 24px" }}>All Ghost Portals</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
                  {[
                    { name: "Main Site", href: "https://ghostchain.cloud", color: "#FFD700" },
                    { name: "Investor", href: "https://invest.ghostchain.cloud", color: "#10B981" },
                    { name: "Developers", href: "https://dev.ghostchain.cloud", color: "#FFAA00" },
                    { name: "Apps", href: "https://apps.ghostchain.cloud", color: "#A855F7" },
                    { name: "Explorer", href: "https://explorer.ghostchain.cloud", color: "#06B6D4" },
                    { name: "Governance", href: "https://governance.ghostchain.cloud", color: "#8B5CF6" },
                    { name: "Validators", href: "https://nodes.ghostchain.cloud", color: "#FFD700" },
                    { name: "Exchange", href: "https://exchange.ghostchain.cloud", color: "#F59E0B" },
                    { name: "Company", href: "https://ghostchain.company", color: "#64748b" },
                    { name: "Status", href: "https://status.ghostchain.cloud", color: "#10B981" },
                  ].map((p) => (
                    <a key={p.name} href={p.href} style={{ display: "block", padding: "14px 20px", borderRadius: 10, border: "1px solid #1e293b", background: "#0A0A0A", textDecoration: "none", color: p.color, fontWeight: 700, fontSize: "0.9rem", transition: "border-color .15s" }}>
                      {p.name} →
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
