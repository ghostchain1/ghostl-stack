"use client";
import { useInfrastructure } from "@/hooks/useInfrastructure";
import { NodeHealthChart } from "@/components/charts/NodeHealthChart";

const STATE_BADGE: Record<string, string> = {
  running: "badge-green",
  stopped: "badge-red",
  paused:  "badge-yellow",
  exited:  "badge-red",
  error:   "badge-red",
};

export default function InfrastructurePage() {
  const { infra, isLoading, isError, refresh } = useInfrastructure();

  const vms        = infra?.vms        ?? [];
  const containers = infra?.containers ?? [];
  const resources  = infra?.resources  ?? null;
  const hclOnline  = infra?.hclOnline  ?? false;

  return (
    <>
      <div className="page-header">
        <h1>🔧 Infrastructure</h1>
        <p>VMs, containers, and resource utilization — sourced from the Hypervisor Control Layer (port 9986)</p>
      </div>

      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <div className="flex gap-1">
          <span className={`badge ${hclOnline ? "badge-green" : "badge-red"}`}><span className="dot" />HCL {hclOnline ? "online" : "offline"}</span>
          {vms.length > 0        && <span className="badge badge-cyan">{vms.length} VMs</span>}
          {containers.length > 0 && <span className="badge badge-cyan">{containers.length} containers</span>}
          {isError && <span className="badge badge-red">Fetch error</span>}
        </div>
        <button className="btn btn-ghost" onClick={() => refresh()}>↻ Refresh</button>
      </div>

      {isLoading && <div style={{ color: "var(--text-muted)" }}>Querying HCL…</div>}

      {/* HCL offline notice */}
      {!isLoading && !hclOnline && (
        <div className="card" style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
          Hypervisor Control Layer is offline. Start with <span className="mono">make hcl-dev</span> (port 9986)
        </div>
      )}

      {/* Resource summary */}
      {resources && (
        <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
          <div className="stat-card">
            <div className="stat-label">CPU Usage</div>
            <div className="stat-value">{resources.usedCpuPct?.toFixed(1)}%</div>
            <div className="progress-bar mt-1">
              <div className="progress-fill" style={{ width: `${resources.usedCpuPct}%`, background: resources.usedCpuPct > 80 ? "#ef4444" : "#7c3aed" }} />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Memory</div>
            <div className="stat-value">{resources.usedMemGB?.toFixed(1)} / {resources.totalMemGB?.toFixed(0)} GB</div>
            <div className="progress-bar mt-1">
              <div className="progress-fill" style={{ width: `${(resources.usedMemGB / resources.totalMemGB) * 100}%`, background: "#10b981" }} />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Disk</div>
            <div className="stat-value">{resources.usedDiskTB?.toFixed(2)} / {resources.totalDiskTB?.toFixed(1)} TB</div>
            <div className="progress-bar mt-1">
              <div className="progress-fill" style={{ width: `${(resources.usedDiskTB / resources.totalDiskTB) * 100}%`, background: "#f59e0b" }} />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Network I/O</div>
            <div className="stat-value">{resources.networkInMbps?.toFixed(0)} / {resources.networkOutMbps?.toFixed(0)} Mbps</div>
          </div>
        </div>
      )}

      {/* VMs */}
      {vms.length > 0 && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-title">Virtual Machines ({vms.length})</div>
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>OS</th><th>IP</th><th>State</th><th style={{ textAlign: "right" }}>CPU</th><th style={{ textAlign: "right" }}>Memory</th><th style={{ textAlign: "right" }}>Disk</th></tr>
            </thead>
            <tbody>
              {vms.map((vm, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{String(vm.name)}</td>
                  <td style={{ color: "var(--text-muted)" }}>{String(vm.os ?? "—")}</td>
                  <td className="mono">{String(vm.ip ?? "—")}</td>
                  <td><span className={`badge ${STATE_BADGE[String(vm.state)] ?? "badge-gray"}`}>{String(vm.state)}</span></td>
                  <td style={{ textAlign: "right" }}>{Number(vm.cpuPct ?? 0).toFixed(1)}%</td>
                  <td style={{ textAlign: "right" }}>{Number(vm.memMB ?? 0).toLocaleString()} MB</td>
                  <td style={{ textAlign: "right" }}>{Number(vm.diskGB ?? 0).toFixed(1)} GB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Containers */}
      {containers.length > 0 && (
        <div className="card">
          <div className="card-title">Docker Containers ({containers.length})</div>
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Image</th><th>State</th><th>Ports</th><th style={{ textAlign: "right" }}>CPU</th><th style={{ textAlign: "right" }}>Mem</th><th>Uptime</th></tr>
            </thead>
            <tbody>
              {containers.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{String(c.name)}</td>
                  <td className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{String(c.image ?? "").split(":")[0]}</td>
                  <td><span className={`badge ${STATE_BADGE[String(c.state)] ?? "badge-gray"}`}>{String(c.state)}</span></td>
                  <td className="mono" style={{ fontSize: "0.72rem" }}>{(c.ports as string[] | undefined)?.join(", ") ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{Number(c.cpuPct ?? 0).toFixed(1)}%</td>
                  <td style={{ textAlign: "right" }}>{Number(c.memMB ?? 0).toFixed(0)} MB</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{String(c.uptime ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
