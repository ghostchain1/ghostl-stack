"use client";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const TYPE_COLOR: Record<string,string> = {
  MARKET_MONITOR: "#f59e0b", RISK_ASSESSOR: "#ef4444", POLICY_ENGINE: "#8b5cf6",
  FRAUD_DETECTOR: "#ec4899", ORACLE_FEEDER: "#3b82f6", GOVERNANCE_AI: "#10b981",
  ECONOMIC_FORECASTER: "#06b6d4", SYSTEM_GUARDIAN: "#dc2626",
};

const AGENTS = [
  { id: "0xa1b2...c3d4", name: "ai.market-monitor",       type: "MARKET_MONITOR",       status: "ACTIVE",     decisions: 48291, score: 9720, since: "2026-01-10" },
  { id: "0xe5f6...g7h8", name: "ai.risk-assessor",        type: "RISK_ASSESSOR",        status: "ACTIVE",     decisions: 31045, score: 9650, since: "2026-01-10" },
  { id: "0xb9c0...d1e2", name: "ai.policy-engine",        type: "POLICY_ENGINE",        status: "ACTIVE",     decisions: 4821,  score: 9810, since: "2026-01-15" },
  { id: "0xf3g4...h5i6", name: "ai.fraud-detector",       type: "FRAUD_DETECTOR",       status: "ACTIVE",     decisions: 62100, score: 9890, since: "2026-01-20" },
  { id: "0xj7k8...l9m0", name: "ai.oracle-feeder",        type: "ORACLE_FEEDER",        status: "ACTIVE",     decisions: 129034,score: 9780, since: "2026-02-01" },
  { id: "0xn1o2...p3q4", name: "ai.governance",           type: "GOVERNANCE_AI",        status: "ACTIVE",     decisions: 892,   score: 9600, since: "2026-02-14" },
  { id: "0xr5s6...t7u8", name: "ai.gdp-forecaster",       type: "ECONOMIC_FORECASTER",  status: "ACTIVE",     decisions: 2041,  score: 9540, since: "2026-03-01" },
  { id: "0xv9w0...x1y2", name: "ai.system-guardian",      type: "SYSTEM_GUARDIAN",      status: "PENDING",    decisions: 0,     score: 0,    since: "2026-03-13" },
];

export default function AgentsPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#0a0508)" }}>
          <div className="container">
            <a href="/gsa" style={{ color: "#dc2626", fontSize: "0.85rem", textDecoration: "none" }}>← GSA</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              AI Agent <span style={{ color: "#dc2626" }}>Registry</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>All GhostBrain AI agents registered on GhostChain. Each agent is identified by a keccak256 hash of its name and carries an on-chain model hash for verifiability.</p>
          </div>
        </section>

        <section style={{ padding: "40px 24px 80px" }}>
          <div className="container">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b" }}>
                    {["Name", "Type", "Status", "Decisions", "Accuracy", "Active Since"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AGENTS.map((a) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #0f172a" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "#dc2626" }}>{a.name}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: (TYPE_COLOR[a.type]??"#94a3b8") + "22", color: TYPE_COLOR[a.type]??"#94a3b8", padding: "2px 10px", borderRadius: 10, fontSize: "0.75rem", fontWeight: 700 }}>{a.type}</span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: a.status === "ACTIVE" ? "#10b98122" : "#f59e0b22", color: a.status === "ACTIVE" ? "#10b981" : "#f59e0b", padding: "2px 10px", borderRadius: 10, fontSize: "0.75rem", fontWeight: 700 }}>
                          {a.status === "ACTIVE" ? "● ACTIVE" : "◌ PENDING"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#cbd5e1" }}>{a.decisions.toLocaleString()}</td>
                      <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>
                        {a.score > 0 ? `${(a.score / 100).toFixed(1)}%` : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#64748b" }}>{a.since}</td>
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
