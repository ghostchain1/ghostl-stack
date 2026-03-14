"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const PROPOSALS = [
  { id: 1, title: "Increase GSX Reserve Ratio to 12%",           type: "PARAMETER_CHANGE", agent: "ai.policy-engine", for: 7200, against: 800,  deadline: "2026-03-20", status: "active" },
  { id: 2, title: "Activate ai.system-guardian Agent",           type: "AGENT_ACTIVATION", agent: "ai.governance",   for: 5000, against: 0,    deadline: "2026-03-16", status: "active" },
  { id: 3, title: "Lower GCM Interest Rate by 25bps",            type: "POLICY_UPDATE",    agent: "ai.policy-engine", for: 6800, against: 2200, deadline: "2026-03-15", status: "active" },
  { id: 4, title: "Emergency: Freeze Suspicious Institution",    type: "EMERGENCY_ACTION", agent: "ai.fraud-detector",for: 9200, against: 0,    deadline: "2026-03-13", status: "executed" },
  { id: 5, title: "Upgrade GSR Oracle Contract v1.2",            type: "SYSTEM_UPGRADE",   agent: null,               for: 4100, against: 900,  deadline: "2025-12-01", status: "executed" },
];

const TYPE_COLOR: Record<string,string> = {
  PARAMETER_CHANGE: "#f59e0b", AGENT_ACTIVATION: "#10b981", POLICY_UPDATE: "#8b5cf6",
  EMERGENCY_ACTION: "#ef4444", SYSTEM_UPGRADE: "#3b82f6",
};

export default function GovernancePage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#0a0508)" }}>
          <div className="container">
            <a href="/gsa" style={{ color: "#dc2626", fontSize: "0.85rem", textDecoration: "none" }}>← GSA</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              AI <span style={{ color: "#dc2626" }}>Governance</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>AI-proposed policies, parameter changes, and system upgrades. Votes are weighted by GSA staking power. Emergency actions require only 10% quorum.</p>
          </div>
        </section>

        <section style={{ padding: "40px 24px 80px" }}>
          <div className="container">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {PROPOSALS.map((p) => {
                const total = p.for + p.against;
                const forPct = total ? Math.round((p.for / total) * 100) : 0;
                return (
                  <div key={p.id} className="card" style={{ padding: "20px 24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ background: (TYPE_COLOR[p.type]??"#94a3b8") + "22", color: TYPE_COLOR[p.type]??"#94a3b8", padding: "2px 10px", borderRadius: 10, fontSize: "0.75rem", fontWeight: 700 }}>{p.type}</span>
                        <h3 style={{ margin: 0, fontWeight: 700, fontSize: "1rem" }}>{p.title}</h3>
                      </div>
                      <span style={{ background: p.status === "executed" ? "#10b98122" : "#3b82f622", color: p.status === "executed" ? "#10b981" : "#3b82f6", padding: "2px 10px", borderRadius: 10, fontSize: "0.75rem", fontWeight: 700 }}>
                        {p.status === "executed" ? "✓ Executed" : "● Active"}
                      </span>
                    </div>
                    {p.agent && <div style={{ color: "#64748b", fontSize: "0.8rem", marginBottom: 12 }}>Proposed by: <span style={{ color: "#dc2626" }}>{p.agent}</span></div>}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#64748b", marginBottom: 4 }}>
                        <span>For: {p.for.toLocaleString()}</span>
                        <span>{forPct}%</span>
                        <span>Against: {p.against.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${forPct}%`, background: forPct > 50 ? "#10b981" : "#ef4444", borderRadius: 3 }} />
                      </div>
                    </div>
                    <div style={{ color: "#64748b", fontSize: "0.75rem" }}>Deadline: {p.deadline}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
