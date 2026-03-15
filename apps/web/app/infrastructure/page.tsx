import {
  fetchAimHealth,
  fetchAimTelemetry,
  fetchAimAllocations,
  fetchAimRpcNodes,
  fetchAimCloudNodes,
} from "../../lib/api";

export const dynamic = "force-dynamic";

function fmtBytes(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
  if (bps >= 1_000)     return `${(bps / 1_000).toFixed(1)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

function pct(n: number | null | undefined): string {
  return n != null ? `${n.toFixed(1)}%` : "—";
}

export default async function InfrastructurePage() {
  const [health, telemetry, allocs, rpcNodes, cloudNodes] = await Promise.all([
    fetchAimHealth(),
    fetchAimTelemetry(),
    fetchAimAllocations(),
    fetchAimRpcNodes(),
    fetchAimCloudNodes(),
  ]);

  const isRunning = health?.status === "ok";

  return (
    <>
      <div className="page-header">
        <h1>Autonomous Infrastructure Manager</h1>
        <p>Dynamic hypervisor control, VM provisioning, RPC load balancing &amp; cloud expansion (port 9950)</p>
      </div>

      {/* ── Status row ────────────────────────────────────────────────── */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">AIM Status</div>
          <div style={{ marginTop: "0.4rem" }}>
            {isRunning
              ? <span className="badge badge-green"><span className="dot" />Running</span>
              : <span className="badge badge-red"><span className="dot" />Offline</span>}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Control Cycles</div>
          <div className="card-value">{health?.cycleCount?.toLocaleString() ?? "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">VMs Managed</div>
          <div className="card-value">{telemetry?.vmCount ?? "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Containers</div>
          <div className="card-value">{telemetry?.containerCount ?? "—"}</div>
        </div>
      </div>

      {/* ── Host telemetry ────────────────────────────────────────────── */}
      <div className="grid grid-2" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">Host Resources</div>
          <table className="service-table">
            <tbody>
              <tr><td>CPU (1-min avg)</td><td>{pct(telemetry?.hostCpuPct)}</td></tr>
              <tr><td>Load Avg (1/5/15)</td>
                <td>{telemetry?.hostCpuLoadAvg
                  ? telemetry.hostCpuLoadAvg.map((v: number) => v.toFixed(2)).join(" / ")
                  : "—"}</td>
              </tr>
              <tr><td>Memory Used</td><td>{pct(telemetry?.hostMemUsedPct)}</td></tr>
              <tr><td>Memory Free</td>
                <td>{telemetry?.hostMemFreeMb != null
                  ? `${telemetry.hostMemFreeMb.toLocaleString()} MB`
                  : "—"}</td>
              </tr>
              <tr><td>Disk Free</td>
                <td>{telemetry?.hostDiskFreeGb != null ? `${telemetry.hostDiskFreeGb} GB` : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-title">Network I/O</div>
          <table className="service-table">
            <tbody>
              <tr><td>RX</td>
                <td>{telemetry?.networkRxBps != null ? fmtBytes(telemetry.networkRxBps) : "—"}</td>
              </tr>
              <tr><td>TX</td>
                <td>{telemetry?.networkTxBps != null ? fmtBytes(telemetry.networkTxBps) : "—"}</td>
              </tr>
              <tr><td>Global Action</td>
                <td><code>{allocs?.globalAction ?? health?.globalAction ?? "—"}</code></td>
              </tr>
              <tr><td>Summary</td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                  {allocs?.summary ?? health?.summary ?? "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── VM topology table ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">VM Topology</div>
        {telemetry?.vms && telemetry.vms.length > 0 ? (
          <table className="service-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>State</th>
                <th>vCPUs</th>
                <th>Mem (MB)</th>
                <th>CPU %</th>
                <th>Mem %</th>
                <th>Allocation</th>
              </tr>
            </thead>
            <tbody>
              {telemetry.vms.map((vm: { name: string; state: string; vcpus: number; memMb: number; cpuPct: number | null; memPct: number | null }) => {
                const alloc = allocs?.vmAllocations?.find(
                  (a: { vmName: string }) => a.vmName === vm.name
                );
                return (
                  <tr key={vm.name}>
                    <td><code>{vm.name}</code></td>
                    <td>
                      <span className={`badge ${vm.state === "running" ? "badge-green" : "badge-red"}`}>
                        <span className="dot" />{vm.state}
                      </span>
                    </td>
                    <td>{vm.vcpus}</td>
                    <td>{vm.memMb.toLocaleString()}</td>
                    <td style={{ color: (vm.cpuPct ?? 0) > 80 ? "var(--red)" : undefined }}>
                      {pct(vm.cpuPct)}
                    </td>
                    <td style={{ color: (vm.memPct ?? 0) > 85 ? "var(--red)" : undefined }}>
                      {pct(vm.memPct)}
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      {alloc ? `${alloc.action} — ${alloc.reason}` : "nominal"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
            {isRunning ? "No VMs reported" : "AIM offline — cannot fetch VM data"}
          </p>
        )}
      </div>

      {/* ── RPC Node Pool ─────────────────────────────────────────────── */}
      <div className="grid grid-2" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">RPC Node Pool</div>
          {rpcNodes && rpcNodes.length > 0 ? (
            <table className="service-table">
              <thead><tr><th>URL</th><th>Region</th><th>Load</th><th>Health</th><th>Latency</th></tr></thead>
              <tbody>
                {rpcNodes.map((n: { url: string; region: string; load: number; healthy: boolean; latencyMs?: number }) => (
                  <tr key={n.url}>
                    <td><code style={{ fontSize: "0.75rem" }}>{n.url}</code></td>
                    <td>{n.region}</td>
                    <td>{`${(n.load * 100).toFixed(0)}%`}</td>
                    <td>
                      <span className={`badge ${n.healthy ? "badge-green" : "badge-red"}`}>
                        <span className="dot" />{n.healthy ? "healthy" : "down"}
                      </span>
                    </td>
                    <td>{n.latencyMs != null ? `${n.latencyMs} ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>No RPC nodes registered</p>
          )}
        </div>

        {/* ── Cloud Nodes ──────────────────────────────────────────── */}
        <div className="card">
          <div className="card-title">Cloud Nodes</div>
          {cloudNodes && cloudNodes.length > 0 ? (
            <table className="service-table">
              <thead><tr><th>ID</th><th>Provider</th><th>Region</th><th>Role</th><th>IP</th><th>Status</th></tr></thead>
              <tbody>
                {cloudNodes.map((n: { id: string; provider: string; region: string; role: string; ip?: string; status: string }) => (
                  <tr key={n.id}>
                    <td><code style={{ fontSize: "0.7rem" }}>{n.id}</code></td>
                    <td>{n.provider}</td>
                    <td>{n.region}</td>
                    <td>{n.role}</td>
                    <td>{n.ip ?? "—"}</td>
                    <td>
                      <span className={`badge ${n.status === "running" ? "badge-green" : "badge-yellow"}`}>
                        <span className="dot" />{n.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>No cloud nodes deployed</p>
          )}
        </div>
      </div>

      {/* ── REST API reference ────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">AIM REST API (port 9950)</div>
        <table className="service-table">
          <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
          <tbody>
            {[
              ["GET",  "/health",              "Status, cycle count, last plan summary"],
              ["GET",  "/status",              "Full status with telemetry + plan"],
              ["GET",  "/telemetry",           "Live host metrics + VM list"],
              ["GET",  "/allocations",         "Current resource allocation plan"],
              ["GET",  "/vms",                 "VM list from Kernel"],
              ["POST", "/vms/provision",       "Provision a new VM (VmSpec body)"],
              ["POST", "/vms/:name/migrate",   "Trigger live migration to target host"],
              ["POST", "/vms/:name/:action",   "VM lifecycle: start / stop / reboot / snapshot"],
              ["GET",  "/rpc-nodes",           "List all RPC nodes with health + load"],
              ["GET",  "/rpc-nodes/select",    "Select optimal RPC node"],
              ["POST", "/rpc-nodes/add",       "Register new RPC node"],
              ["GET",  "/cloud/nodes",         "List cloud-deployed nodes"],
              ["POST", "/cloud/deploy",        "Deploy new cloud node (CloudDeployRequest body)"],
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
