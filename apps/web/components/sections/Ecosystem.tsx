/**
 * Ecosystem architecture section — visual hierarchy of GhostStack layers.
 */
export default function EcosystemSection() {
  const layers = [
    {
      label: "GhostL3 Apps",
      items: ["GhostSwap", "GhostNFT", "GhostPay", "Lit Vyb Live"],
      color: "#C0C0C0",
    },
    {
      label: "GhostL2 Exchange",
      items: ["GhostXchange", "Liquidity Engine", "Cross‑chain Bridge"],
      color: "#FFAA00",
    },
    {
      label: "GhostChain L1 Treasury & Settlement",
      items: ["GRC20 / GRC721 / GRC1155", "Validator Network", "Ghost Token (GST)", "On‑chain Governance"],
      color: "#FFD700",
    },
  ];

  return (
    <section style={{ padding: "6rem 2rem", background: "#0A0A0A", position: "relative", overflow: "hidden" }}>
      {/* subtle grid background */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(255,215,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,0,0.04) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }} />

      <div style={{ maxWidth: "900px", margin: "0 auto", position: "relative" }}>
        <h2 style={{
          fontFamily: "'Orbitron','Inter',sans-serif",
          fontSize: "clamp(1.6rem, 4vw, 2.8rem)",
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#FFD700",
          textAlign: "center",
          marginBottom: "0.75rem",
        }}>GhostStack Ecosystem</h2>
        <p style={{ color: "#C0C0C0", textAlign: "center", marginBottom: "4rem", fontSize: "1rem" }}>
          A unified sovereign AI blockchain architecture — L1 to L3
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0", alignItems: "center" }}>
          {layers.map((layer, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
              {/* connector */}
              {i > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "0" }}>
                  {[...Array(4)].map((_, j) => (
                    <div key={j} style={{
                      width: 2, height: 8,
                      background: `rgba(255,215,0,${0.3 + j * 0.15})`,
                      marginBottom: 2,
                    }} />
                  ))}
                  <div style={{ color: "#FFD700", fontSize: "1.4rem" }}>▲</div>
                </div>
              )}

              {/* Layer card */}
              <div style={{
                width: `${100 - i * 10}%`,
                maxWidth: 780,
                background: `rgba(255,215,0,0.04)`,
                border: `1px solid ${layer.color}40`,
                borderRadius: "12px",
                padding: "1.5rem 2rem",
                boxShadow: `0 0 24px ${layer.color}18`,
                textAlign: "center",
              }}>
                <div style={{ color: layer.color, fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
                  {layer.label}
                </div>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
                  {layer.items.map(item => (
                    <span key={item} style={{
                      padding: "0.25rem 0.75rem",
                      background: `${layer.color}12`,
                      border: `1px solid ${layer.color}30`,
                      borderRadius: "999px",
                      color: "#e2e8f0",
                      fontSize: "0.8rem",
                    }}>{item}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
