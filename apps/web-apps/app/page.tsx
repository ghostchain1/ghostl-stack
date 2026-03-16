"use client";
import { GHOST_SITES } from "@ghostchain/config";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const apps = [
  { name: "GhostSwap", tagline: "DEX across all Ghost layers", status: "live", href: `${GHOST_SITES.apps.url}/ghostswap`, color: "#FFD700" },
  { name: "GhostWallet", tagline: "Self-custodial multi-layer wallet", status: "live", href: GHOST_SITES.wallet.url, color: "#FFAA00" },
  { name: "GhostBridge", tagline: "L1↔L2↔L3 asset bridge", status: "live", href: GHOST_SITES.bridge.url, color: "#A855F7" },
  { name: "GhostNFT", tagline: "NFT marketplace with AI provenance", status: "beta", href: `${GHOST_SITES.apps.url}/nft`, color: "#06B6D4" },
  { name: "GhostDAO", tagline: "Decentralized governance suite", status: "beta", href: GHOST_SITES.governance.url, color: "#8B5CF6" },
  { name: "LitVyb Live", tagline: "Social layer & creator economy", status: "live", href: `${GHOST_SITES.apps.url}/vyb/download`, color: "#EC4899", ctaLabel: "Download app →" },
  { name: "GhostXchange", tagline: "Institutional OTC & spot trading", status: "coming soon", href: GHOST_SITES.exchange.url, color: "#F59E0B" },
  { name: "GhostID", tagline: "ZK-verified on-chain identity", status: "coming soon", href: `${GHOST_SITES.apps.url}/id`, color: "#10B981" },
];

const statusColor: Record<string, string> = {
  live: "#10B981",
  beta: "#F59E0B",
  "coming soon": "#64748b",
};

export default function AppsPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Launch an App", href: GHOST_SITES.portal.url }} />
      <main>
        {/* Hero */}
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">Application Ecosystem</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,4rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              The <span style={{ color: "#FFD700" }}>Ghost</span> App Universe
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600, margin: "0 auto 40px", fontSize: "1.1rem" }}>
              DeFi, wallets, identity, social, and governance — all built natively on GhostChain's three-layer architecture.
            </p>
          </div>
        </section>

        {/* Apps grid */}
        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 24 }}>
              {apps.map((app) => (
                <div key={app.name} className="card" style={{ position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: app.color }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: 700 }}>{app.name}</h3>
                    <span style={{ fontSize: "0.72rem", fontWeight: 600, color: statusColor[app.status], background: statusColor[app.status] + "22", padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{app.status}</span>
                  </div>
                  <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: 20 }}>{app.tagline}</p>
                  <a href={app.href} style={{ color: app.color, textDecoration: "none", fontSize: "0.9rem", fontWeight: 600 }}>{app.ctaLabel ?? "Launch app →"}</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Build CTA */}
        <section style={{ padding: "80px 24px", textAlign: "center", background: "#0A0A0A" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 16 }}>Build the next Ghost app</h2>
            <p style={{ color: "#94a3b8", marginBottom: 32 }}>Get listed in the Ghost App Universe. Open-source contributions welcome.</p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <a href={`${GHOST_SITES.dev.url}/grants`} className="btn-primary">Apply for Grant</a>
              <a href={GHOST_SITES.docs.url} className="btn-secondary">Developer Docs</a>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
