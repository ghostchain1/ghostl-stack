export default function GhostBrainSection() {
  const features = [
    { icon: "🧠", title: "AI Node Monitoring",    desc: "Real-time health tracking across all 21 GhostBrain services with predictive failure detection." },
    { icon: "⚡", title: "Predictive Infrastructure", desc: "Self-healing nodes that auto-repair before failures cascade across the validator network." },
    { icon: "🗳️", title: "Autonomous Governance", desc: "AI advisory proposals submitted on-chain with validator consensus enforcement." },
    { icon: "🛡️", title: "Attack Detection",     desc: "GhostBrain monitors mempool patterns and validator behavior for coordinated threat signals." },
    { icon: "⛽", title: "Gas Optimization",      desc: "Dynamic fee modeling driven by AI load predictions across L1, L2, and L3 layers." },
    { icon: "🔗", title: "Interchain Intelligence", desc: "Cross-chain state awareness enabling seamless bridging and liquidity routing." },
  ];

  return (
    <section style={{
      padding: "6rem 2rem",
      background: "linear-gradient(180deg, #0A0A0A 0%, #0d0d1a 100%)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* neural net background SVG */}
      <svg aria-hidden viewBox="0 0 800 400" style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        opacity: 0.04, pointerEvents: "none",
      }}>
        {[...Array(8)].map((_, i) => (
          <circle key={`n${i}`} cx={80 + i * 100} cy={150 + Math.sin(i) * 80} r="6" fill="#FFD700" />
        ))}
        {[...Array(7)].map((_, i) => (
          <line key={`l${i}`}
            x1={80 + i * 100} y1={150 + Math.sin(i) * 80}
            x2={80 + (i+1) * 100} y2={150 + Math.sin(i+1) * 80}
            stroke="#FFD700" strokeWidth="1.5" />
        ))}
      </svg>

      <div style={{ maxWidth: "1100px", margin: "0 auto", position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: "4rem" }}>
          <div style={{ color: "#FFAA00", fontSize: "0.8rem", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
            Powered by GhostBrain
          </div>
          <h2 style={{
            fontFamily: "'Orbitron','Inter',sans-serif",
            fontSize: "clamp(1.6rem, 4vw, 2.8rem)",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#FFD700",
            marginBottom: "1rem",
          }}>Autonomous AI Infrastructure</h2>
          <p style={{ color: "#C0C0C0", maxWidth: "560px", margin: "0 auto", lineHeight: 1.7 }}>
            GhostBrain operates the entire GhostStack autonomously — monitoring, healing,
            governing, and optimizing without human intervention.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1.5rem",
        }}>
          {features.map(f => (
            <div key={f.title} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,215,0,0.18)",
              borderRadius: "12px",
              padding: "1.75rem",
              backdropFilter: "blur(20px)",
              transition: "box-shadow 0.3s, border-color 0.3s",
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 24px rgba(255,215,0,0.18)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,215,0,0.4)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,215,0,0.18)";
              }}
            >
              <div style={{ fontSize: "1.8rem", marginBottom: "0.75rem" }}>{f.icon}</div>
              <h3 style={{ color: "#FFD700", fontWeight: 700, fontSize: "1rem", marginBottom: "0.5rem" }}>{f.title}</h3>
              <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
