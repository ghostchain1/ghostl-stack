import { fetchScpHealth, fetchScpStats, fetchAIStatus } from "../lib/api";

export const dynamic = "force-dynamic";

function StatusBadge({ ok }: { ok: boolean }) {
  return ok
    ? <span className="badge badge-green"><span className="dot" />Online</span>
    : <span className="badge badge-red"><span className="dot" />Offline</span>;
}

export default async function DashboardPage() {
  const [health, stats, aiServices] = await Promise.all([
    fetchScpHealth(),
    fetchScpStats(),
    fetchAIStatus(),
  ]);

  const reachable = aiServices?.filter(s => s.reachable).length ?? 0;
  const total     = aiServices?.length ?? 0;
  const degraded  = total - reachable;

  return (
    <>
      <div className="page-header">
        <h1>👻 GhostStack Command Center</h1>
        <p>Unified AI-managed blockchain infrastructure — SCP port 9500</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">SCP Status</div>
          <div style={{ marginTop: "0.5rem" }}>
            <StatusBadge ok={health?.status === "ok"} />
            {health?.emergencyStop && (
              <span className="badge badge-red" style={{ marginLeft: "0.5rem" }}>
                <span className="dot" />EMERGENCY STOP
              </span>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">AI Services</div>
          <div className="card-value" style={{ color: degraded > 0 ? "var(--yellow)" : "var(--green)" }}>
            {reachable}/{total}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
            {degraded > 0 ? `${degraded} degraded` : "all healthy"}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Commands Routed</div>
          <div className="card-value">{stats?.commandsRouted?.toLocaleString() ?? "—"}</div>
        </div>

        <div className="card">
          <div className="card-title">Governance</div>
          <div className="card-value">{stats?.governance?.pending ?? "—"}</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
            proposals pending
          </div>
        </div>
      </div>

      {/* AI services table */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">AI Service Health</div>
        {aiServices ? (
          <table className="service-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Port</th>
              </tr>
            </thead>
            <tbody>
              {aiServices.map(svc => (
                <tr key={svc.name}>
                  <td>{svc.name}</td>
                  <td><StatusBadge ok={svc.reachable} /></td>
                  <td style={{ color: svc.latencyMs > 500 ? "var(--yellow)" : "var(--text-muted)" }}>
                    {svc.reachable ? `${svc.latencyMs}ms` : "—"}
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {svc.url.split(":").pop()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>SCP unreachable — start GhostBrain stack</p>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-3">
        <a href="/control-plane" className="card" style={{ textDecoration: "none", cursor: "pointer" }}>
          <div className="card-title">Control Plane</div>
          <div>Command routing, infrastructure control, emergency operations</div>
        </a>
        <a href="/validators" className="card" style={{ textDecoration: "none", cursor: "pointer" }}>
          <div className="card-title">Validator Network</div>
          <div>GhostChain L1 validators — status, staking, repair</div>
        </a>
        <a href="/governance" className="card" style={{ textDecoration: "none", cursor: "pointer" }}>
          <div className="card-title">Governance</div>
          <div>Active proposals, on-chain votes, execution queue</div>
        </a>
      </div>
    </>
  );
}
