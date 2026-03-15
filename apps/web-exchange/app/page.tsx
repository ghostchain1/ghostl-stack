"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const features = [
  { icon: "🏦", title: "OTC Trading", desc: "Deep-liquidity OTC desk for block trades of $250K+. Dedicated relationship managers, competitive spreads." },
  { icon: "🔒", title: "Institutional Custody", desc: "Cold-storage custody with MPC key management. SOC 2 Type II certified infrastructure." },
  { icon: "⚡", title: "Settlement", desc: "On-chain atomic settlement in under 10 seconds. DVP and FOP settlement models supported." },
  { icon: "📋", title: "Compliance", desc: "Integrated AML/KYC via Chainalysis and Elliptic. Full FATF Travel Rule support." },
  { icon: "📊", title: "Prime Brokerage", desc: "Cross-margin across Ghost L1/L2 products. Portfolio margining coming Q3 2026." },
  { icon: "🤖", title: "API Access", desc: "FIX and REST APIs with co-location available. Sub-millisecond order acknowledgement." },
];

export default function ExchangePage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Onboard Now", href: "/kyc" }} />
      <main>
        {/* Hero */}
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">Institutional</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,4rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              Ghost<span style={{ color: "#F59E0B" }}>Xchange</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 620, margin: "0 auto 16px", fontSize: "1.1rem" }}>
              The institutional gateway to GhostChain assets. OTC, custody, prime brokerage, and API trading for qualified participants.
            </p>
            <div style={{ display: "inline-block", background: "#F59E0B22", color: "#F59E0B", padding: "6px 16px", borderRadius: 20, fontSize: "0.85rem", fontWeight: 600, marginBottom: 32 }}>Qualified Institutional Investors Only</div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/kyc" className="btn-primary" style={{ background: "#F59E0B", color: "#000" }}>Start KYC Onboarding</a>
              <a href="/contact" className="btn-secondary">Talk to a Rep</a>
            </div>
          </div>
        </section>

        {/* Features */}
        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 24 }}>
              {features.map((f) => (
                <div key={f.title} className="card">
                  <div style={{ fontSize: "2rem", marginBottom: 12 }}>{f.icon}</div>
                  <h3 style={{ fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Compliance badges */}
        <section style={{ padding: "60px 24px", background: "#0A0A0A", textAlign: "center" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 32 }}>Compliance & Certifications</h2>
            <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
              {["SOC 2 Type II", "FATF Travel Rule", "ISO 27001", "AML Certified", "GDPR Compliant"].map((b) => (
                <div key={b} style={{ padding: "10px 24px", border: "1px solid #1e293b", borderRadius: 8, color: "#94a3b8", fontSize: "0.85rem", fontWeight: 600 }}>{b}</div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "80px 24px", textAlign: "center" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 16 }}>Ready to trade at scale?</h2>
            <a href="/kyc" className="btn-primary" style={{ background: "#F59E0B", color: "#000" }}>Begin Onboarding</a>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
