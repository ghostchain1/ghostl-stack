/**
 * /evolution — GhostBrain Self-Evolution Engine (SEE) Dashboard
 *
 * Displays real-time state of the SEE: evolution cycle status, code health
 * score, refactoring proposals, architecture topology, deployment promotion
 * history, and the full endpoint API reference.
 */

import {
  fetchSeeHealth,
  fetchSeeLatestCycle,
  fetchSeeCodeAnalysis,
  fetchSeeRefactorProposals,
  fetchSeeTopology,
  fetchSeePromotions,
  type SeeCodeFinding,
  type SeeRefactorProposal,
  type SeePromotionRecord,
  type SeeEvolutionCycle,
  type SeeTopologyFindings,
  type SeeCodeAnalysisReport,
} from "../../lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string): string {
  switch (status) {
    case "approved": case "completed": case "promoted": case "sandbox_passed":
      return "badge-green";
    case "failed": case "rejected": case "sandbox_failed":
      return "badge-red";
    case "running": case "queued": case "sandbox_queued": case "needs_review":
      return "badge-yellow";
    default:
      return "badge-gray";
  }
}

function impactBadge(impact: string): string {
  switch (impact) {
    case "critical": return "badge-red";
    case "high":     return "badge-yellow";
    case "medium":   return "badge-green";
    default:         return "badge-gray";
  }
}

function severityBadge(severity: string): string {
  switch (severity) {
    case "critical": return "badge-red";
    case "warning":  return "badge-yellow";
    case "info":     return "badge-gray";
    default:         return "badge-gray";
  }
}

