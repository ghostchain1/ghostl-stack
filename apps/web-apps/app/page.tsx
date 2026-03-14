"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const apps = [
  { name: "GhostSwap", tagline: "DEX across all Ghost layers", status: "live", href: "https://apps.ghostchain.cloud/ghostswap", color: "#00F0FF" },
  { name: "GhostWallet", tagline: "Self-custodial multi-layer wallet", status: "live", href: "https://apps.ghostchain.cloud/wallet", color: "#7A00FF" },
  { name: "GhostBridge", tagline: "L1↔L2↔L3 asset bridge", status: "live", href: "https://apps.ghostchain.cloud/bridge", color: "#A855F7" },
  { name: "GhostNFT", tagline: "NFT marketplace with AI provenance", status: "beta", href: "https://apps.ghostchain.cloud/nft", color: "#06B6D4" },
  { name: "GhostDAO", tagline: "Decentralized governance suite", status: "beta", href: "https://governance.ghostchain.cloud", color: "#8B5CF6" },
  { name: "GhostVyb", tagline: "Social layer & creator economy", status: "coming soon", href: "https://apps.ghostchain.cloud/vyb", color: "#EC4899" },
  { name: "GhostXchange", tagline: "Institutional OTC & spot trading", status: "coming soon", href: "https://exchange.ghostchain.cloud", color: "#F59E0B" },
  { name: "GhostID", tagline: "ZK-verified on-chain identity", status: "coming soon", href: "https://apps.ghostchain.cloud/id", color: "#10B981" },
];

const statusColor: Record<string, string> = {
  live: "#10B981",
  beta: "#F59E0B",
  "coming soon": "#64748b",
};

export default function AppsPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Launch an App", href: "https://portal.ghostchain.cloud" }} />
      <main>
        {/* Hero */}
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#07060e 0%,#050507 100%)" }}>
          <div className="container">
            <span className="tag">Application Ecosystem</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,4rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              The <span style={{ color: "#00F0FF" }}>Ghost</span> App Universe
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
                  <a href={app.href} style={{ color: app.color, textDecoration: "none", fontSize: "0.9rem", fontWeight: 600 }}>Launch app →</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Build CTA */}
        <section style={{ padding: "80px 24px", textAlign: "center", background: "#07060e" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 16 }}>Build the next Ghost app</h2>
            <p style={{ color: "#94a3b8", marginBottom: 32 }}>Get listed in the Ghost App Universe. Open-source contributions welcome.</p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="https://dev.ghostchain.cloud/grants" className="btn-primary">Apply for Grant</a>
              <a href="https://dev.ghostchain.cloud" className="btn-secondary">Developer Docs</a>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
