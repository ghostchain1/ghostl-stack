"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const SUBSYSTEMS = [
  { name: "GSX", label: "Sovereign Exchange",   health: 99.8, alerts: 0, load: 42 },
  { name: "GSN", label: "Settlement Network",   health: 99.9, alerts: 0, load: 31 },
  { name: "GCM", label: "Central Bank Network", health: 100,  alerts: 0, load: 18 },
  { name: "GSR", label: "Strategic Reserves",   health: 100,  alerts: 0, load: 9  },
  { name: "GWF", label: "World Finance",        health: 99.6, alerts: 1, load: 55 },
  { name: "GSE", label: "Economy Engine",       health: 99.7, alerts: 0, load: 27 },
  { name: "GSI", label: "Identity Network",     health: 100,  alerts: 0, load: 14 },
  { name: "GSA", label: "AI Network (self)",    health: 100,  alerts: 0, load: 38 },
];

const ANOMALIES = [
  { ts: "18:15 UTC", subsystem: "GWF", type: "LATENCY_SPIKE",   msg: "gwf-router latency exceeded 200ms threshold for 90 seconds", severity: "medium" },
  { ts: "14:30 UTC", subsystem: "GSX", type: "VOLUME_ANOMALY",  msg: "Order volume 340% above 30-day average — monitoring for manipulation", severity: "low" },
];

const SEV_COLOR: Record<string,string> = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#64748b" };

export default function MonitorPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#0a0508)" }}>
          <div className="container">
            <a href="/gsa" style={{ color: "#dc2626", fontSize: "0.85rem", textDecoration: "none" }}>← GSA</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              System <span style={{ color: "#dc2626" }}>Monitor</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>GhostBrain real-time monitoring — health, load, and anomaly detection across all GhostStack subsystems.</p>
          </div>
        </section>

        <section style={{ padding: "40px 24px" }}>
          <div className="container">
            <h2 style={{ fontWeight: 700, fontSize: "1.2rem", marginBottom: 20 }}>Subsystem Health</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 }}>
              {SUBSYSTEMS.map((s) => (
                <div key={s.name} className="card" style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <span style={{ fontWeight: 800, color: "#dc2626" }}>{s.name}</span>
                      <div style={{ color: "#64748b", fontSize: "0.8rem" }}>{s.label}</div>
                    </div>
                    <span style={{ color: "#10b981", fontWeight: 800, fontSize: "1.1rem" }}>{s.health}%</span>
                  </div>
                  <div style={{ height: 4, background: "#1e293b", borderRadius: 2, marginBottom: 8 }}>
                    <div style={{ height: "100%", width: `${s.load}%`, background: s.load > 80 ? "#ef4444" : s.load > 60 ? "#f59e0b" : "#10b981", borderRadius: 2 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#64748b" }}>
                    <span>Load {s.load}%</span>
                    <span style={{ color: s.alerts > 0 ? "#f59e0b" : "#64748b" }}>{s.alerts} alerts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "40px 24px 80px" }}>
          <div className="container">
            <h2 style={{ fontWeight: 700, fontSize: "1.2rem", marginBottom: 20 }}>Active Anomalies</h2>
            {ANOMALIES.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 40, color: "#10b981" }}>✓ No anomalies detected</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {ANOMALIES.map((a, i) => (
                  <div key={i} className="card" style={{ borderLeft: `3px solid ${SEV_COLOR[a.severity]}`, padding: "14px 20px" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ background: (SEV_COLOR[a.severity]) + "22", color: SEV_COLOR[a.severity], padding: "2px 10px", borderRadius: 10, fontSize: "0.75rem", fontWeight: 800 }}>{a.severity.toUpperCase()}</span>
                      <span style={{ color: "#dc2626", fontWeight: 700, fontSize: "0.85rem" }}>{a.type}</span>
                      <span style={{ color: "#8b5cf6", fontSize: "0.8rem" }}>{a.subsystem}</span>
                      <span style={{ color: "#64748b", fontSize: "0.75rem", marginLeft: "auto" }}>{a.ts}</span>
                    </div>
                    <p style={{ margin: 0, color: "#cbd5e1", fontSize: "0.9rem" }}>{a.msg}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
