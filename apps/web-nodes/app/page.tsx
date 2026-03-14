"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const steps = [
  { n: "01", title: "Acquire GST", desc: "You need a minimum of 100,000 GST to participate as a validator. Delegated staking available for smaller holders." },
  { n: "02", title: "Set up your node", desc: "Run GhostNode on Linux (Ubuntu 22.04+ recommended). Download the binary or use Docker with our official image." },
  { n: "03", title: "Configure & sync", desc: "Point your node to ghostchain.cloud seed nodes. Sync takes roughly 4–6 hours on a standard server." },
  { n: "04", title: "Register on-chain", desc: "Submit your validator registration transaction with your commission rate and commission max change rate." },
  { n: "05", title: "Earn rewards", desc: "Once selected into the active set, you earn transaction fees and block rewards proportional to your stake." },
];

const requirements = [
  { label: "Min Stake", value: "100,000 GST" },
  { label: "CPU", value: "8 vCPU" },
  { label: "RAM", value: "32 GB" },
  { label: "Storage", value: "2 TB NVMe SSD" },
  { label: "Network", value: "1 Gbps up/down" },
  { label: "Uptime SLA", value: "99.5%" },
];

export default function NodesPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Run a Node", href: "/setup" }} />
      <main>
        {/* Hero */}
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#07060e 0%,#050507 100%)" }}>
          <div className="container">
            <span className="tag">Validator Network</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,4rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              Secure <span style={{ color: "#00F0FF" }}>GhostChain</span>.<br />Earn GST.
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600, margin: "0 auto 40px", fontSize: "1.1rem" }}>
              Run a validator node and help secure the Ghost network. Earn up to 12% APY in GST rewards plus transaction fees.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/setup" className="btn-primary">Start Setup</a>
              <a href="/docs/validators" className="btn-secondary">Validator Docs</a>
            </div>
          </div>
        </section>

        {/* Requirements */}
        <section style={{ padding: "60px 24px", background: "#07060e" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 32, textAlign: "center" }}>Minimum Requirements</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16, maxWidth: 900, margin: "0 auto" }}>
              {requirements.map((r) => (
                <div key={r.label} className="card" style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#00F0FF", marginBottom: 6 }}>{r.value}</div>
                  <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{r.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Setup steps */}
        <section style={{ padding: "60px 24px" }}>
          <div className="container" style={{ maxWidth: 760 }}>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 40, textAlign: "center" }}>How to become a validator</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {steps.map((s) => (
                <div key={s.n} style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid #00F0FF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#00F0FF", fontSize: "0.9rem", flexShrink: 0 }}>{s.n}</div>
                  <div className="card" style={{ flex: 1 }}>
                    <h3 style={{ fontWeight: 700, marginBottom: 6 }}>{s.title}</h3>
                    <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Reward calculator stub */}
        <section style={{ padding: "60px 24px", background: "#07060e", textAlign: "center" }}>
          <div className="container" style={{ maxWidth: 600 }}>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 12 }}>Reward Calculator</h2>
            <p style={{ color: "#94a3b8", marginBottom: 32 }}>Estimate your validator yield based on stake size and network participation.</p>
            <div className="card">
              <p style={{ color: "#64748b", fontStyle: "italic" }}>Interactive calculator launching with mainnet. Check back soon.</p>
              <a href="/docs/validator-rewards" className="btn-secondary" style={{ marginTop: 20, display: "inline-block" }}>Read reward formula →</a>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
