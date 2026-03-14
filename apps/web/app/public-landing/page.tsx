import GhostHero from "../../components/hero/GhostHero";
import EcosystemSection from "../../components/sections/Ecosystem";
import TokenSection from "../../components/sections/TokenSection";
import GhostBrainSection from "../../components/sections/GhostBrain";
import DevelopersSection from "../../components/sections/DevelopersSection";

/**
 * GhostChain public landing page.
 * Route: / (when accessed without the dashboard sidebar).
 */
export default function LandingPage() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0A0A0A", minHeight: "100vh" }}>
      <GhostHero />
      <EcosystemSection />
      <TokenSection />
      <GhostBrainSection />
      <DevelopersSection />

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid rgba(255,215,0,0.12)",
        padding: "3rem 2rem",
        textAlign: "center",
        background: "#0A0A0A",
      }}>
        <img
          src="/assets/ghost-logo.png"
          alt="GhostChain"
          width={56}
          height={56}
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          style={{ filter: "drop-shadow(0 0 10px #FFD700)", marginBottom: "1rem" }}
        />
        <p style={{ color: "#FFD700", fontFamily: "'Orbitron','Inter',sans-serif", fontWeight: 700, letterSpacing: "0.14em", fontSize: "0.95rem" }}>
          GHOSTCHAIN
        </p>
        <p style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          The Sovereign AI Blockchain · Ghost Token (GST) · © {new Date().getFullYear()} GhostStack
        </p>
        <div style={{ display: "flex", gap: "2rem", justifyContent: "center", marginTop: "1.5rem" }}>
          {[
            { href: "/ecosystem", label: "Ecosystem" },
            { href: "/token",     label: "Token" },
            { href: "/developers",label: "Developers" },
            { href: "/governance",label: "Governance" },
            { href: "/explorer",  label: "Explorer" },
          ].map(l => (
            <a key={l.href} href={l.href} style={{ color: "#64748b", fontSize: "0.8rem", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#FFD700")}
              onMouseLeave={e => (e.currentTarget.style.color = "#64748b")}>
              {l.label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
