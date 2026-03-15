"use client";
import useSWR from "swr";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemoryStats {
  total:          number;
  successful:     number;
  avgSuccessScore: number;
  domains:        Record<string, number>;
  agents:         Record<string, number>;
}

interface StratStats {
  total:          number;
  byPriority:     Record<string, number>;
  avgSuccessRate: number;
}

interface GraphStats {
  totalNodes:    number;
  totalEdges:    number;
  nodesByType:   Record<string, number>;
  avgEdgeWeight: number;
}

interface Snapshot {
  systemStatus:     "healthy" | "learning" | "degraded";
  strategiesCount:  number;
  topInsightCount:  number;
  topPatternCount:  number;
}

interface LearningInsight {
  id:              string;
  pattern:         string;
  domain:          string;
  agent:           string;
  confidence:      number;
  recommendation:  string;
  basedOnEntries:  number;
  avgSuccessScore: number;
}

interface PatternResult {
  id:         string;
  type:       string;
  label:      string;
  count:      number;
  frequency:  number;
  trend:      "rising" | "stable" | "declining";
  confidence: number;
  insight:    string;
}

interface EvolvedStrategy {
  id:             string;
  name:           string;
  domain:         string;
  linkedAgent:    string;
  priority:       "critical" | "high" | "medium" | "low" | "archived";
  successRate:    number;
  iterations:     number;
  lastOutcome:    "improved" | "degraded" | "stable";
  recommendation: string;
}

interface ScoredDecision {
  action:          string;
  domain:          string;
  confidenceLevel: "high" | "medium" | "low" | "insufficient-data";
  avgSuccessScore: number;
  sampleSize:      number;
  recommendation:  string;
}

