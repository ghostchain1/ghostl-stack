"use client";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const CAT_COLOR: Record<string,string> = {
  DECISION: "#dc2626", POLICY_PROP: "#8b5cf6", ORACLE_UPDATE: "#3b82f6",
  ALERT_RAISED: "#f59e0b", GOVERNANCE: "#10b981", SYSTEM_ACTION: "#64748b",
};

const ENTRIES = [
  { id: 129034, agent: "ai.oracle-feeder",    cat: "ORACLE_UPDATE", action: "Updated feed price.gold.usd → 2847.00",             block: 5_820_441, ts: "18:20:14 UTC", reviewed: true },
  { id: 129033, agent: "ai.fraud-detector",   cat: "ALERT_RAISED",  action: "Raised FAKE_INSTITUTION alert for 0x8fA3...d91c",   block: 5_820_399, ts: "17:45:02 UTC", reviewed: false },
  { id: 129032, agent: "ai.risk-assessor",    cat: "DECISION",      action: "Assessed GWF systemic risk: 4200bps (medium)",      block: 5_820_361, ts: "17:30:50 UTC", reviewed: false },
  { id: 129031, agent: "ai.policy-engine",    cat: "POLICY_PROP",   action: "Proposed reserveRatio change: 10% → 12% [GSX]",     block: 5_820_300, ts: "17:00:22 UTC", reviewed: false },
  { id: 129030, agent: "ai.governance",       cat: "GOVERNANCE",    action: "Voted FOR proposal #1 (reserveRatio) weight=100",   block: 5_820_250, ts: "16:55:08 UTC", reviewed: true },
  { id: 129029, agent: "ai.market-monitor",   cat: "ALERT_RAISED",  action: "Flagged VOLUME_ANOMALY on GSX commodity orderbook", block: 5_820_100, ts: "12:00:45 UTC", reviewed: true },
  { id: 129028, agent: "ai.gdp-forecaster",   cat: "ORACLE_UPDATE", action: "Published gdp.usa.forecast → 28.4T USD",            block: 5_820_010, ts: "10:00:03 UTC", reviewed: true },
];

const STATS = [
  { label: "Total Entries",    value: "129,034" },
  { label: "Agents Active",   value: "7" },
  { label: "Reviewed (24h)",  value: "4" },
  { label: "Pending Review",  value: "3" },
];

export default function AuditPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#0a0508)" }}>
          <div className="container">
            <a href="/gsa" style={{ color: "#dc2626", fontSize: "0.85rem", textDecoration: "none" }}>← GSA</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              AI Audit <span style={{ color: "#dc2626" }}>Trail</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>Immutable on-chain record of every AI agent decision, oracle update, policy proposal, and governance action. Each entry is anchored to an L1 block number.</p>
          </div>
        </section>

        <section style={{ padding: "32px 24px", background: "#07060e" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 14 }}>
              {STATS.map((s) => (
                <div key={s.label} className="card" style={{ textAlign: "center", padding: "18px 14px" }}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#dc2626", marginBottom: 6 }}>{s.value}</div>
                  <div style={{ color: "#64748b", fontSize: "0.78rem" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "40px 24px 80px" }}>
          <div className="container">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b" }}>
                    {["Entry ID", "Agent", "Category", "Action", "Block", "Time", "Status"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ENTRIES.map((e) => (
                    <tr key={e.id} style={{ borderBottom: "1px solid #0f172a" }}>
                      <td style={{ padding: "11px 14px", color: "#64748b", fontFamily: "monospace" }}>#{e.id.toLocaleString()}</td>
                      <td style={{ padding: "11px 14px", color: "#dc2626", fontWeight: 700 }}>{e.agent}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ background: (CAT_COLOR[e.cat]??"#64748b") + "22", color: CAT_COLOR[e.cat]??"#64748b", padding: "2px 8px", borderRadius: 8, fontSize: "0.72rem", fontWeight: 700 }}>{e.cat}</span>
                      </td>
                      <td style={{ padding: "11px 14px", color: "#cbd5e1", maxWidth: 280 }}>{e.action}</td>
                      <td style={{ padding: "11px 14px", color: "#64748b", fontFamily: "monospace" }}>{e.block.toLocaleString()}</td>
                      <td style={{ padding: "11px 14px", color: "#64748b" }}>{e.ts}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ background: e.reviewed ? "#10b98122" : "#f59e0b22", color: e.reviewed ? "#10b981" : "#f59e0b", padding: "2px 8px", borderRadius: 8, fontSize: "0.72rem", fontWeight: 700 }}>
                          {e.reviewed ? "✓ Reviewed" : "Pending"}
                        </span>
                      </td>
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
