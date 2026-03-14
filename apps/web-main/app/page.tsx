"use client";
import Link from "next/link";
import { PublicNavbar } from "@ghostl/ui";
import { PublicFooter } from "@ghostl/ui";

const layers = [
  { id: "L1", name: "GhostChain", desc: "Sovereign proof-of-authority L1 with IBFT consensus. 5-second finality, 2000+ TPS.", color: "#00F0FF" },
  { id: "L2", name: "GhostL2",    desc: "Optimistic rollup layer. 10x throughput. EVM-compatible smart contracts.", color: "#7A00FF" },
  { id: "L3", name: "GhostL3",    desc: "Application-specific rollup. 100,000+ TPS for high-frequency workloads.", color: "#FF6B6B" },
];

const features = [
  { icon: "⬡", title: "AI-Powered Governance",  desc: "GhostBrain AI autonomously monitors, proposes, and executes governance decisions on-chain." },
  { icon: "◈", title: "Multi-Layer Architecture", desc: "L1 + L2 + L3 stack provides 100,000+ TPS with sub-second finality at the app layer." },
  { icon: "⬜", title: "Self-Healing Network",    desc: "Autonomous agent network detects anomalies, routes around failures, and self-repairs." },
  { icon: "◎", title: "Zero-Knowledge Privacy",   desc: "Native ZK proofs for privacy-preserving transactions and confidential smart contracts." },
  { icon: "◆", title: "Treasury Autonomy",        desc: "On-chain treasury managed by AI agents with constitutional guardrails and DAO oversight." },
  { icon: "⌘", title: "Instant Finality",         desc: "IBFT consensus on L1 gives deterministic 5-second block finality — no probabilistic wait." },
];

const ecosystem = [
  { name: "invest.ghostchain.cloud",     label: "Investor Portal",   desc: "Treasury & tokenomics" },
  { name: "dev.ghostchain.cloud",        label: "Developer Portal",  desc: "SDK, RPC, grants" },
  { name: "apps.ghostchain.cloud",       label: "Ecosystem Apps",    desc: "DApps directory" },
  { name: "explorer.ghostchain.cloud",   label: "Block Explorer",    desc: "L1 / L2 / L3 explorer" },
  { name: "governance.ghostchain.cloud", label: "Governance",        desc: "DAO, proposals, voting" },
  { name: "nodes.ghostchain.cloud",      label: "Node Operators",    desc: "Validator setup & rewards" },
  { name: "exchange.ghostchain.cloud",   label: "Exchange",          desc: "Institutional OTC" },
  { name: "status.ghostchain.cloud",     label: "Status",            desc: "Network health" },
];

export default function Home() {
  return (
    <>
      <PublicNavbar cta={{ label: "Launch App →", href: "https://portal.ghostchain.cloud" }} />

      {/* Hero */}
      <section style={{ padding: "7rem 1.5rem 5rem", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% -10%, #00F0FF08, transparent)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 860, margin: "0 auto", position: "relative" }}>
          <div className="tag" style={{ marginBottom: "1.5rem" }}>Mainnet Live — L1 · L2 · L3</div>
          <h1 style={{ fontSize: "clamp(2.5rem,6vw,4.5rem)", fontWeight: 800, marginBottom: "1.5rem" }}>
            The Sovereign<br />
            <span style={{ background: "linear-gradient(135deg,#00F0FF,#7A00FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              AI Blockchain
            </span>
          </h1>
          <p style={{ fontSize: "1.25rem", color: "var(--text-muted)", maxWidth: 600, margin: "0 auto 2.5rem", lineHeight: 1.7 }}>
            GhostChain is a fully autonomous, multi-layer blockchain ecosystem powered by AI governance,
            zero-knowledge cryptography, and self-healing infrastructure.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link className="btn-primary" href="/ecosystem">Explore Ecosystem →</Link>
            <Link className="btn-secondary" href="https://dev.ghostchain.cloud/docs">Developer Docs</Link>
          </div>
          <div style={{ marginTop: "3.5rem", display: "flex", gap: "2.5rem", justifyContent: "center", flexWrap: "wrap" }}>
            {[["2,000+","TPS L1"],["100,000+","TPS L3"],["5s","Finality"],["3","Layers"]].map(([v,l]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "#00F0FF" }}>{v}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Layers */}
      <section style={{ padding: "5rem 1.5rem" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <div className="tag" style={{ marginBottom: "1rem" }}>Architecture</div>
            <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 700 }}>Three Layers. One Ecosystem.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1.5rem" }}>
            {layers.map(l => (
              <div key={l.id} className="card" style={{ borderColor: l.color + "33" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                  <span style={{ background: l.color + "22", border: "1px solid " + l.color + "44", color: l.color, padding: "0.25rem 0.75rem", borderRadius: 8, fontWeight: 700, fontSize: "0.875rem" }}>{l.id}</span>
                  <span style={{ fontSize: "1.125rem", fontWeight: 600 }}>{l.name}</span>
                </div>
                <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>{l.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "5rem 1.5rem", background: "linear-gradient(180deg,transparent,#0d0e1488)" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <div className="tag" style={{ marginBottom: "1rem" }}>Technology</div>
            <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 700 }}>Built for the Next Era</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "1.5rem" }}>
            {features.map(f => (
              <div key={f.title} className="card">
                <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>{f.icon}</div>
                <h3 style={{ fontSize: "1.0625rem", fontWeight: 600, marginBottom: "0.5rem" }}>{f.title}</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.9375rem", lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ecosystem */}
      <section style={{ padding: "5rem 1.5rem" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 700 }}>The GhostChain Ecosystem</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "1rem" }}>
            {ecosystem.map(e => (
              <a key={e.name} href={"https://" + e.name} className="card" style={{ textDecoration: "none", display: "block", cursor: "pointer" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{e.label}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>{e.desc}</div>
                <div style={{ color: "#00F0FF99", fontSize: "0.75rem" }}>{e.name} →</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "6rem 1.5rem", textAlign: "center" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 700, marginBottom: "1rem" }}>
            Ready to Build on GhostChain?
          </h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem", lineHeight: 1.7 }}>
            Access grants, SDKs, devnet faucet, and full documentation. The GhostChain ecosystem is open.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link className="btn-primary" href="https://dev.ghostchain.cloud">Start Building →</Link>
            <Link className="btn-secondary" href="https://dev.ghostchain.cloud/grants">Apply for Grant</Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </>
  );
}