interface CognitiveData {
  summary:        { snapshot: Snapshot; memStats: MemoryStats; stratStats: StratStats; cycleCount: number } | null;
  insights:       { count: number; insights: LearningInsight[] } | null;
  patterns:       { count: number; patterns: PatternResult[] } | null;
  strategies:     { count: number; strategies: EvolvedStrategy[] } | null;
  decisions:      { decisions: ScoredDecision[] } | null;
  knowledgeStats: GraphStats | null;
  error?:         string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_BADGE: Record<string, string> = {
  critical: "badge-red",
  high:     "badge-yellow",
  medium:   "badge-cyan",
  low:      "badge-gray",
  archived: "badge-gray",
};

const OUTCOME_BADGE: Record<string, string> = {
  improved: "badge-green",
  stable:   "badge-cyan",
  degraded: "badge-red",
};

const TREND_ICON: Record<string, string> = {
  rising:   "↑",
  stable:   "→",
  declining: "↓",
};

const CONF_BADGE: Record<string, string> = {
  high:               "badge-green",
  medium:             "badge-yellow",
  low:                "badge-red",
  "insufficient-data":"badge-gray",
};

const STATUS_COLOR: Record<string, string> = {
  healthy:  "#10b981",
  learning: "#f59e0b",
  degraded: "#ef4444",
};

function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CognitivePage() {
  const { data, isLoading, mutate } = useSWR<CognitiveData>(
    "/api/cognitive/status",
    fetcher,
    { refreshInterval: 15_000 },
  );

  const summary       = data?.summary       ?? null;
  const insights      = data?.insights      ?? null;
  const patterns      = data?.patterns      ?? null;
  const strategies    = data?.strategies    ?? null;
  const decisions     = data?.decisions     ?? null;
  const graphStats    = data?.knowledgeStats ?? null;
  const offline       = !isLoading && (!!data?.error || !summary);

  const snap          = summary?.snapshot;
  const memStats      = summary?.memStats;
  const stratStats    = summary?.stratStats;
  const topInsights   = insights?.insights?.slice(0, 6)  ?? [];
  const topPatterns   = patterns?.patterns?.slice(0, 6)  ?? [];
  const topStrategies = strategies?.strategies?.slice(0, 8) ?? [];
  const topDecisions  = decisions?.decisions?.slice(0, 8) ?? [];

  return (
    <div className="c3-page">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="c3-page-header">
        <div>
          <h1 className="c3-page-title">🧠 GhostBrain Cognitive Layer</h1>
          <p className="c3-page-subtitle">
            Persistent memory · Learning engine · Strategy evolution · Decision optimiser
          </p>
        </div>
        <div className="c3-header-actions">
          <span
            className="c3-status-dot"
            style={{ background: offline ? "#ef4444" : "#10b981" }}
            title={offline ? "GCL Offline" : "GCL Online"}
          />
          <span className="c3-label">{offline ? "Offline" : "Online · Port 9989"}</span>
          <button className="c3-btn-secondary" onClick={() => mutate()}>Refresh</button>
        </div>
      </div>

      {offline && (
        <div className="c3-alert c3-alert-error">
          GhostBrain Cognitive Layer (port 9989) is offline. Start it with{" "}
          <code>make cognitive-dev</code>.
          {data?.error && <> — {data.error}</>}
        </div>
      )}

      {isLoading && <div className="c3-loading">Loading cognitive data…</div>}

      {!isLoading && !offline && (
        <>
          {/* ── KPI Row ─────────────────────────────────────────────────── */}
          <div className="c3-kpi-row">
            <div className="c3-kpi">
              <div className="c3-kpi-label">System Status</div>
              <div
                className="c3-kpi-value"
                style={{ color: STATUS_COLOR[snap?.systemStatus ?? "healthy"] }}
              >
                {(snap?.systemStatus ?? "—").toUpperCase()}
              </div>
            </div>
            <div className="c3-kpi">
              <div className="c3-kpi-label">Memory Entries</div>
              <div className="c3-kpi-value">{memStats?.total ?? "—"}</div>
            </div>
            <div className="c3-kpi">
              <div className="c3-kpi-label">Avg Success Score</div>
              <div className="c3-kpi-value">
                {memStats ? pct(memStats.avgSuccessScore) : "—"}
              </div>
            </div>
            <div className="c3-kpi">
              <div className="c3-kpi-label">Evolved Strategies</div>
              <div className="c3-kpi-value">{stratStats?.total ?? snap?.strategiesCount ?? "—"}</div>
            </div>
            <div className="c3-kpi">
              <div className="c3-kpi-label">Avg Strategy Rate</div>
              <div className="c3-kpi-value">
                {stratStats ? pct(stratStats.avgSuccessRate) : "—"}
              </div>
            </div>
            <div className="c3-kpi">
              <div className="c3-kpi-label">Knowledge Nodes</div>
              <div className="c3-kpi-value">{graphStats?.totalNodes ?? "—"}</div>
            </div>
            <div className="c3-kpi">
              <div className="c3-kpi-label">Knowledge Edges</div>
              <div className="c3-kpi-value">{graphStats?.totalEdges ?? "—"}</div>
            </div>
            <div className="c3-kpi">
              <div className="c3-kpi-label">Cognitive Cycles</div>
              <div className="c3-kpi-value">{summary?.cycleCount ?? "—"}</div>
            </div>
          </div>

          {/* ── Memory Domain Breakdown ──────────────────────────────────── */}
          <div className="c3-section">
            <h2 className="c3-section-title">Memory by Domain</h2>
            <div className="c3-tag-grid">
              {Object.entries(memStats?.domains ?? {}).map(([domain, count]) => (
                <div key={domain} className="c3-tag-item">
                  <span className="c3-tag-label">{domain}</span>
                  <span className="badge badge-cyan">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Top Learning Insights ────────────────────────────────────── */}
          <div className="c3-section">
            <h2 className="c3-section-title">
              Learning Insights
              <span className="c3-section-count">{insights?.count ?? 0}</span>
            </h2>
            {topInsights.length === 0 ? (
              <div className="c3-empty">No insights yet — accumulating memory…</div>
            ) : (
              <div className="c3-table-wrapper">
                <table className="c3-table">
                  <thead>
                    <tr>
                      <th>Pattern</th>
                      <th>Domain</th>
                      <th>Agent</th>
                      <th>Confidence</th>
                      <th>Entries</th>
                      <th>Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topInsights.map(i => (
                      <tr key={i.id}>
                        <td>{i.pattern}</td>
                        <td><span className="badge badge-cyan">{i.domain}</span></td>
                        <td><code>{i.agent}</code></td>
                        <td>{pct(i.confidence)}</td>
                        <td>{i.basedOnEntries}</td>
                        <td className="c3-cell-muted">{i.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Pattern Analysis ─────────────────────────────────────────── */}
          <div className="c3-section">
            <h2 className="c3-section-title">
              Detected Patterns
              <span className="c3-section-count">{patterns?.count ?? 0}</span>
            </h2>
            {topPatterns.length === 0 ? (
              <div className="c3-empty">No patterns detected yet.</div>
            ) : (
              <div className="c3-table-wrapper">
                <table className="c3-table">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Type</th>
                      <th>Count</th>
                      <th>Frequency/hr</th>
                      <th>Trend</th>
                      <th>Confidence</th>
                      <th>Insight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPatterns.map(p => (
                      <tr key={p.id}>
                        <td>{p.label}</td>
                        <td><span className="badge badge-gray">{p.type}</span></td>
                        <td>{p.count}</td>
                        <td>{p.frequency}</td>
                        <td>{TREND_ICON[p.trend]} {p.trend}</td>
                        <td>{pct(p.confidence)}</td>
                        <td className="c3-cell-muted">{p.insight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Evolved Strategies ───────────────────────────────────────── */}
          <div className="c3-section">
            <h2 className="c3-section-title">
              Evolved Strategies
              <span className="c3-section-count">{strategies?.count ?? 0}</span>
            </h2>
            {topStrategies.length === 0 ? (
              <div className="c3-empty">No strategies loaded.</div>
            ) : (
              <div className="c3-table-wrapper">
                <table className="c3-table">
                  <thead>
                    <tr>
                      <th>Strategy</th>
                      <th>Domain</th>
                      <th>Agent</th>
                      <th>Priority</th>
                      <th>Success Rate</th>
                      <th>Iterations</th>
                      <th>Last Outcome</th>
                      <th>Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topStrategies.map(s => (
                      <tr key={s.id}>
                        <td><strong>{s.name}</strong></td>
                        <td><span className="badge badge-cyan">{s.domain}</span></td>
                        <td><code>{s.linkedAgent}</code></td>
                        <td>
                          <span className={`badge ${PRIORITY_BADGE[s.priority] ?? "badge-gray"}`}>
                            {s.priority}
                          </span>
                        </td>
                        <td>{pct(s.successRate)}</td>
                        <td>{s.iterations}</td>
                        <td>
                          <span className={`badge ${OUTCOME_BADGE[s.lastOutcome] ?? "badge-gray"}`}>
                            {s.lastOutcome}
                          </span>
                        </td>
                        <td className="c3-cell-muted">{s.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Decision Confidence ──────────────────────────────────────── */}
          <div className="c3-section">
            <h2 className="c3-section-title">Decision Confidence Map</h2>
            {topDecisions.length === 0 ? (
              <div className="c3-empty">No decision data available.</div>
            ) : (
              <div className="c3-table-wrapper">
                <table className="c3-table">
                  <thead>
                    <tr>
                      <th>Action Pattern</th>
                      <th>Domain</th>
                      <th>Confidence</th>
                      <th>Avg Score</th>
                      <th>Samples</th>
                      <th>Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDecisions.map(d => (
                      <tr key={d.action}>
                        <td><code>{d.action}</code></td>
                        <td><span className="badge badge-cyan">{d.domain}</span></td>
                        <td>
                          <span className={`badge ${CONF_BADGE[d.confidenceLevel] ?? "badge-gray"}`}>
                            {d.confidenceLevel}
                          </span>
                        </td>
                        <td>{pct(d.avgSuccessScore)}</td>
                        <td>{d.sampleSize}</td>
                        <td className="c3-cell-muted">{d.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Knowledge Graph Stats ────────────────────────────────────── */}
          <div className="c3-section">
            <h2 className="c3-section-title">Knowledge Graph</h2>
            <div className="c3-kpi-row">
              {Object.entries(graphStats?.nodesByType ?? {}).map(([type, count]) => (
                <div key={type} className="c3-kpi">
                  <div className="c3-kpi-label">{type}</div>
                  <div className="c3-kpi-value">{count}</div>
                </div>
              ))}
              <div className="c3-kpi">
                <div className="c3-kpi-label">Avg Edge Weight</div>
                <div className="c3-kpi-value">{graphStats?.avgEdgeWeight ?? "—"}</div>
              </div>
            </div>
          </div>

          {/* ── Strategy Priority Distribution ───────────────────────────── */}
          {stratStats?.byPriority && (
            <div className="c3-section">
              <h2 className="c3-section-title">Strategy Priority Distribution</h2>
              <div className="c3-tag-grid">
                {Object.entries(stratStats.byPriority).map(([p, count]) => (
                  <div key={p} className="c3-tag-item">
                    <span className={`badge ${PRIORITY_BADGE[p] ?? "badge-gray"}`}>{p}</span>
                    <span className="c3-tag-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
