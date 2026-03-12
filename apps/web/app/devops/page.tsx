/**
 * DevOps — Build pipeline, code evolution, and deployment status dashboard.
 *
 * Shows: SEE evolution cycles, Kernel task queue, promotions history,
 * code refactor proposals, and topology findings.
 */

import {
  fetchSeeHealth,
  fetchSeeLatestCycle,
  fetchSeePromotions,
  fetchSeeRefactorProposals,
  fetchKernelTasks,
  fetchKernelServices,
} from "@/lib/ghostbrainApi";
import { SectionHeader } from "@/components/dashboard/MetricCard";
import { StatusBadge }   from "@/components/dashboard/StatusBadge";

export const metadata = { title: "DevOps · GhostStack" };

export default async function DevOpsPage() {
  const [seeHealth, cycle, promotions, refactors, kernelTasks, kernelSvcs] = await Promise.all([
    fetchSeeHealth(),
    fetchSeeLatestCycle(),
    fetchSeePromotions(),
    fetchSeeRefactorProposals(),
    fetchKernelTasks(),
    fetchKernelServices(),
  ]);

  const tasks      = kernelTasks?.tasks      ?? [];
  const taskStats  = kernelTasks?.stats      ?? {};
  const services   = kernelSvcs?.services    ?? [];
  const svsSummary = kernelSvcs?.summary;
  const promoList  = promotions                 ?? [];
  const proposals  = refactors?.proposals       ?? [];

  const activeCount   = tasks.filter((t) => t.status === "running").length;
  const failedCount   = tasks.filter((t) => t.status === "failed").length;
  const healthySvcs   = services.filter((s) => s.status === "healthy").length;

  return (
    <div>
      <div className="page-header">
        <h1>DevOps Pipeline</h1>
        <p>Build orchestration, code evolution, deployments, and service health</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Evolution Engine</div>
          <div className="card-value">
            <StatusBadge
              ok={seeHealth?.status === "active" || seeHealth?.status === "ok"}
              onLabel="Active"
              offLabel={seeHealth?.status ?? "Offline"}
            />
          </div>
          <div className="card-sub">Cycle {seeHealth?.cycle ?? "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Active Tasks</div>
          <div className="card-value">{activeCount}</div>
          <div className="card-sub text-muted">
            {failedCount > 0 ? `${failedCount} failed` : "No failures"}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Services</div>
          <div className="card-value">{healthySvcs}/{services.length}</div>
          <div className="card-sub text-muted">healthy</div>
        </div>
        <div className="card">
          <div className="card-title">Promotions</div>
          <div className="card-value">{promoList.length}</div>
          <div className="card-sub text-muted">deployed components</div>
        </div>
      </div>

      {/* Latest evolution cycle */}
      {cycle && (
        <>
          <SectionHeader title="Latest Evolution Cycle" sub={`Cycle ${cycle.cycleId}`} />
          <div className="grid grid-3">
            {[
              { label: "Status",      value: cycle.status                                              },
              { label: "Executions",  value: String(cycle.executions?.length ?? 0)                    },
              { label: "Completed",   value: cycle.completedAt ? new Date(cycle.completedAt).toLocaleString() : "In progress" },
              { label: "Error",       value: cycle.error ?? "None"                                    },
              { label: "Started",     value: new Date(cycle.startedAt).toLocaleString()               },
              { label: "Passed",      value: String(cycle.executions?.filter(e => e.status === "completed" || e.status === "passed").length ?? 0) },
            ].map(({ label, value }) => (
              <div key={label} className="card">
                <div className="card-title">{label}</div>
                <div className="card-value" style={{ fontSize: "1rem" }}>{value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Kernel task queue */}
      <SectionHeader
        title="Kernel Task Queue"
        sub={`${(taskStats as Record<string,unknown>)?.["queued"] ?? tasks.length} queued`}
      />
      {tasks.length === 0 ? (
        <div className="card"><p className="text-muted">No tasks in queue</p></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="service-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Agent</th>
              </tr>
            </thead>
            <tbody>
              {tasks.slice(0, 20).map((task) => (
                <tr key={task.id}>
                  <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {task.title ?? task.id}
                  </td>
                  <td className="text-muted">{task.category ?? "—"}</td>
                  <td>
                    <span className={`badge ${
                      task.priority === "emergency" ? "badge-red"
                      : task.priority === "high"    ? "badge-yellow"
                      : "badge-green"
                    }`}>
                      {task.priority}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${
                      task.status === "completed" || task.status === "running" ? "badge-green"
                      : task.status === "failed"                               ? "badge-red"
                      : "badge-yellow"
                    }`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="text-muted">{task.submittedBy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Service health */}
      {services.length > 0 && (
        <>
          <SectionHeader
            title="Service Health"
            sub={svsSummary ? `${svsSummary.healthy ?? healthySvcs} healthy · ${svsSummary.total ?? services.length} total` : undefined}
          />
          <div className="grid grid-3">
            {services.map((svc) => (
              <div key={svc.name} className="card">
                <div className="card-title">{svc.name}</div>
                <div className="card-value">
                  <StatusBadge
                    ok={svc.status === "healthy"}
                    onLabel="Healthy"
                    offLabel={svc.status}
                  />
                </div>
                {svc.consecutiveFailures > 0 && (
                  <div className="card-sub text-muted">{svc.consecutiveFailures} consecutive failures</div>
                )}
                {svc.restartCount > 0 && (
                  <div className="card-sub text-muted">{svc.restartCount} restarts</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Refactor proposals */}
      {proposals.length > 0 && (
        <>
          <SectionHeader title="Pending Refactor Proposals" sub={`${proposals.length} suggestions from SEE`} />
          <div className="card" style={{ padding: 0 }}>
            <table className="service-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Impact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {proposals.slice(0, 15).map((p) => (
                  <tr key={p.id}>
                    <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.title}
                    </td>
                    <td className="text-muted">{p.category}</td>
                    <td>
                      <span className={`badge ${
                        p.impact === "critical" ? "badge-red"
                        : p.impact === "high"   ? "badge-yellow"
                        : "badge-green"
                      }`}>{p.impact}</span>
                    </td>
                    <td>
                      <span className={`badge ${
                        p.status === "promoted"        ? "badge-green"
                        : p.status === "sandbox_failed" || p.status === "rejected" ? "badge-red"
                        : "badge-yellow"
                      }`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Promotions history */}
      {promoList.length > 0 && (
        <>
          <SectionHeader title="Deployment History" sub="Recent SEE-managed promotions" />
          <div className="card" style={{ padding: 0 }}>
            <table className="service-table">
              <thead>
                <tr>
                  <th>Proposal</th>
                  <th>Status</th>
                  <th>Promoted By</th>
                  <th>Reason</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {promoList.slice(0, 15).map((p) => (
                  <tr key={p.id}>
                    <td className="text-muted" style={{ fontSize: "0.8rem", fontFamily: "monospace" }}>
                      {p.proposalId}
                    </td>
                    <td>
                      <span className={`badge ${
                        p.status === "success" || p.status === "completed" ? "badge-green"
                        : p.status === "failed"                            ? "badge-red"
                        : "badge-yellow"
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="text-muted">{p.promotedBy}</td>
                    <td className="text-muted" style={{ fontSize: "0.8rem" }}>{p.reason}</td>
                    <td className="text-muted">
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
