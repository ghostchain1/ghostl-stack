/**
 * Command Hub — interactive control center for the Universal Orchestrator.
 *
 * Server component fetches current UO status + recent command history.
 * CommandConsole (client) is embedded for interactive command dispatch.
 */

import { fetchUoSystems, fetchUoHealth, fetchUoCommands } from "@/lib/ghostbrainApi";
import { CommandConsole } from "@/components/dashboard/CommandConsole";
import { SectionHeader } from "@/components/dashboard/MetricCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

export const metadata = { title: "Command Hub · GhostStack" };

export default async function CommandHubPage() {
  const [sysOverview, health, cmds] = await Promise.all([
    fetchUoSystems(),
    fetchUoHealth(),
    fetchUoCommands(15),
  ]);

  const systemsMap = sysOverview?.systems ?? {};
  const systems    = Object.entries(systemsMap).map(([id, s]) => ({ id, ...s }));
  const history    = cmds?.history ?? [];
  const uptimeMs   = health ? health.uptime * 1000 : 0;
  const uptimeStr  = uptimeMs > 0
    ? `${Math.floor(uptimeMs / 86400000)}d ${Math.floor((uptimeMs % 86400000) / 3600000)}h`
    : "—";

  return (
    <div>
      <div className="page-header">
        <h1>Command Hub</h1>
        <p>Dispatch commands to any GhostBrain subsystem via the Universal Orchestrator</p>
      </div>

      {/* UO Status bar */}
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Orchestrator</div>
          <div className="card-value">
            <StatusBadge ok={health?.ok ?? false} onLabel="Online" offLabel="Offline" />
          </div>
        </div>
        <div className="card">
          <div className="card-title">Uptime</div>
          <div className="card-value">{uptimeStr}</div>
        </div>
        <div className="card">
          <div className="card-title">Connected Systems</div>
          <div className="card-value">{sysOverview?.total ?? systems.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Commands (all-time)</div>
          <div className="card-value">
            {cmds?.stats?.total != null ? String(cmds.stats.total) : "—"}
          </div>
        </div>
      </div>

      {/* Interactive command console (client component) */}
      <SectionHeader title="Dispatch Command" live />
      <CommandConsole />

      {/* Recent command history */}
      <SectionHeader title="Recent Commands" sub="Last 15 dispatched commands" />
      {history.length === 0 ? (
        <div className="card"><p className="text-muted">No command history available</p></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="service-table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Action</th>
                <th>Status</th>
                <th>Time</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {history.map((cmd) => (
                <tr key={cmd.id}>
                  <td><code>{cmd.target}</code></td>
                  <td>{cmd.action}</td>
                  <td>
                    <span className={`badge ${
                      cmd.status === "completed" ? "badge-green"
                      : cmd.status === "failed"  ? "badge-red"
                      : "badge-yellow"
                    }`}>
                      {cmd.status}
                    </span>
                  </td>
                  <td className="text-muted">
                    {new Date(cmd.issuedAt).toLocaleTimeString()}
                  </td>
                  <td className="text-muted" style={{ fontSize: "0.8rem" }}>
                    {cmd.error ? cmd.error.slice(0, 80) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Connected systems grid */}
      {systems.length > 0 && (
        <>
          <SectionHeader title="Connected Systems" />
          <div className="grid grid-3">
            {systems.map((sys) => (
              <div key={sys.id} className="card">
                <div className="card-title">{sys.id}</div>
                <div className="card-value">
                  <StatusBadge ok={sys.ok} />
                </div>
                <div className="card-sub text-muted">
                  {sys.latencyMs != null ? `${sys.latencyMs}ms latency` : ""}
                  {sys.lastChecked ? ` · ${new Date(sys.lastChecked).toLocaleTimeString()}` : ""}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