function relativeTime(ts: number): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  if (diff < 60_000)  return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3600_000)}h ago`;
}

// ── Score gauge ───────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#facc15";
  return "#ef4444";
}

async function ScoreGauge({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#334155" strokeWidth="10" />
        <circle
          cx="50" cy="50" r="40"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${2 * Math.PI * 40 * score / 100} ${2 * Math.PI * 40 * (1 - score / 100)}`}
          strokeLinecap="round"
          style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
        />
      </svg>
      <span style={{ position: "absolute", fontWeight: 700, fontSize: "1.25rem", color }}>
        {score}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function EvolutionPage() {
  const [health, cycle, codeAnalysis, refactorData, topology, promotions] = await Promise.all([
    fetchSeeHealth(),
    fetchSeeLatestCycle(),
    fetchSeeCodeAnalysis(),
    fetchSeeRefactorProposals(),
    fetchSeeTopology(),
    fetchSeePromotions(),
  ]);

  const proposals = refactorData?.proposals ?? [];
  const summary   = refactorData?.summary as Record<string, number> | undefined;

  return (
    <main style={{ padding: "1.5rem", color: "#e2e8f0" }}>
      <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem", fontWeight: 700 }}>
        Self-Evolution Engine
      </h1>
      <p style={{ color: "#94a3b8", margin: "0 0 1.5rem" }}>
        GhostBrain SEE — autonomous code analysis, refactoring, sandbox validation, and production promotion
      </p>

      {/* Status bar */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div className="card" style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "0.25rem" }}>Service</div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className={`badge ${health ? "badge-green" : "badge-red"}`}>
              {health ? "ONLINE" : "OFFLINE"}
            </span>
            <span style={{ fontWeight: 600 }}>port 9250</span>
          </div>
        </div>
        <div className="card" style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "0.25rem" }}>Cycles Run</div>
          <div style={{ fontWeight: 700, fontSize: "1.25rem" }}>{health?.cycle ?? "—"}</div>
        </div>
        <div className="card" style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "0.25rem" }}>Latest Cycle</div>
          <span className={`badge ${statusBadge(cycle?.status ?? "")}`}>
            {cycle?.status ?? "none"}
          </span>
        </div>
        <div className="card" style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "0.25rem" }}>Executions (this cycle)</div>
          <div style={{ fontWeight: 700, fontSize: "1.25rem" }}>{cycle?.executions?.length ?? 0}</div>
        </div>
      </div>

      {/* Code Health Score + Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        {codeAnalysis && (
          <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", minWidth: 140 }}>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Code Health Score</div>
            {/* @ts-ignore server component */}
            <ScoreGauge score={codeAnalysis.overallScore} />
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
              {codeAnalysis.filesScanned} files · {relativeTime(codeAnalysis.scannedAt)}
            </div>
          </div>
        )}

        {codeAnalysis && (
          <div className="card" style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Code Findings</h2>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {codeAnalysis.findings.length} total
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
              {Object.entries(codeAnalysis.bySeverity ?? {}).map(([sev, count]) => (
                <span key={sev} className={`badge ${severityBadge(sev)}`}>
                  {count} {sev}
                </span>
              ))}
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ color: "#94a3b8" }}>
                    <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>File</th>
                    <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>Severity</th>
                    <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {codeAnalysis.findings.slice(0, 20).map((f: SeeCodeFinding) => (
                    <tr key={f.id} style={{ borderTop: "1px solid #1e293b" }}>
                      <td style={{ padding: "0.3rem 0.5rem 0.3rem 0", fontFamily: "monospace", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.file.split("/").slice(-2).join("/")}
                      </td>
                      <td style={{ padding: "0.3rem 0.5rem" }}>
                        <span className={`badge ${severityBadge(f.severity)}`}>{f.severity}</span>
                      </td>
                      <td style={{ padding: "0.3rem 0", color: "#94a3b8" }}>{f.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!codeAnalysis && (
          <div className="card" style={{ gridColumn: "1 / -1", color: "#64748b", textAlign: "center", padding: "2rem" }}>
            No code analysis data yet — trigger via <code>POST /code-analysis/refresh</code>
          </div>
        )}
      </div>

      {/* Refactor Proposals */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Refactor Proposals</h2>
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
            {summary?.["highPriority"] ?? 0} high-priority of {summary?.["total"] ?? proposals.length} total
          </span>
        </div>
        {proposals.length === 0 ? (
          <p style={{ color: "#64748b", margin: 0 }}>No proposals generated yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ color: "#94a3b8" }}>
                <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>Title</th>
                <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>Impact</th>
                <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>Priority</th>
                <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>Sandbox?</th>
                <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {proposals.slice(0, 15).map((p: SeeRefactorProposal) => (
                <tr key={p.id} style={{ borderTop: "1px solid #1e293b" }}>
                  <td style={{ padding: "0.35rem 0.5rem 0.35rem 0", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.title}
                  </td>
                  <td style={{ padding: "0.35rem 0.5rem" }}>
                    <span className={`badge ${impactBadge(p.impact)}`}>{p.impact}</span>
                  </td>
                  <td style={{ padding: "0.35rem 0.5rem", fontWeight: 600 }}>{p.priority}</td>
                  <td style={{ padding: "0.35rem 0.5rem" }}>
                    <span className={`badge ${p.requiresSandbox ? "badge-yellow" : "badge-gray"}`}>
                      {p.requiresSandbox ? "yes" : "no"}
                    </span>
                  </td>
                  <td style={{ padding: "0.35rem 0" }}>
                    <span className={`badge ${statusBadge(p.status)}`}>{p.status.replace(/_/g, " ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Architecture Topology */}
      {topology && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
          <div className="card">
            <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600 }}>Service Topology</h2>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
              <span className="badge badge-green">{topology.healthMap.filter(h => h.reachable).length} reachable</span>
              <span className="badge badge-red">{topology.unreachable.length} unreachable</span>
              <span className="badge badge-yellow">{topology.missingHealth.length} no /health</span>
              <span className="badge badge-gray">avg {topology.avgResponseMs}ms</span>
            </div>
            <div style={{ maxHeight: 180, overflowY: "auto" }}>
              {topology.healthMap.slice(0, 15).map(h => (
                <div key={h.name} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0", borderTop: "1px solid #1e293b", fontSize: "0.8rem" }}>
                  <span style={{ fontFamily: "monospace" }}>{h.name}</span>
                  <span style={{ display: "flex", gap: "0.4rem" }}>
                    <span className={`badge ${h.reachable ? "badge-green" : "badge-red"}`}>
                      {h.reachable ? `${h.responseMs}ms` : "down"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600 }}>Architecture Proposals</h2>
            {topology.proposals.length === 0 ? (
              <p style={{ color: "#64748b", margin: 0, fontSize: "0.875rem" }}>No architecture proposals.</p>
            ) : (
              topology.proposals.slice(0, 6).map(p => (
                <div key={p.id} style={{ padding: "0.5rem 0", borderTop: "1px solid #1e293b", fontSize: "0.8rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                    <span style={{ fontWeight: 600 }}>{p.title}</span>
                    <span className={`badge ${p.effort === "high" ? "badge-red" : p.effort === "medium" ? "badge-yellow" : "badge-green"}`}>
                      {p.effort} effort
                    </span>
                  </div>
                  <div style={{ color: "#94a3b8" }}>{p.description.slice(0, 120)}{p.description.length > 120 ? "…" : ""}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Promotion History */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600 }}>Deployment Promotions</h2>
        {!promotions || promotions.length === 0 ? (
          <p style={{ color: "#64748b", margin: 0, fontSize: "0.875rem" }}>No promotions yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ color: "#94a3b8" }}>
                <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>ID</th>
                <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>Proposal</th>
                <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>Status</th>
                <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>By</th>
                <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>GIN</th>
                <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>Audit</th>
                <th style={{ textAlign: "left", paddingBottom: "0.4rem" }}>When</th>
              </tr>
            </thead>
            <tbody>
              {promotions.slice(0, 15).map((p: SeePromotionRecord) => (
                <tr key={p.id} style={{ borderTop: "1px solid #1e293b" }}>
                  <td style={{ padding: "0.3rem 0.5rem 0.3rem 0", fontFamily: "monospace", fontSize: "0.7rem", color: "#64748b" }}>
                    {p.id.slice(0, 14)}
                  </td>
                  <td style={{ padding: "0.3rem 0.5rem", fontFamily: "monospace", fontSize: "0.7rem", color: "#64748b" }}>
                    {p.proposalId.slice(0, 12)}…
                  </td>
                  <td style={{ padding: "0.3rem 0.5rem" }}>
                    <span className={`badge ${statusBadge(p.status)}`}>{p.status}</span>
                  </td>
                  <td style={{ padding: "0.3rem 0.5rem" }}>{p.promotedBy}</td>
                  <td style={{ padding: "0.3rem 0.5rem" }}>
                    <span className={`badge ${p.notifiedGin ? "badge-green" : "badge-red"}`}>
                      {p.notifiedGin ? "✓" : "✗"}
                    </span>
                  </td>
                  <td style={{ padding: "0.3rem 0.5rem" }}>
                    <span className={`badge ${p.auditLogged ? "badge-green" : "badge-red"}`}>
                      {p.auditLogged ? "✓" : "✗"}
                    </span>
                  </td>
                  <td style={{ padding: "0.3rem 0", color: "#64748b" }}>{relativeTime(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* API Reference */}
      <div className="card">
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600 }}>SEE API Reference (port 9250)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem 1rem", fontSize: "0.8rem" }}>
          {[
            ["GET",  "/health",                       "Service health + cycle count"],
            ["GET",  "/cycle/latest",                 "Latest evolution cycle record"],
            ["GET",  "/cycle/history",                "List persisted cycle files"],
            ["POST", "/cycle/trigger",                "Manually trigger evolution cycle"],
            ["GET",  "/executions",                   "Upgrade execution log"],
            ["GET",  "/proposals",                    "Capability design proposals (legacy)"],
            ["GET",  "/code-analysis",                "Latest code health report"],
            ["POST", "/code-analysis/refresh",        "Trigger fresh code scan"],
            ["GET",  "/refactor/proposals",           "Refactor proposal list + summary"],
            ["POST", "/refactor/proposals/:id/approve","Manually approve + validate proposal"],
            ["GET",  "/architecture/topology",        "Service topology + health map"],
            ["POST", "/architecture/analyze",         "Trigger fresh topology analysis"],
            ["GET",  "/promotions",                   "Deployment promotion history"],
            ["GET",  "/validations",                  "Sandbox validation history"],
          ].map(([method, path, desc]) => (
            <div key={path} style={{ display: "flex", gap: "0.5rem", padding: "0.25rem 0", borderTop: "1px solid #1e293b", alignItems: "flex-start" }}>
              <span className={`badge ${method === "GET" ? "badge-green" : "badge-yellow"}`} style={{ minWidth: 42, textAlign: "center" }}>
                {method}
              </span>
              <code style={{ flex: "0 0 260px", color: "#93c5fd" }}>{path}</code>
              <span style={{ color: "#94a3b8" }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
