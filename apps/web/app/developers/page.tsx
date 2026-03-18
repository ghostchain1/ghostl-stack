import { GHOST_RPC_ENDPOINTS, GHOST_SITES } from "@ghostchain/config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Developers | GhostChain",
  description: "Build on GhostChain with Ghost-native SDKs, branded RPC endpoints, and production tooling for the sovereign AI blockchain.",
};

const TOOLS = [
  {
    name: "Ghost SDK Core",
    description: "Preferred native Ghost SDK for GhostChain, GhostL2, and GhostL3 integrations.",
    badge: "Preferred",
    install: "npm install @ghostchain/ghost-sdk-core",
    links: [["Documentation", GHOST_SITES.docs.url], ["RPC Portal", GHOST_SITES.rpc.url]],
  },
  {
    name: "Ghost SDK",
    description: "Compatibility SDK for existing integrations that still need the broader wrapper surface.",
    badge: "Compat",
    install: "npm install @ghostchain/sdk",
    links: [["Docs", GHOST_SITES.docs.url], ["Portal", GHOST_SITES.dev.url]],
  },
  {
    name: "Ghost CLI",
    description: "Command-line tooling for chain operations, contract workflows, and GhostStack infrastructure tasks.",
    badge: "Stable",
    install: "npm install -g @ghostchain/ghoststack-cli",
    links: [["Reference", GHOST_SITES.docs.url], ["Developer Portal", GHOST_SITES.dev.url]],
  },
];

const NETWORKS = [
  {
    name: "GhostChain L1",
    chainId: `0x${GHOST_RPC_ENDPOINTS.l1.chainId.toString(16)}`,
    rpc: GHOST_RPC_ENDPOINTS.l1.publicUrl,
    explorer: GHOST_RPC_ENDPOINTS.l1.explorerUrl,
  },
  {
    name: "GhostL2",
    chainId: `0x${GHOST_RPC_ENDPOINTS.l2.chainId.toString(16)}`,
    rpc: GHOST_RPC_ENDPOINTS.l2.publicUrl,
    explorer: GHOST_RPC_ENDPOINTS.l2.explorerUrl,
  },
  {
    name: "GhostL3",
    chainId: `0x${GHOST_RPC_ENDPOINTS.l3.chainId.toString(16)}`,
    rpc: GHOST_RPC_ENDPOINTS.l3.publicUrl,
    explorer: GHOST_RPC_ENDPOINTS.l3.explorerUrl,
  },
];

const STANDARDS = [
  { id: "GRC-20", title: "Fungible Token Standard", status: "Final" },
  { id: "GRC-721", title: "Non-Fungible Token Standard", status: "Final" },
  { id: "GRC-1155", title: "Multi-Token Standard", status: "Final" },
  { id: "GRC-4337", title: "Account Abstraction", status: "Draft" },
  { id: "GRC-AI-1", title: "AI Agent On-Chain Registry", status: "Draft" },
];

