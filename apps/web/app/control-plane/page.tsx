import { fetchScpHealth, fetchScpStats } from "../../lib/api";

export const dynamic = "force-dynamic";

export default async function ControlPlanePage() {
  const [health, stats] = await Promise.all([fetchScpHealth(), fetchScpStats()]);

  return (
    <>
      <div className="page-header">
        <h1>Sovereign Control Plane</h1>
        <p>Unified command interface for the entire GhostStack ecosystem (port 9500)</p>
      </div>

      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">Status</div>
          <div style={{ marginTop: "0.4rem" }}>
            {health?.status === "ok"
              ? <span className="badge badge-green"><span className="dot" />Running</span>
              : <span className="badge badge-red"><span className="dot" />Offline</span>}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Emergency Stop</div>
          <div style={{ marginTop: "0.4rem" }}>
            {health?.emergencyStop
              ? <span className="badge badge-red"><span className="dot" />ACTIVE</span>
              : <span className="badge badge-green"><span className="dot" />Clear</span>}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Cycle Count</div>
          <div className="card-value">{health?.cycleCount?.toLocaleString() ?? "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Commands Routed</div>
          <div className="card-value">{stats?.commandsRouted?.toLocaleString() ?? "—"}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">Security</div>
          <table className="service-table">
            <tbody>
              <tr><td>Total Requests</td><td>{stats?.security?.totalRequests ?? "—"}</td></tr>
              <tr><td>Blocked</td><td style={{ color: "var(--red)" }}>{stats?.security?.blocked ?? "—"}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-title">Governance Pipeline</div>
          <table className="service-table">
            <tbody>
              <tr><td>Total Proposals</td><td>{stats?.governance?.total ?? "—"}</td></tr>
              <tr><td>Pending</td><td style={{ color: "var(--yellow)" }}>{stats?.governance?.pending ?? "—"}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">REST API Endpoints</div>
        <table className="service-table">
          <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
          <tbody>
            {[
              ["GET",  "/health",                        "Health + emergency stop status"],
              ["GET",  "/stats",                         "Overall system statistics"],
              ["POST", "/command",                       "Submit a command for routing"],
              ["GET",  "/ai/status",                     "All 16 AI service health"],
              ["GET",  "/infrastructure/state",          "VMs + containers snapshot"],
              ["POST", "/infrastructure/vm/deploy",      "Deploy a new VM"],
              ["GET",  "/governance/proposals",          "List all proposals"],
              ["POST", "/governance/proposals",          "Create a governance proposal"],
              ["POST", "/governance/proposals/:id/simulate", "SimLab validation"],
              ["POST", "/emergency/stop",                "Halt all SCP operations"],
              ["POST", "/emergency/resume",              "Resume from emergency stop"],
              ["POST", "/cycle/trigger",                 "Manual cycle trigger"],
            ].map(([m, e, d]) => (
              <tr key={e}>
                <td><code style={{ color: m === "GET" ? "var(--green)" : "var(--accent)" }}>{m}</code></td>
                <td><code style={{ fontSize: "0.75rem" }}>{e}</code></td>
                <td style={{ color: "var(--text-muted)" }}>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
