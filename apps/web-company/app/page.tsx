import { headers } from "next/headers";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

const team = [
  { name: "Jason \"Ghost\" Rodriguez", role: "Chief Executive Officer", bio: "15 years building distributed systems and sovereign network operations at global scale." },
  { name: "Jason \"Ghost\" Rodriguez", role: "Chief AI Officer", bio: "PhD in machine learning. Led AI inference infrastructure and governance automation programs for large operators." },
  { name: "Jason \"Ghost\" Rodriguez", role: "Chief Technology Officer", bio: "Principal protocol engineer behind GhostChain's three-layer routing and settlement architecture." },
  { name: "Sara Khoury", role: "Chief Operating Officer", bio: "10 years in fintech operations. Scaled two blockchain startups to Series B." },
  { name: "Jordan Lee", role: "VP Engineering", bio: "Full-stack blockchain engineer. Core contributor to GhostVM runtime and SDK." },
  { name: "Priya Nair", role: "Head of Legal & Compliance", bio: "Crypto regulatory attorney. Led licensing efforts across 12 jurisdictions." },
];

const values = [
  { icon: "🔓", title: "Open by default", desc: "All protocol code is open source. Trust is built through transparency, not promises." },
  { icon: "🤖", title: "AI-native", desc: "AI is woven into governance, upgrades, and security, not bolted on after the fact." },
  { icon: "🛡️", title: "Self-sovereign", desc: "No admin keys. No foundation override. Governance by token holders, enforced on-chain." },
  { icon: "🌍", title: "Global from day one", desc: "Built for users across every jurisdiction. Censorship-resistant by design." },
];

const solutionLines = [
  { title: "Enterprise Rollouts", desc: "Launch branded GhostChain portals, compliance flows, and operator tooling without leaking identity into third-party stacks." },
  { title: "Validator Infrastructure", desc: "Provision GhostChain L1, GhostL2, and GhostL3 infrastructure with branded dashboards, routing guardrails, and GAIS operations." },
  { title: "GST Payment Rails", desc: "Integrate GST-native settlement, custody, and treasury workflows for sovereign enterprise deployments." },
];

const domainVariants = {
  default: {
    tag: "About GhostChain",
    titleLeading: "Building the",
    titleAccent: "Autonomous",
    titleTrailing: "Internet",
    body: "GhostChain is a team of engineers, researchers, and operators obsessed with making decentralized infrastructure as reliable and fast as the services it replaces.",
    ctaLabel: "Join the Team",
    ctaHref: "/careers",
    showSolutions: false,
  },
  "ghostchainsolutions.com": {
    tag: "GhostChain Solutions",
    titleLeading: "Enterprise",
    titleAccent: "GhostChain",
    titleTrailing: "Delivery",
    body: "GhostChain Solutions packages sovereign infrastructure, branded web surfaces, GST payment rails, and AI-managed operations for enterprise and public-sector deployments.",
    ctaLabel: "Talk to Solutions",
    ctaHref: "/contact",
    showSolutions: true,
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

export default async function CompanyPage() {
  const variant = await getVariant();

  return (
    <>
      <PublicNavbar cta={{ label: variant.ctaLabel, href: variant.ctaHref }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">{variant.tag}</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,4rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              {variant.titleLeading} <span style={{ color: "#FFD700" }}>{variant.titleAccent}</span> {variant.titleTrailing}
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 700, margin: "0 auto", fontSize: "1.1rem" }}>
              {variant.body}
            </p>
          </div>
        </section>

        {variant.showSolutions ? (
          <section style={{ padding: "60px 24px" }}>
            <div className="container">
              <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 32, textAlign: "center" }}>Solutions Lines</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 24 }}>
                {solutionLines.map((line) => (
                  <div key={line.title} className="card">
                    <h3 style={{ fontWeight: 700, marginBottom: 8 }}>{line.title}</h3>
                    <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>{line.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 32, textAlign: "center" }}>What we believe</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 24 }}>
              {values.map((value) => (
                <div key={value.title} className="card">
                  <div style={{ fontSize: "2rem", marginBottom: 12 }}>{value.icon}</div>
                  <h3 style={{ fontWeight: 700, marginBottom: 8 }}>{value.title}</h3>
                  <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>{value.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "60px 24px", background: "#0A0A0A" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 32, textAlign: "center" }}>Team</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 24 }}>
              {team.map((member) => (
                <div key={`${member.name}-${member.role}`} className="card">
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#FFAA00,#FFD700)", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.25rem", color: "#000" }}>{member.name[0]}</div>
                  <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 4 }}>{member.name}</div>
                  <div style={{ color: "#FFAA00", fontSize: "0.85rem", fontWeight: 600, marginBottom: 10 }}>{member.role}</div>
                  <p style={{ color: "#94a3b8", fontSize: "0.875rem", margin: 0 }}>{member.bio}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "80px 24px", textAlign: "center" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 32, maxWidth: 720, margin: "0 auto" }}>
              <div className="card" style={{ textAlign: "center" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 12 }}>Press Kit</h3>
                <p style={{ color: "#94a3b8", marginBottom: 20, fontSize: "0.9rem" }}>Logos, brand guidelines, and media contacts.</p>
                <a href="/press" className="btn-secondary">Download Press Kit</a>
              </div>
              <div className="card" style={{ textAlign: "center" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 12 }}>{variant.showSolutions ? "Solutions Desk" : "We're Hiring"}</h3>
                <p style={{ color: "#94a3b8", marginBottom: 20, fontSize: "0.9rem" }}>
                  {variant.showSolutions
                    ? "Reach the GhostChain Solutions team for enterprise rollouts, GST rails, and operator infrastructure."
                    : "Remote-first positions across engineering, research, and ops."}
                </p>
                <a href={variant.ctaHref} className="btn-primary">{variant.showSolutions ? "Contact Solutions" : "View Open Roles"}</a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
