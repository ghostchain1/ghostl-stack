"use client";

import dynamic from "next/dynamic";

const GST3D = dynamic(() => import("../token/GST3D"), { ssr: false });

interface Stat {
  label: string;
  value: string;
  sub?: string;
}

const STATS: Stat[] = [
  { label: "Total Supply",        value: "1,000,000,000 GST" },
  { label: "Validator Rewards",   value: "25%",  sub: "of annual emissions" },
  { label: "Treasury",            value: "30%",  sub: "ecosystem fund" },
  { label: "Burn Mechanism",      value: "2% / tx", sub: "deflationary" },
  { label: "Community",           value: "45%",  sub: "staking + grants" },
];

export default function TokenSection() {
  return (
    <section id="token" style={{
      padding: "6rem 2rem",
      background: "#0f0f0f",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "5rem",
      flexWrap: "wrap",
    }}>
      {/* 3D Coin */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
        <div style={{ filter: "drop-shadow(0 0 40px rgba(255,215,0,0.55))" }}>
          <GST3D size={300} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "1.8rem", fontWeight: 800, color: "#FFD700", letterSpacing: "0.12em" }}>
            GST
          </div>
          <div style={{ color: "#C0C0C0", fontSize: "0.85rem", letterSpacing: "0.06em", marginTop: "0.25rem" }}>Ghost Token</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ maxWidth: 400 }}>
        <h2 style={{
          fontFamily: "'Orbitron','Inter',sans-serif",
          fontSize: "clamp(1.6rem, 4vw, 2.4rem)",
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#FFD700",
          marginBottom: "0.5rem",
        }}>Ghost Token</h2>
        <p style={{ color: "#C0C0C0", marginBottom: "2.5rem", lineHeight: 1.7, fontSize: "0.95rem" }}>
          GST powers every transaction, governance vote, validator reward,
          and AI computation fee across the GhostStack ecosystem.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {STATS.map(s => (
            <div key={s.label} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.9rem 1.2rem",
              background: "rgba(255,215,0,0.04)",
              border: "1px solid rgba(255,215,0,0.18)",
              borderRadius: "8px",
            }}>
              <span style={{ color: "#C0C0C0", fontSize: "0.85rem" }}>{s.label}</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#FFD700", fontWeight: 700, fontSize: "0.95rem" }}>{s.value}</div>
                {s.sub && <div style={{ color: "#FFAA00", fontSize: "0.7rem", marginTop: "0.1rem" }}>{s.sub}</div>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "1rem", marginTop: "2.5rem", flexWrap: "wrap" }}>
          <a href="/token" className="ghost-btn-primary">Tokenomics</a>
          <a href="/governance" className="ghost-btn-outline">Governance</a>
        </div>
      </div>
    </section>
  );
}
