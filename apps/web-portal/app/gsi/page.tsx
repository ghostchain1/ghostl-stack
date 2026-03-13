"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const modules = [
  { icon: "🗂️", title: "Identity Registry",    href: "/gsi/registry",     desc: "Register and resolve sovereign identities across governments, institutions, corporations, citizens, devices, and AI agents." },
  { icon: "🏦", title: "Institution Registry",  href: "/gsi/institutions", desc: "KYC-verified institutional identities for GSX exchange, GSN settlement, and GCM central bank network participation." },
  { icon: "📜", title: "Credential System",     href: "/gsi/credentials",  desc: "Issue and revoke verifiable on-chain credentials: banking licences, central bank authorisations, corporate registrations." },
  { icon: "🛂", title: "Digital Passport",      href: "/gsi/passport",     desc: "Soul-bound sovereign digital passports — non-transferable, government-issued on-chain identity tokens with biometric commitment." },
  { icon: "✅", title: "Verification Engine",   href: "/gsi/verification", desc: "KYC/KYE pipeline for onboarding institutions and citizens. Integrates with GSX, GSN, and GCM access control layers." },
  { icon: "🤖", title: "Fraud Monitoring",      href: "/gsi/fraud",        desc: "GhostBrain-powered identity fraud detection — flags suspicious registrations, fake institutions, and bot networks in real-time." },
];

const stats = [
  { label: "Registered Identities", value: "—" },
  { label: "Verified Institutions", value: "—" },
  { label: "Active Passports",      value: "—" },
  { label: "Fraud Alerts (24h)",    value: "—" },
];

export default function GSIIndexPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#07060e 0%,#050507 100%)" }}>
          <div className="container">
            <span className="tag">Sovereign Identity</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              Ghost<span style={{ color: "#8b5cf6" }}>SI</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 640, margin: "0 auto 32px", fontSize: "1.1rem" }}>
              Sovereign Identity Network — universal verified identity for governments, institutions, citizens, and AI agents across the entire GhostChain ecosystem.
            </p>
            <div style={{ display: "inline-block", background: "#8b5cf622", color: "#8b5cf6", padding: "6px 16px", borderRadius: 20, fontSize: "0.85rem", fontWeight: 600 }}>
              Identity Backbone for GhostStack
            </div>
          </div>
        </section>

        <section style={{ padding: "40px 24px", background: "#07060e" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16 }}>
              {stats.map((s) => (
                <div key={s.label} className="card" style={{ textAlign: "center", padding: "20px 16px" }}>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#8b5cf6", marginBottom: 6 }}>{s.value}</div>
                  <div style={{ color: "#64748b", fontSize: "0.8rem" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <h2 style={{ fontWeight: 700, fontSize: "1.5rem", marginBottom: 32 }}>Identity Modules</h2>
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
            <h2 style={{ fontWeight: 700, fontSize: "1.3rem", marginBottom: 24, textAlign: "center" }}>Identity Coverage Across GhostStack</h2>
            <pre style={{ color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.8, overflowX: "auto", background: "#0f0e17", padding: 24, borderRadius: 12 }}>{`GSI Identity
   │
   ├ GSX Exchange Access          (institutional KYC gate)
   ├ GSN Settlement Participation (verified counterparty)
   ├ GCM Central Bank Authority   (licensed issuer check)
   ├ GSE Economic Systems         (nation/tax registrant)
   └ GhostL3 Application Access   (citizen / device auth)`}</pre>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
