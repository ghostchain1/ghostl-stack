"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const mockNations = [
  { name: "United States",   iso: "USA", gdp: "27,360",  period: "2026-Q1", growth: "+2.4%" },
  { name: "European Union",  iso: "EUR", gdp: "18,930",  period: "2026-Q1", growth: "+1.8%" },
  { name: "Japan",           iso: "JPN", gdp: "4,210",   period: "2026-Q1", growth: "+0.9%" },
  { name: "India",           iso: "IND", gdp: "3,940",   period: "2026-Q1", growth: "+6.8%" },
  { name: "United Kingdom",  iso: "GBR", gdp: "3,131",   period: "2026-Q1", growth: "+1.2%" },
];

export default function GDPPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#050507)" }}>
          <div className="container">
            <a href="/gse" style={{ color: "#10b981", fontSize: "0.85rem", textDecoration: "none" }}>← GSE</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              GDP <span style={{ color: "#10b981" }}>Dashboard</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600, fontSize: "1rem" }}>
              On-chain sovereign GDP records submitted by registered nations. All values in billions USD.
            </p>
          </div>
        </section>

        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b" }}>
                    {["Nation", "ISO", "GDP (B USD)", "Period", "Growth"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mockNations.map((n) => (
                    <tr key={n.iso} style={{ borderBottom: "1px solid #0f172a" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 600 }}>{n.name}</td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8" }}>{n.iso}</td>
                      <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>${n.gdp}B</td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8" }}>{n.period}</td>
                      <td style={{ padding: "12px 16px", color: "#4ade80" }}>{n.growth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
