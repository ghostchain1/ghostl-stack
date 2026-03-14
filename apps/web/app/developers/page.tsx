import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Developers | GhostChain",
  description: "Build on GhostChain — SDKs, RPC endpoints, testnet access, and developer tools for the sovereign AI blockchain.",
};

const TOOLS = [
  {
    name: "Ghost SDK",
    description: "TypeScript-first SDK for interacting with GhostChain, GhostL2, and smart contracts.",
    badge: "v2.4.1",
    install: "npm install @ghoststack/sdk",
    links: [["Docs", "#"], ["GitHub", "#"]],
  },
  {
    name: "Ghost DevTools",
    description: "Chrome extension providing real-time transaction tracing, storage inspection, and gas profiling.",
    badge: "Beta",
    install: "npx @ghoststack/devtools@latest",
    links: [["Install", "#"], ["Changelog", "#"]],
  },
  {
    name: "GhostFoundry",
    description: "Solidity toolchain optimised for GRC smart contract development with built-in GhostVM opcodes.",
    badge: "Stable",
    install: "curl -L https://foundry.ghostchain.io | bash",
    links: [["Docs", "#"], ["Book", "#"]],
  },
  {
    name: "Ghost CLI",
    description: "Command-line tool for managing nodes, deploying contracts, and interacting with GhostStack services.",
    badge: "v1.9.0",
    install: "npm install -g @ghoststack/cli",
    links: [["Reference", "#"], ["Plugins", "#"]],
  },
];

const NETWORKS = [
  { name: "GhostChain Mainnet",  chainId: "0x51",   rpc: "https://rpc.ghostchain.io",            explorer: "https://explorer.ghostchain.io" },
  { name: "GhostChain Testnet",  chainId: "0x52",   rpc: "https://testnet-rpc.ghostchain.io",     explorer: "https://testnet.explorer.ghostchain.io" },
  { name: "GhostL2 Mainnet",     chainId: "0x1051",  rpc: "https://l2-rpc.ghostchain.io",          explorer: "https://l2.explorer.ghostchain.io" },
  { name: "GhostL2 Testnet",     chainId: "0x1052",  rpc: "https://l2-testnet-rpc.ghostchain.io",  explorer: "https://l2-testnet.explorer.ghostchain.io" },
];

const STANDARDS = [
  { id: "GRC-20",  title: "Fungible Token Standard",       status: "Final" },
  { id: "GRC-721", title: "Non-Fungible Token Standard",   status: "Final" },
  { id: "GRC-1155", title: "Multi-Token Standard",         status: "Final" },
  { id: "GRC-4337", title: "Account Abstraction",          status: "Draft" },
  { id: "GRC-AI-1", title: "AI Agent On-Chain Registry",   status: "Draft" },
];