export default function DevelopersPage() {
  return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh", padding: "4rem 2rem", color: "#e2e8f0" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        <div style={{ marginBottom: "4rem" }}>
          <p style={{ color: "#FFAA00", fontSize: "0.75rem", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
            Developer Portal
          </p>
          <h1
            style={{
              fontFamily: "'Orbitron','Inter',sans-serif",
              fontSize: "clamp(2rem, 5vw, 3rem)",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "#FFD700",
              textShadow: "0 0 24px rgba(255,215,0,0.5)",
              marginBottom: "1rem",
            }}
          >
            Build on GhostChain
          </h1>
          <p style={{ color: "#94a3b8", maxWidth: "560px", lineHeight: 1.7 }}>
            Everything you need to ship on the sovereign AI blockchain: Ghost-native SDKs, branded RPC endpoints,
            GRC standards, and production-ready infrastructure references.
          </p>
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <a href={GHOST_SITES.docs.url} className="ghost-btn-primary">Open Docs →</a>
            <a href={GHOST_SITES.dev.url} className="ghost-btn-outline">Developer Portal</a>
          </div>
        </div>

        <div style={{ marginBottom: "4rem" }}>
          <h2 style={{ color: "#FFD700", fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "1rem", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1.25rem" }}>
            Quickstart
          </h2>
          <div
            style={{
              background: "#0d1117",
              border: "1px solid rgba(255,215,0,0.2)",
              borderRadius: "10px",
              padding: "1.25rem 1.5rem",
              fontFamily: "'Courier New', 'Fira Code', monospace",
              fontSize: "0.85rem",
              lineHeight: 1.9,
            }}
          >
            <div><span style={{ color: "#64748b" }}># Install the preferred Ghost SDK</span></div>
            <div><span style={{ color: "#FFAA00" }}>npm install</span> <span style={{ color: "#FFD700" }}>@ghostchain/ghost-sdk-core</span></div>
            <div style={{ marginTop: "0.75rem" }}><span style={{ color: "#64748b" }}># Connect to GhostChain L1</span></div>
            <div><span style={{ color: "#C0C0C0" }}>{"import { createGhostProvider } from '@ghostchain/ghost-sdk-core';"}</span></div>
            <div><span style={{ color: "#C0C0C0" }}>{`const provider = createGhostProvider({ rpcUrl: '${GHOST_RPC_ENDPOINTS.l1.publicUrl}', chainId: ${GHOST_RPC_ENDPOINTS.l1.chainId} });`}</span></div>
            <div style={{ marginTop: "0.75rem" }}><span style={{ color: "#64748b" }}># Query the latest block with the Ghost RPC namespace</span></div>
            <div><span style={{ color: "#C0C0C0" }}>{"const block = await provider.ghost_getBlockByNumber('latest', false);"}</span></div>
          </div>
        </div>

        <h2 style={{ color: "#FFD700", fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "1rem", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1.25rem" }}>
          Developer Tools
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "4rem" }}>
          {TOOLS.map((tool) => (
            <div
              key={tool.name}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,215,0,0.15)",
                borderRadius: "12px",
                padding: "1.25rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <span style={{ color: "#FFD700", fontWeight: 700, fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "0.9rem" }}>{tool.name}</span>
                <span
                  style={{
                    background: "rgba(255,215,0,0.15)",
                    color: "#FFD700",
                    fontSize: "0.65rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "999px",
                    letterSpacing: "0.05em",
                  }}
                >
                  {tool.badge}
                </span>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "0.82rem", lineHeight: 1.6, marginBottom: "0.75rem" }}>{tool.description}</p>
              <div
                style={{
                  background: "#0d1117",
                  borderRadius: "6px",
                  padding: "0.5rem 0.75rem",
                  fontFamily: "monospace",
                  fontSize: "0.78rem",
                  color: "#FFAA00",
                  marginBottom: "0.75rem",
                }}
              >
                {tool.install}
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                {tool.links.map(([label, href]) => (
                  <a key={label} href={href} style={{ color: "#64748b", fontSize: "0.78rem", textDecoration: "none", borderBottom: "1px solid rgba(255,215,0,0.3)" }}>
                    {label} →
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ color: "#FFD700", fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "1rem", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1.25rem" }}>
          RPC Endpoints
        </h2>
        <div style={{ border: "1px solid rgba(255,215,0,0.15)", borderRadius: "12px", overflow: "hidden", marginBottom: "4rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,215,0,0.08)" }}>
                {["Network", "Chain ID", "RPC URL", "Explorer"].map((heading) => (
                  <th key={heading} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NETWORKS.map((network, index) => (
                <tr key={network.name} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: index % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                  <td style={{ padding: "0.75rem 1rem", color: "#e2e8f0", fontSize: "0.85rem" }}>{network.name}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#FFAA00", fontSize: "0.82rem", fontFamily: "monospace" }}>{network.chainId}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8", fontSize: "0.78rem", fontFamily: "monospace" }}>{network.rpc}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <a href={network.explorer} style={{ color: "#FFD700", fontSize: "0.78rem" }} target="_blank" rel="noopener noreferrer">
                      GhostScan ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 style={{ color: "#FFD700", fontFamily: "'Orbitron','Inter',sans-serif", fontSize: "1rem", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1.25rem" }}>
          GRC Standards
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {STANDARDS.map((standard) => (
            <div
              key={standard.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,215,0,0.12)",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
              }}
            >
              <span style={{ color: "#FFD700", fontFamily: "monospace", fontSize: "0.85rem", minWidth: "70px", fontWeight: 700 }}>{standard.id}</span>
              <span style={{ color: "#e2e8f0", fontSize: "0.85rem", flex: 1 }}>{standard.title}</span>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "999px",
                  background: standard.status === "Final" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                  color: standard.status === "Final" ? "#10b981" : "#f59e0b",
                  letterSpacing: "0.05em",
                }}
              >
                {standard.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
