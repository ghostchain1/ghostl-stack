"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

type AppEntry = {
  name: string;
  subtitle?: string;
  tagline: string;
  status: string;
  href: string;
  color: string;
  downloads?: { ios: string; android: string };
};

const apps: AppEntry[] = [
  { name: "GhostSwap", tagline: "DEX across all Ghost layers", status: "live", href: "https://apps.ghostchain.cloud/ghostswap", color: "#FFD700" },
  { name: "GhostWallet", tagline: "Self-custodial multi-layer wallet", status: "live", href: "https://apps.ghostchain.cloud/wallet", color: "#FFAA00" },
  { name: "GhostBridge", tagline: "L1↔L2↔L3 asset bridge", status: "live", href: "https://apps.ghostchain.cloud/bridge", color: "#A855F7" },
  { name: "GhostNFT", tagline: "NFT marketplace with AI provenance", status: "beta", href: "https://apps.ghostchain.cloud/nft", color: "#06B6D4" },
  { name: "GhostDAO", tagline: "Decentralized governance suite", status: "beta", href: "https://governance.ghostchain.cloud", color: "#8B5CF6" },
  {
    name: "GhostVyb",
    subtitle: "powered by LitVybz Live",
    tagline: "Live streaming, creator economy & social layer on GhostChain",
    status: "live",
    href: "https://apps.ghostchain.cloud/vyb",
    color: "#EC4899",
    downloads: {
      ios: "https://apps.ghostchain.cloud/vyb/download/ios",
      android: "https://apps.ghostchain.cloud/vyb/download/android",
    },
  },
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: app.subtitle ? 2 : 0 }}>{app.name}</h3>
                      {app.subtitle && (
                        <span style={{ fontSize: "0.72rem", color: app.color, fontWeight: 600, opacity: 0.85 }}>{app.subtitle}</span>
                      )}
                    </div>
                    <span style={{ fontSize: "0.72rem", fontWeight: 600, color: statusColor[app.status], background: statusColor[app.status] + "22", padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", marginLeft: 8, flexShrink: 0 }}>{app.status}</span>
                  </div>
                  <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: 16 }}>{app.tagline}</p>
                  <a href={app.href} style={{ color: app.color, textDecoration: "none", fontSize: "0.9rem", fontWeight: 600 }}>Launch app →</a>
                  {app.downloads && (
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <a
                        href={app.downloads.ios}
                        aria-label="Download on the App Store"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          background: "#ffffff10", border: "1px solid #ffffff18",
                          borderRadius: 8, padding: "6px 12px", textDecoration: "none",
                          color: "#f1f5f9", fontSize: "0.75rem", fontWeight: 600,
                          letterSpacing: "0.02em", flexShrink: 0,
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                        </svg>
                        App Store
                      </a>
                      <a
                        href={app.downloads.android}
                        aria-label="Get it on Google Play"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          background: "#ffffff10", border: "1px solid #ffffff18",
                          borderRadius: 8, padding: "6px 12px", textDecoration: "none",
                          color: "#f1f5f9", fontSize: "0.75rem", fontWeight: 600,
                          letterSpacing: "0.02em", flexShrink: 0,
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M3.18 23.76c.3.17.64.22.99.14l12.12-6.98-2.76-2.76-10.35 9.6zM20.73 10.3L17.6 8.47 14.57 11.5l3.03 3.03 3.15-1.84a1.76 1.76 0 0 0 0-2.4zM2.09.27A1.78 1.78 0 0 0 1.8 1.2v21.6c0 .35.1.67.28.94l.1.1L13.8 12l-.01-.09L2.09.27zm2.52-.14L16.73 6.9 13.97 9.65 3.62.37l.99-.24z"/>
                        </svg>
                        Google Play
                      </a>
                    </div>
                  )}
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