export default function DevelopersPage() {
  return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh", padding: "4rem 2rem", color: "#e2e8f0" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "4rem" }}>
          <p style={{ color: "#FFAA00", fontSize: "0.75rem", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
            Developer Portal
          </p>
          <h1 style={{
            fontFamily: "'Orbitron','Inter',sans-serif",
            fontSize: "clamp(2rem, 5vw, 3rem)",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: "#FFD700",
            textShadow: "0 0 24px rgba(255,215,0,0.5)",
            marginBottom: "1rem",
          }}>
            Build on GhostChain
          </h1>
          <p style={{ color: "#94a3b8", maxWidth: "520px", lineHeight: 1.7 }}>
            Everything you need to build on the sovereign AI blockchain. SDKs, RPC endpoints,
            developer tools, standards, and testnet faucets — all in one place.
          </p>
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <a href="#" className="ghost-btn-primary">Get Started →</a>
            <a href="#" className="ghost-btn-outline">View on GitHub</a>
          </div>
        </div>

        {/* Quickstart */}
        <div style={{ marginBottom: "4rem" }}>
          <h2 style={{ color: "#FFD700", fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "1rem", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1.25rem" }}>
            Quickstart
          </h2>
          <div style={{
            background: "#0d1117",
            border: "1px solid rgba(255,215,0,0.2)",
            borderRadius: "10px",
            padding: "1.25rem 1.5rem",
            fontFamily: "'Courier New', 'Fira Code', monospace",
            fontSize: "0.85rem",
            lineHeight: 1.9,
          }}>
            <div><span style={{ color: "#64748b" }}># Install the Ghost SDK</span></div>
            <div><span style={{ color: "#FFAA00" }}>npm install</span> <span style={{ color: "#FFD700" }}>@ghoststack/sdk</span></div>
            <div style={{ marginTop: "0.75rem" }}><span style={{ color: "#64748b" }}># Connect to GhostChain</span></div>
            <div><span style={{ color: "#C0C0C0" }}>{"import { GhostClient } from '@ghoststack/sdk';"}</span></div>
            <div><span style={{ color: "#C0C0C0" }}>{"const client = new GhostClient({ rpc: 'https://rpc.ghostchain.io' });"}</span></div>
            <div style={{ marginTop: "0.75rem" }}><span style={{ color: "#64748b" }}># Query latest block</span></div>
            <div><span style={{ color: "#C0C0C0" }}>{"const block = await client.getLatestBlock();"}</span></div>
          </div>
        </div>

        {/* Dev tools */}
        <h2 style={{ color: "#FFD700", fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "1rem", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1.25rem" }}>
          Developer Tools
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "4rem" }}>
          {TOOLS.map(t => (
            <div key={t.name} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,215,0,0.15)",
              borderRadius: "12px",
              padding: "1.25rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <span style={{ color: "#FFD700", fontWeight: 700, fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "0.9rem" }}>{t.name}</span>
                <span style={{
                  background: "rgba(255,215,0,0.15)",
                  color: "#FFD700",
                  fontSize: "0.65rem",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "999px",
                  letterSpacing: "0.05em",
                }}>{t.badge}</span>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "0.82rem", lineHeight: 1.6, marginBottom: "0.75rem" }}>{t.description}</p>
              <div style={{
                background: "#0d1117",
                borderRadius: "6px",
                padding: "0.5rem 0.75rem",
                fontFamily: "monospace",
                fontSize: "0.78rem",
                color: "#FFAA00",
                marginBottom: "0.75rem",
              }}>
                {t.install}
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                {t.links.map(([label, href]) => (
                  <a key={label} href={href} style={{ color: "#64748b", fontSize: "0.78rem", textDecoration: "none", borderBottom: "1px solid rgba(255,215,0,0.3)" }}>
                    {label} →
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Network endpoints */}
        <h2 style={{ color: "#FFD700", fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "1rem", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1.25rem" }}>
          RPC Endpoints
        </h2>
        <div style={{ border: "1px solid rgba(255,215,0,0.15)", borderRadius: "12px", overflow: "hidden", marginBottom: "4rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,215,0,0.08)" }}>
                {["Network", "Chain ID", "RPC URL", "Explorer"].map(h => (
                  <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NETWORKS.map((n, i) => (
                <tr key={n.name} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                  <td style={{ padding: "0.75rem 1rem", color: "#e2e8f0", fontSize: "0.85rem" }}>{n.name}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#FFAA00", fontSize: "0.82rem", fontFamily: "monospace" }}>{n.chainId}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8", fontSize: "0.78rem", fontFamily: "monospace" }}>{n.rpc}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <a href={n.explorer} style={{ color: "#FFD700", fontSize: "0.78rem" }} target="_blank" rel="noopener noreferrer">
                      Explorer ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* GRC Standards */}
        <h2 style={{ color: "#FFD700", fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "1rem", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1.25rem" }}>
          GRC Standards
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {STANDARDS.map(s => (
            <div key={s.id} style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,215,0,0.12)",
              borderRadius: "8px",
              padding: "0.75rem 1rem",
            }}>
              <span style={{ color: "#FFD700", fontFamily: "monospace", fontSize: "0.85rem", minWidth: "70px", fontWeight: 700 }}>{s.id}</span>
              <span style={{ color: "#e2e8f0", fontSize: "0.85rem", flex: 1 }}>{s.title}</span>
              <span style={{
                fontSize: "0.68rem",
                padding: "0.2rem 0.6rem",
                borderRadius: "999px",
                background: s.status === "Final" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                color: s.status === "Final" ? "#10b981" : "#f59e0b",
                letterSpacing: "0.05em",
              }}>{s.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
