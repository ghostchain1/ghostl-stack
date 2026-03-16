"use client";
import { GHOST_SITE_DIRECTORY, GHOST_SITES } from "@ghostchain/config";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";
import { useState } from "react";

const navSections = [
  {
    category: "Chains",
    icon: "⛓",
    items: [
      { label: "L1 Explorer", href: GHOST_SITES.explorer.url },
      { label: "L2 Explorer", href: `${GHOST_SITES.explorer.url}?layer=2` },
      { label: "L3 Explorer", href: `${GHOST_SITES.explorer.url}?layer=3` },
    ],
  },
  {
    category: "Governance",
    icon: "🗳",
    items: [
      { label: "Active Proposals", href: GHOST_SITES.governance.url },
      { label: "Council", href: `${GHOST_SITES.governance.url}/council` },
      { label: "Constitution", href: `${GHOST_SITES.governance.url}/constitution` },
    ],
  },
  {
    category: "Validators",
    icon: "🔒",
    items: [
      { label: "Validator Set", href: GHOST_SITES.nodes.url },
      { label: "My Stake", href: `${GHOST_SITES.nodes.url}/stake` },
      { label: "Rewards", href: `${GHOST_SITES.nodes.url}/rewards` },
    ],
  },
  {
    category: "Treasury",
    icon: "💰",
    items: [
      { label: "Balance", href: `${GHOST_SITES.investor.url}/treasury` },
      { label: "Tokenomics", href: `${GHOST_SITES.investor.url}/tokenomics` },
      { label: "Reports", href: `${GHOST_SITES.investor.url}/reports` },
    ],
  },
  {
    category: "Developer",
    icon: "⚡",
    items: [
      { label: "Docs", href: GHOST_SITES.docs.url },
      { label: "RPC Endpoints", href: GHOST_SITES.rpc.url },
      { label: "Grants", href: `${GHOST_SITES.dev.url}/grants` },
    ],
  },
  {
    category: "Apps",
    icon: "🚀",
    items: [
      { label: "GhostSwap", href: `${GHOST_SITES.apps.url}/ghostswap` },
      { label: "GhostWallet", href: GHOST_SITES.wallet.url },
      { label: "GhostBridge", href: GHOST_SITES.bridge.url },
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
      { label: "System Status", href: GHOST_SITES.status.url },
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
      <PublicNavbar cta={{ label: GHOST_SITES.main.domain, href: GHOST_SITES.main.url }} />
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
                  {GHOST_SITE_DIRECTORY.filter((site) => !["wallet", "live"].includes(site.key)).map((site, index) => (
                    <a key={site.key} href={site.url} style={{ display: "block", padding: "14px 20px", borderRadius: 10, border: "1px solid #1e293b", background: "#0A0A0A", textDecoration: "none", color: ["#FFD700", "#10B981", "#FFAA00", "#A855F7", "#06B6D4", "#8B5CF6", "#FFD700", "#F59E0B", "#64748b", "#10B981"][index % 10], fontWeight: 700, fontSize: "0.9rem", transition: "border-color .15s" }}>
                      {site.label} →
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
