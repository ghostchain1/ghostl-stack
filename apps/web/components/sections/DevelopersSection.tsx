export default function DevelopersSection() {
  const tools = [
    { name: "Ghost SDK",       desc: "Sovereign JavaScript SDK surface for wallets, contracts, and Ghost RPC access.",   cmd: "npm install @ghoststack/ghost-sdk" },
    { name: "Ghost DevTools",  desc: "Hardhat plugin for GRC contracts with Ghost-native compiler hooks.",        cmd: "npm install @ghoststack/ghost-devtools" },
    { name: "Ghost Registry",  desc: "Canonical chain IDs, RPC endpoints, and contract addresses for all GhostStack networks.",  cmd: "npm install @ghoststack/ghost-registry" },
    { name: "GRC Standards",   desc: "GRC20 / GRC721 / GRC1155 — Ghost-native token standards replacing ERC.",  cmd: "forge install ghostchain/grc-contracts" },
  ];

  return (
    <section id="developers" style={{ padding: "6rem 2rem", background: "#0A0A0A" }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "4rem" }}>
          <h2 style={{
            fontFamily: "'Orbitron','Inter',sans-serif",
            fontSize: "clamp(1.6rem, 4vw, 2.8rem)",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#FFD700",
            marginBottom: "1rem",
          }}>Build on GhostChain</h2>
          <p style={{ color: "#C0C0C0", maxWidth: "520px", margin: "0 auto", lineHeight: 1.7 }}>
            Sovereign-first developer tooling. Ghost-native from day one, with no upstream chain dependency in the app surface.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "1.5rem" }}>
          {tools.map(t => (
            <div key={t.name} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,215,0,0.18)",
              borderRadius: "12px",
              padding: "1.75rem",
            }}>
              <h3 style={{ color: "#FFD700", fontWeight: 700, fontSize: "1rem", marginBottom: "0.5rem" }}>{t.name}</h3>
              <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.65, marginBottom: "1rem" }}>{t.desc}</p>
              <code style={{
                display: "block",
                padding: "0.6rem 1rem",
                background: "#000",
                borderRadius: "6px",
                color: "#FFAA00",
                fontSize: "0.8rem",
                fontFamily: "'Fira Code', 'Menlo', monospace",
                borderLeft: "3px solid #FFD700",
              }}>{t.cmd}</code>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "1.5rem", marginTop: "3rem", justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/developers" className="ghost-btn-primary">Developer Portal</a>
          <a href="https://github.com/ghostmode25" target="_blank" rel="noopener noreferrer" className="ghost-btn-outline">GitHub ↗</a>
        </div>
      </div>
    </section>
  );
}
