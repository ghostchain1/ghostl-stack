"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const PROJECTS = [
  { name: "INFRA-HIGHWAY-I95",     nation: "gov.us", target: "$12B",  raised: "$8.4B",  pct: 70, bonds: 142 },
  { name: "INFRA-GRID-EU-EAST",    nation: "gov.eu", target: "$35B",  raised: "$19B",   pct: 54, bonds: 890 },
  { name: "INFRA-PORT-SINGAPORE",  nation: "gov.sg", target: "$4B",   raised: "$4B",    pct: 100, bonds: 210 },
  { name: "INFRA-RAIL-INDIA",      nation: "gov.in", target: "$60B",  raised: "$22B",   pct: 37, bonds: 1240 },
  { name: "INFRA-SPACE-US",        nation: "gov.us", target: "$18B",  raised: "$3.2B",  pct: 18, bonds: 62 },
];

export default function InfraPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#050507)" }}>
          <div className="container">
            <a href="/gse" style={{ color: "#10b981", fontSize: "0.85rem", textDecoration: "none" }}>← GSE</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Infrastructure <span style={{ color: "#10b981" }}>Funding</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>Sovereign infrastructure projects funded through on-chain bonds. Investors hold cryptographic bond positions backed by national governments.</p>
          </div>
        </section>

        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {PROJECTS.map((p) => (
                <div key={p.name} className="card" style={{ padding: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <h3 style={{ fontWeight: 700, margin: "0 0 4px", color: "#10b981" }}>{p.name}</h3>
                      <span style={{ color: "#64748b", fontSize: "0.8rem" }}>{p.nation}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700 }}>{p.raised} / {p.target}</div>
                      <div style={{ color: "#64748b", fontSize: "0.8rem" }}>{p.bonds} bond positions</div>
                    </div>
                  </div>
                  <div style={{ background: "#0f172a", borderRadius: 8, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${p.pct}%`, height: "100%", background: p.pct === 100 ? "#4ade80" : "#10b981", borderRadius: 8 }} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#64748b", textAlign: "right" }}>
                    {p.pct === 100 ? "✓ Fully funded" : `${p.pct}% funded`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
