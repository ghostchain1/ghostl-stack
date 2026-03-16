"use client";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const ALERTS = [
  { id: 1, subject: "0x8fA3...d91c", type: "FAKE_INSTITUTION",  severity: "critical", msg: "Entity claims to be a central bank but jurisdiction hash does not match any registered sovereign authority.", ts: "2026-03-13 17:45 UTC", resolved: false },
  { id: 2, subject: "0x2aB1...c72e", type: "BOT_NETWORK",       severity: "high",     msg: "Cluster of 47 wallet addresses registered within 60 seconds with identical credential document hashes.", ts: "2026-03-13 15:20 UTC", resolved: false },
  { id: 3, subject: "0x5cC9...e83f", type: "CREDENTIAL_REUSE",  severity: "medium",   msg: "Identity commitment hash reused across 3 distinct wallet registrations. Possible Sybil attack.", ts: "2026-03-13 12:10 UTC", resolved: false },
  { id: 4, subject: "0x9dD4...f14a", type: "SUSPICIOUS_ACTIVITY",severity: "low",     msg: "Unusual verification request volume from single verifier node: 2,400 verifications in 1 hour.", ts: "2026-03-13 09:00 UTC", resolved: true },
];

const SEV_COLOR: Record<string,string> = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#64748b" };

const METRICS = [
  { label: "Active Alerts",         value: "3" },
  { label: "Identities Flagged",    value: "51" },
  { label: "Alerts Resolved (7d)",  value: "18" },
  { label: "Fraud Rate",            value: "0.02%" },
];

export default function FraudPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#050507)" }}>
          <div className="container">
            <a href="/gsi" style={{ color: "#8b5cf6", fontSize: "0.85rem", textDecoration: "none" }}>← GSI</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Fraud <span style={{ color: "#8b5cf6" }}>Monitoring</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>GhostBrain AI-powered identity fraud detection — flags fake institutions, Sybil attacks, bot networks, and credential reuse in real-time.</p>
          </div>
        </section>

        <section style={{ padding: "32px 24px", background: "#07060e" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16 }}>
              {METRICS.map((m) => (
                <div key={m.label} className="card" style={{ textAlign: "center", padding: "20px 16px" }}>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#ef4444", marginBottom: 6 }}>{m.value}</div>
                  <div style={{ color: "#64748b", fontSize: "0.8rem" }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "40px 24px 80px" }}>
          <div className="container">
            <h2 style={{ fontWeight: 700, fontSize: "1.2rem", marginBottom: 20 }}>Active Alerts</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {ALERTS.map((a) => (
                <div key={a.id} className="card" style={{ borderLeft: `3px solid ${SEV_COLOR[a.severity]}`, padding: "16px 20px", opacity: a.resolved ? 0.5 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ background: (SEV_COLOR[a.severity]) + "22", color: SEV_COLOR[a.severity], padding: "2px 10px", borderRadius: 10, fontSize: "0.75rem", fontWeight: 800 }}>
                        {a.severity.toUpperCase()}
                      </span>
                      <span style={{ color: "#8b5cf6", fontWeight: 700, fontSize: "0.85rem" }}>{a.type}</span>
                    </div>
                    <span style={{ color: "#64748b", fontSize: "0.75rem" }}>{a.ts}</span>
                  </div>
                  <div style={{ color: "#64748b", fontSize: "0.78rem", marginBottom: 8, fontFamily: "monospace" }}>{a.subject}</div>
                  <p style={{ margin: 0, color: "#cbd5e1", fontSize: "0.9rem" }}>{a.msg}</p>
                  {a.resolved && <div style={{ marginTop: 10, color: "#10b981", fontSize: "0.78rem", fontWeight: 700 }}>✓ RESOLVED</div>}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
