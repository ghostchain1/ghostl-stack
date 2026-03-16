import { headers } from "next/headers";
import { GHOST_OWNED_DOMAINS, GHOST_SITES } from "@ghostchain/config";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

const layers = [
  { id: "L1", name: "GhostChain", desc: "Sovereign proof-of-authority L1 with IBFT consensus. 5-second finality, 2000+ TPS.", color: "#FFD700" },
  { id: "L2", name: "GhostL2", desc: "Optimistic rollup layer and mandatory transit path between GhostL3 and GhostChain L1.", color: "#FFAA00" },
  { id: "L3", name: "GhostL3", desc: "Application-specific rollup for high-frequency workloads. L3 messages always transit GhostL2 first.", color: "#FF6B6B" },
];

const features = [
  { icon: "⬡", title: "AI-Powered Governance", desc: "GhostBrain AI monitors the network, drafts policy, and routes operators toward governance ratification." },
  { icon: "◈", title: "Multi-Layer Architecture", desc: "GhostChain L1, GhostL2, and GhostL3 combine for throughput, deterministic routing, and stable settlement." },
  { icon: "⬜", title: "Self-Healing Network", desc: "Autonomous agents detect anomalies, reroute traffic, and recover branded services before users feel the fault." },
  { icon: "◎", title: "Zero-Knowledge Privacy", desc: "Native proofs support privacy-preserving workflows without pushing settlement outside the GhostChain stack." },
  { icon: "◆", title: "Treasury Autonomy", desc: "On-chain treasury and GST flows operate under constitutional guardrails and Ghost-native governance." },
  { icon: "⌘", title: "Global Distribution", desc: "Owned domains, regional routing, and validator surfaces give GhostChain a world-scale operating footprint." },
];

const ecosystem = [
  { site: GHOST_SITES.investor, label: "Investor Portal", desc: "Treasury, GST strategy, and reporting" },
  { site: GHOST_SITES.dev, label: "Developer Portal", desc: "Ghost SDKs, docs, RPC onboarding" },
  { site: GHOST_SITES.apps, label: "Ecosystem Apps", desc: "Launch Ghost-native experiences" },
  { site: GHOST_SITES.explorer, label: "GhostScan", desc: "L1, L2, and L3 activity" },
  { site: GHOST_SITES.governance, label: "Governance", desc: "DAO, proposals, and constitutional policy" },
  { site: GHOST_SITES.nodes, label: "Node Operators", desc: "Validators, rewards, and infrastructure" },
  { site: GHOST_SITES.exchange, label: "GhostXchange", desc: "Institutional GST markets" },
  { site: GHOST_SITES.status, label: "Status", desc: "Network health and incidents" },
];

const domainVariants = {
  "ghostchain.cloud": {
    badge: "Canonical Network",
    titleLeading: "The Sovereign",
    titleAccent: "AI Blockchain",
    summary: "GhostChain is the sovereign, AI-powered multi-layer blockchain ecosystem. GhostL3 routes through GhostL2, GhostL2 settles through GhostChain L1, and GST is the gas token everywhere.",
    primary: { label: "Explore Ecosystem →", href: "/ecosystem" },
    secondary: { label: "Developer Docs", href: GHOST_SITES.docs.url },
    stats: [["2,000+", "TPS L1"], ["100,000+", "TPS L3"], ["5s", "Finality"], ["3", "Layers"]],
    spotlightTitle: "One canonical surface. Eleven owned domains.",
    spotlightBody: "Use the GhostChain portfolio to direct developers, operators, creators, enterprises, and market participants into the correct branded surface without losing the core Ghost identity.",
  },
  "ghostchain.world": {
    badge: "Global Network",
    titleLeading: "A World-Scale",
    titleAccent: "GhostChain Footprint",
    summary: "GhostChain World is the global-facing entry to regional routing, validator participation, status intelligence, and the full owned-domain portfolio powering the Ghost ecosystem.",
    primary: { label: "View Node Network →", href: GHOST_SITES.nodes.url },
    secondary: { label: "Check Network Status", href: GHOST_SITES.status.url },
    stats: [["11", "Owned Domains"], ["3", "Core Layers"], ["24/7", "Ops Visibility"], ["GST", "Native Gas"]],
    spotlightTitle: "Global routing, one brand system.",
    spotlightBody: "GhostChain World highlights the surfaces that matter to a world-scale rollout: regional access, owned domains, operator readiness, and resilient Ghost-native discovery.",
  },
} as const;

function normalizeHost(value: string | null) {
  return (value || "").split(":")[0].replace(/^www\./, "").toLowerCase();
}

async function getRequestHost() {
  const requestHeaders = await headers();
  return normalizeHost(requestHeaders.get("x-forwarded-host") || requestHeaders.get("host"));
}

