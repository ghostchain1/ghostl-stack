/**
 * Nodes — GhostStack distributed node inventory.
 * Sources: GIN node registry (all roles) + AIM RPC nodes.
 */

import {
  fetchGinNodes,
  fetchAimRpcNodes,
  type GinNode,
  type AimRpcNode,
} from "@/lib/api";
import { SectionHeader } from "@/components/dashboard/MetricCard";
import { StatusBadge }   from "@/components/dashboard/StatusBadge";

export const metadata = { title: "Nodes · GhostStack" };
export const revalidate = 20;

const ROLE_COLOR: Record<string, string> = {
  hypervisor: "var(--accent)",
  validator:  "var(--green)",
  rpc:        "var(--cyan)",
  vm:         "var(--yellow)",
  cloud:      "var(--text-muted)",
  analytics:  "var(--text-muted)",
};

function ago(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default async function NodesPage() {
  const [ginNodes, rpcNodes] = await Promise.all([
    fetchGinNodes(),
    fetchAimRpcNodes(),
  ]);

  const nodes: GinNode[] = ginNodes ?? [];
  const rpcs:  AimRpcNode[] = rpcNodes ?? [];

  const online  = nodes.filter(n => n.status === "online").length;
  const offline = nodes.filter(n => n.status === "offline").length;
  const roles   = [...new Set(nodes.map(n => n.role))];

  return (
    <div>
      <div className="page-header">
        <h1>Node Inventory</h1>
        <p>GIN node registry — hypervisors, validators, RPC gateways, analytics</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Total Nodes</div>
          <div className="card-value">{nodes.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Online</div>
          <div className="card-value" style={{ color: "var(--green)" }}>{online}</div>
        </div>
        <div className="card">
          <div className="card-title">Offline</div>
          <div className="card-value" style={{ color: offline > 0 ? "var(--red)" : "var(--text-muted)" }}>
            {offline}
          </div>
        </div>
        <div className="card">
          <div className="card-title">RPC Gateways</div>
          <div className="card-value">{rpcs.length}</div>
        </div>
      </div>

      {/* Role breakdown */}
      {roles.length > 0 && (
        <>
          <SectionHeader title="Nodes by Role" sub="" />
          <div className="grid grid-4">
            {roles.map(role => {
              const count = nodes.filter(n => n.role === role).length;
              return (
                <div key={role} className="card">
                  <div className="card-title" style={{ textTransform: "capitalize" }}>{role}</div>
                  <div className="card-value" style={{ color: ROLE_COLOR[role] }}>{count}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Node table */}
      <SectionHeader title="GIN Node Registry" sub="All registered nodes" />
      {nodes.length === 0 ? (
        <div className="card" style={{ color: "var(--text-muted)" }}>No node data — GIN offline?</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Role</th>
              <th>Region</th>
              <th>Capabilities</th>
              <th>Latency</th>
              <th>Last Seen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map(n => (
              <tr key={n.id}>
                <td className="code">{n.id.slice(0, 12)}…</td>
                <td>
                  <span style={{ color: ROLE_COLOR[n.role] ?? "inherit" }}>
                    {n.role}
                  </span>
                </td>
                <td>{n.region}</td>
                <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {n.capabilities.join(", ") || "—"}
                </td>
                <td>{n.latencyMs} ms</td>
                <td style={{ color: "var(--text-muted)" }}>{ago(n.lastSeen)}</td>
                <td>
                  <StatusBadge ok={n.status === "online"} onLabel={n.status} offLabel={n.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* RPC nodes */}
      {rpcs.length > 0 && (
        <>
          <SectionHeader title="RPC Gateways" sub="Managed by AIM" />
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Chain</th>
                <th>URL</th>
                <th>Block Height</th>
                <th>Latency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rpcs.map((r, i) => (
                <tr key={i}>
                  <td>{(r as any).name ?? `rpc-${i + 1}`}</td>
                  <td>{(r as any).chain ?? "—"}</td>
                  <td className="code" style={{ fontSize: "0.75rem" }}>
                    {(r as any).url ?? "—"}
                  </td>
                  <td>{((r as any).blockHeight ?? 0).toLocaleString()}</td>
                  <td>{(r as any).latencyMs ?? "—"} ms</td>
                  <td>
                    <StatusBadge ok={(r as any).online ?? (r as any).status === "online"} onLabel={(r as any).status ?? "online"} offLabel={(r as any).status ?? "offline"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
