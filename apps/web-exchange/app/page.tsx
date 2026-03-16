import { headers } from "next/headers";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

const features = [
  { icon: "🏦", title: "OTC Trading", desc: "Deep-liquidity OTC desk for large GST trades, treasury rebalances, and branded market access." },
  { icon: "🔒", title: "Institutional Custody", desc: "Cold-storage custody with MPC key management and GhostChain-native settlement controls." },
  { icon: "⚡", title: "Settlement", desc: "On-chain atomic settlement in seconds across the GhostChain stack with GST as the only gas token." },
  { icon: "📋", title: "Compliance", desc: "Integrated onboarding, jurisdictional review, and operational evidence capture for market participants." },
  { icon: "📊", title: "Prime Brokerage", desc: "Cross-margin and treasury services spanning GhostChain L1, GhostL2, and GhostL3 exposures." },
  { icon: "🤖", title: "API Access", desc: "Programmatic GhostXchange access for desks, treasury automation, and market-making workflows." },
];

const domainVariants = {
  default: {
    tag: "Institutional",
    title: "GhostXchange",
    subtitle: "The institutional gateway to GhostChain assets. OTC, custody, prime brokerage, and API trading for qualified participants.",
    ribbon: "Qualified Institutional Participants",
    primary: { label: "Start KYC Onboarding", href: "/kyc" },
    secondary: { label: "Talk to a Rep", href: "/contact" },
  },
  "ghostchain.store": {
    tag: "GhostChain Store",
    title: "Acquire GST with GhostXchange",
    subtitle: "ghostchain.store is the branded market-access surface for GST acquisition, treasury execution, and institutional GhostChain settlement.",
    ribbon: "GST Markets and Settlement",
    primary: { label: "Enter GhostXchange", href: "/kyc" },
    secondary: { label: "Talk to Market Ops", href: "/contact" },
  },
} as const;

function normalizeHost(value: string | null) {
  return (value || "").split(":")[0].replace(/^www\./, "").toLowerCase();
}

async function getVariant() {
  const requestHeaders = await headers();
  const host = normalizeHost(requestHeaders.get("x-forwarded-host") || requestHeaders.get("host"));
  return domainVariants[host as keyof typeof domainVariants] || domainVariants.default;
}

export default async function ExchangePage() {
  const variant = await getVariant();

  return (
    <>
      <PublicNavbar cta={{ label: variant.primary.label, href: variant.primary.href }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">{variant.tag}</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,4rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              <span style={{ color: "#F59E0B" }}>{variant.title}</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 680, margin: "0 auto 16px", fontSize: "1.1rem" }}>
              {variant.subtitle}
            </p>
            <div style={{ display: "inline-block", background: "#F59E0B22", color: "#F59E0B", padding: "6px 16px", borderRadius: 20, fontSize: "0.85rem", fontWeight: 600, marginBottom: 32 }}>{variant.ribbon}</div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <a href={variant.primary.href} className="btn-primary" style={{ background: "#F59E0B", color: "#000" }}>{variant.primary.label}</a>
              <a href={variant.secondary.href} className="btn-secondary">{variant.secondary.label}</a>
            </div>
          </div>
        </section>

        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 24 }}>
              {features.map((feature) => (
                <div key={feature.title} className="card">
                  <div style={{ fontSize: "2rem", marginBottom: 12 }}>{feature.icon}</div>
                  <h3 style={{ fontWeight: 700, marginBottom: 8 }}>{feature.title}</h3>
                  <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "60px 24px", background: "#0A0A0A", textAlign: "center" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 32 }}>Compliance and Certifications</h2>
            <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
              {["SOC 2 Type II", "Travel Rule Ready", "GST Settlement", "AML Reviewed", "Operational Segregation"].map((badge) => (
                <div key={badge} style={{ padding: "10px 24px", border: "1px solid #1e293b", borderRadius: 8, color: "#94a3b8", fontSize: "0.85rem", fontWeight: 600 }}>{badge}</div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "80px 24px", textAlign: "center" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 16 }}>Ready to route GST at market scale?</h2>
            <a href={variant.primary.href} className="btn-primary" style={{ background: "#F59E0B", color: "#000" }}>{variant.primary.label}</a>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