export default async function Home() {
  const host = await getRequestHost();
  const variant = domainVariants[host as keyof typeof domainVariants] || domainVariants["ghostchain.cloud"];

  return (
    <>
      <PublicNavbar cta={{ label: "Launch App →", href: GHOST_SITES.portal.url }} />

      <section style={{ padding: "7rem 1.5rem 5rem", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% -10%, #FFD70008, transparent)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 900, margin: "0 auto", position: "relative" }}>
          <div className="tag" style={{ marginBottom: "1.5rem" }}>{variant.badge}</div>
          <h1 style={{ fontSize: "clamp(2.5rem,6vw,4.5rem)", fontWeight: 800, marginBottom: "1.5rem" }}>
            {variant.titleLeading}
            <br />
            <span style={{ background: "linear-gradient(135deg,#FFD700,#FFAA00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {variant.titleAccent}
            </span>
          </h1>
          <p style={{ fontSize: "1.25rem", color: "var(--text-muted)", maxWidth: 700, margin: "0 auto 2.5rem", lineHeight: 1.7 }}>
            {variant.summary}
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a className="btn-primary" href={variant.primary.href}>{variant.primary.label}</a>
            <a className="btn-secondary" href={variant.secondary.href}>{variant.secondary.label}</a>
          </div>
          <div style={{ marginTop: "3.5rem", display: "flex", gap: "2.5rem", justifyContent: "center", flexWrap: "wrap" }}>
            {variant.stats.map(([value, label]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "#FFD700" }}>{value}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "0 1.5rem 5rem" }}>
        <div className="container card" style={{ maxWidth: 960 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start", flexWrap: "wrap" }}>
            <div style={{ maxWidth: 680 }}>
              <div className="tag" style={{ marginBottom: "0.75rem" }}>Domain Portfolio</div>
              <h2 style={{ fontSize: "clamp(1.5rem,4vw,2.25rem)", fontWeight: 700, marginBottom: "0.75rem" }}>{variant.spotlightTitle}</h2>
              <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>{variant.spotlightBody}</p>
            </div>
            <div style={{ color: "#FFD700", fontSize: "0.875rem", fontWeight: 700 }}>
              Serving {host || "ghostchain.cloud"}
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: "0 1.5rem 5rem" }}>
        <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "1rem" }}>
          {GHOST_OWNED_DOMAINS.map((domain) => (
            <a key={domain.domain} href={domain.canonicalUrl} className="card" style={{ textDecoration: "none" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>{domain.domain}</div>
              <div style={{ color: "#FFD700", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.5rem" }}>{domain.label}</div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: 0 }}>{domain.description}</p>
            </a>
          ))}
        </div>
      </section>

      <section style={{ padding: "0 1.5rem 5rem" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <div className="tag" style={{ marginBottom: "1rem" }}>Architecture</div>
            <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 700 }}>Three Layers. One Routing Law.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1.5rem" }}>
            {layers.map((layer) => (
              <div key={layer.id} className="card" style={{ borderColor: `${layer.color}33` }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                  <span style={{ background: `${layer.color}22`, border: `1px solid ${layer.color}44`, color: layer.color, padding: "0.25rem 0.75rem", borderRadius: 8, fontWeight: 700, fontSize: "0.875rem" }}>{layer.id}</span>
                  <span style={{ fontSize: "1.125rem", fontWeight: 600 }}>{layer.name}</span>
                </div>
                <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>{layer.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "5rem 1.5rem", background: "linear-gradient(180deg,transparent,#11111188)" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <div className="tag" style={{ marginBottom: "1rem" }}>Technology</div>
            <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 700 }}>Built for the GhostChain Brand System</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "1.5rem" }}>
            {features.map((feature) => (
              <div key={feature.title} className="card">
                <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>{feature.icon}</div>
                <h3 style={{ fontSize: "1.0625rem", fontWeight: 600, marginBottom: "0.5rem" }}>{feature.title}</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.9375rem", lineHeight: 1.7 }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "5rem 1.5rem" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 700 }}>The GhostChain Ecosystem</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "1rem" }}>
            {ecosystem.map(({ site, label, desc }) => (
              <a key={site.key} href={site.url} className="card" style={{ textDecoration: "none", display: "block", cursor: "pointer" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{label}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>{desc}</div>
                <div style={{ color: "#FFD70099", fontSize: "0.75rem" }}>{site.domain} →</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "6rem 1.5rem", textAlign: "center" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 700, marginBottom: "1rem" }}>
            Ready to Move Through the GhostStack?
          </h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", lineHeight: 1.7 }}>
            Access Ghost SDKs, GNS discovery, GST-native services, and the branded surfaces aligned to each part of the GhostChain ecosystem.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a className="btn-primary" href={GHOST_SITES.dev.url}>Start Building →</a>
            <a className="btn-secondary" href={GHOST_SITES.portal.url}>Open Portal</a>
          </div>
        </div>
      </section>

      <PublicFooter />
    </>
  );
}
