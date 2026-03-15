"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const endpoints = [
  { layer: "L1 — GhostChain", rpc: "https://rpc.ghostchain.cloud", chain: 1337, currency: "GST" },
  { layer: "L2 — GhostRollup", rpc: "https://l2rpc.ghostchain.cloud", chain: 13370, currency: "GST" },
  { layer: "L3 — GhostVM", rpc: "https://l3rpc.ghostchain.cloud", chain: 133700, currency: "GST" },
];

const sdks = [
  { name: "ghost.js", desc: "TypeScript/JavaScript SDK for all Ghost layers", href: "https://dev.ghostchain.cloud/sdk/ghostjs" },
  { name: "ghost-py", desc: "Python SDK with async support and type stubs", href: "https://dev.ghostchain.cloud/sdk/ghostpy" },
  { name: "ghost-rs", desc: "Rust crate for low-latency integrations", href: "https://dev.ghostchain.cloud/sdk/ghostrs" },
  { name: "ghost-go", desc: "Go module compatible with all Ghost RPC endpoints", href: "https://dev.ghostchain.cloud/sdk/ghostgo" },
];

const codeSnippet = `import { GhostClient } from "ghost.js";

const client = new GhostClient({
  rpc: "https://rpc.ghostchain.cloud",
  layer: 1,
});

const block = await client.getLatestBlock();
console.log(block.number, block.hash);

const balance = await client.getBalance("0xYourAddress");
console.log("GST balance:", balance);`;

export default function DevPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "API Docs", href: "https://dev.ghostchain.cloud/docs" }} />
      <main>
        {/* Hero */}
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">Developer Hub</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,4rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              Build on <span style={{ color: "#FFAA00" }}>Ghost</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 620, margin: "0 auto 40px", fontSize: "1.1rem" }}>
              Multi-layer RPC, EVM-compatible tooling, AI-native contracts, and SDKs for every environment. Ship faster with GhostStack.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/docs/quickstart" className="btn-primary">Quickstart Guide</a>
              <a href="/grants" className="btn-secondary">Apply for Grants</a>
            </div>
          </div>
        </section>

        {/* RPC Endpoints */}
        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 32, textAlign: "center" }}>RPC Endpoints</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b" }}>
                    <th style={{ textAlign: "left", padding: "12px 16px", color: "#94a3b8" }}>Layer</th>
                    <th style={{ textAlign: "left", padding: "12px 16px", color: "#94a3b8" }}>RPC URL</th>
                    <th style={{ textAlign: "left", padding: "12px 16px", color: "#94a3b8" }}>Chain ID</th>
                    <th style={{ textAlign: "left", padding: "12px 16px", color: "#94a3b8" }}>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((ep, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #0f172a" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 600 }}>{ep.layer}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <code style={{ color: "#FFD700", background: "#0f172a", padding: "2px 8px", borderRadius: 4 }}>{ep.rpc}</code>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8" }}>{ep.chain}</td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8" }}>{ep.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Code example */}
        <section style={{ padding: "60px 24px", background: "#0A0A0A" }}>
          <div className="container" style={{ maxWidth: 800 }}>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 24, textAlign: "center" }}>Get started in 30 seconds</h2>
            <pre style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "28px 32px", overflowX: "auto", fontSize: "0.88rem", lineHeight: 1.7, color: "#e2e8f0" }}><code>{codeSnippet}</code></pre>
          </div>
        </section>

        {/* SDKs */}
        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 32, textAlign: "center" }}>SDKs & Libraries</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 20 }}>
              {sdks.map((sdk) => (
                <a key={sdk.name} href={sdk.href} className="card" style={{ textDecoration: "none", display: "block" }}>
                  <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#FFAA00", marginBottom: 8 }}>{sdk.name}</div>
                  <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>{sdk.desc}</div>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Grants CTA */}
        <section style={{ padding: "80px 24px", textAlign: "center", background: "linear-gradient(135deg,#0A0A0A 0%,#0d0a1a 100%)" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 16 }}>Ghost Builder Grants</h2>
            <p style={{ color: "#94a3b8", marginBottom: 32, maxWidth: 520, margin: "0 auto 32px" }}>Up to $50,000 in GST for projects that enrich the GhostChain ecosystem. Applications reviewed on a rolling basis.</p>
            <a href="/grants" className="btn-primary">Apply Now</a>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
