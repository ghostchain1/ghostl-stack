/**
 * Ghost AI Intelligence Engine (GIE) Dashboard
 *
 * Shows the meta-intelligence state: long-term memory, ecosystem predictions,
 * adaptive learning stats, decision recommendations, and knowledge graph.
 */

import {
  fetchGieSummary,
  fetchGiePredictions,
  fetchGieLearningStats,
  fetchGieDecisions,
  fetchGieDecisionStats,
  fetchGieMemoryStats,
  fetchGieMemoryEvents,
  fetchGieKnowledgeStats,
  type GiePrediction,
  type GieDecision,
} from "@/lib/api";

export const revalidate = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(digits);
}

function pct(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "—";
  return `${(rate * 30 * 100).toFixed(1)}%`;   // monthly rate
}

function conf(c: number): string { return `${(c * 100).toFixed(0)}%`; }

function priorityColor(p: GieDecision["priority"]): string {
  return p === "critical" ? "text-red-400"
    : p === "high"       ? "text-orange-400"
    : p === "medium"     ? "text-yellow-400"
    : "text-blue-400";
}

function horizonLabel(h: string): string {
  return h === "30d" ? "30 Days" : h === "60d" ? "60 Days" : "90 Days";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function GiePage() {
  const [summary, predictions, learningStats, decisions, decisionStats, memStats, memEvents, kgStats] =
    await Promise.all([
      fetchGieSummary(),
      fetchGiePredictions(),
      fetchGieLearningStats(),
      fetchGieDecisions(8),
      fetchGieDecisionStats(),
      fetchGieMemoryStats(),
      fetchGieMemoryEvents(10),
      fetchGieKnowledgeStats(),
    ]);

  const online     = summary?.ecosystem?.onlineCount ?? 0;
  const total      = summary?.ecosystem?.totalEngines ?? 9;
  const healthPct  = summary?.predictions?.ecosystemHealth ?? null;
  const pred30     = predictions?.find((p) => p.horizon === "30d") ?? null;
  const pred60     = predictions?.find((p) => p.horizon === "60d") ?? null;
  const pred90     = predictions?.find((p) => p.horizon === "90d") ?? null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-purple-400">🧠 Ghost Intelligence Engine</h1>
        <p className="text-gray-400 mt-1">
          Long-term memory · Predictive analytics · Adaptive learning · Decision optimisation · Knowledge graph
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Memory Events"    value={fmt(memStats?.total)}       sub={`${Object.keys(memStats?.byCategory ?? {}).length} categories`} color="purple" />
        <KpiCard label="Ecosystem Health" value={healthPct !== null ? `${healthPct.toFixed(0)}/100` : "—"} sub={`${online}/${total} engines online`} color={healthPct !== null && healthPct >= 70 ? "green" : "orange"} />
        <KpiCard label="Learning Cycles"  value={fmt(learningStats?.cycles)} sub={`${learningStats?.totalSignals ?? "—"} signals tracked`} color="blue" />
        <KpiCard label="Pending Decisions" value={fmt(decisionStats?.pending)} sub={`${decisionStats?.byPriority?.critical ?? 0} critical`} color={decisionStats?.byPriority?.critical ? "red" : "green"} />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

        {/* Prediction forecasts */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-purple-300 mb-4">📈 Ecosystem Forecasts</h2>
          {predictions && predictions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left pb-2">Horizon</th>
                    <th className="text-right pb-2">Users</th>
                    <th className="text-right pb-2">TVL</th>
                    <th className="text-right pb-2">Validators</th>
                    <th className="text-right pb-2">Health</th>
                    <th className="text-right pb-2">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {[pred30, pred60, pred90].filter(Boolean).map((p) => (
                    <PredRow key={p!.id} pred={p!} />
                  ))}
                </tbody>
              </table>
              {pred30 && (
                <p className="text-xs text-gray-500 mt-3">
                  Method: <span className="text-gray-300">{pred30.method}</span> · Basis: {pred30.basisSize} snapshots
                </p>
              )}
            </div>
          ) : (
            <EmptyState msg="Forecasts will appear after the first data collection cycle." />
          )}
        </section>

        {/* Decision recommendations */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-orange-300 mb-4">⚡ Pending Decisions</h2>
          {decisions && decisions.length > 0 ? (
            <ul className="space-y-3">
              {decisions.map((d) => (
                <li key={d.id} className="bg-gray-800 rounded-lg p-3 text-sm">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <span className={`font-medium text-xs uppercase ${priorityColor(d.priority)}`}>{d.priority}</span>
                    <span className="text-gray-400 text-xs">{d.targetEngine}</span>
                  </div>
                  <p className="text-gray-200 leading-snug">{d.action}</p>
                  <p className="text-gray-500 text-xs mt-1">{d.rationale}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState msg="No pending decisions — ecosystem is stable." />
          )}
          {decisionStats && (
            <div className="mt-4 flex gap-4 text-xs text-gray-400">
              <span>Total: {decisionStats.total}</span>
              <span>Executed: {decisionStats.executed}</span>
              <span>Dismissed: {decisionStats.dismissed}</span>
            </div>
          )}
        </section>
      </div>

      {/* Lower row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">

        {/* Learning stats */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-blue-300 mb-4">🎓 Adaptive Learning</h2>
          {learningStats ? (
            <div className="space-y-3 text-sm">
              <Stat label="Cycles completed"   value={`${learningStats.cycles}`} />
              <Stat label="Model version"      value={`v${learningStats.modelVersion}`} />
              <Stat label="Signals tracked"    value={`${learningStats.totalSignals}`} />
              <Stat label="Stored insights"    value={`${learningStats.insights}`} />
              {learningStats.topSignals.length > 0 && (
                <div>
                  <p className="text-gray-400 mb-1">Top signals</p>
                  <ul className="space-y-1">
                    {learningStats.topSignals.slice(0, 4).map((s) => (
                      <li key={s} className="text-xs text-green-400 font-mono truncate">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {learningStats.riskSignals.length > 0 && (
                <div>
                  <p className="text-gray-400 mb-1">Risk signals</p>
                  <ul className="space-y-1">
                    {learningStats.riskSignals.map((s) => (
                      <li key={s} className="text-xs text-red-400 font-mono truncate">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <EmptyState msg="Learning engine is initialising…" />
          )}
        </section>

        {/* Knowledge graph stats */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-teal-300 mb-4">🕸️ Knowledge Graph</h2>
          {kgStats ? (
            <div className="space-y-3 text-sm">
              <Stat label="Total nodes" value={`${kgStats.nodes}`} />
              <Stat label="Total edges" value={`${kgStats.edges}`} />

              <div>
                <p className="text-gray-400 mb-1">Node types</p>
                <ul className="space-y-1">
                  {Object.entries(kgStats.nodeTypes ?? {}).map(([type, count]) => (
                    <li key={type} className="flex justify-between text-xs">
                      <span className="text-gray-300 capitalize">{type}</span>
                      <span className="text-gray-400">{count as number}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {kgStats.topRelationships?.length > 0 && (
                <div>
                  <p className="text-gray-400 mb-1">Top relationships</p>
                  <ul className="space-y-1">
                    {kgStats.topRelationships.map(({ rel, count }) => (
                      <li key={rel} className="flex justify-between text-xs">
                        <span className="text-teal-400">{rel}</span>
                        <span className="text-gray-400">{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <EmptyState msg="Knowledge graph is loading…" />
          )}
        </section>

        {/* Memory feed */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-pink-300 mb-4">🧠 Recent Memory</h2>
          {memStats && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {Object.entries(memStats.byCategory ?? {}).slice(0, 6).map(([cat, n]) => (
                <div key={cat} className="bg-gray-800 rounded p-2 text-xs">
                  <p className="text-gray-400 capitalize">{cat}</p>
                  <p className="text-pink-300 font-bold">{n as number}</p>
                </div>
              ))}
            </div>
          )}
          {memEvents && memEvents.length > 0 ? (
            <ul className="space-y-2">
              {memEvents.slice(0, 6).map((ev) => (
                <li key={ev.id} className="text-xs border-l-2 border-pink-700 pl-2">
                  <p className="text-gray-300 leading-snug">{ev.event}</p>
                  <p className="text-gray-500 mt-0.5">
                    {ev.category} · {ev.importance}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState msg="Memory events will appear as the engine collects data." />
          )}
        </section>
      </div>

      {/* Footer */}
      <p className="text-center text-gray-600 text-xs">
        GIE · Port 9977 · Data refreshes every 30 s
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color,
}: {
  label: string; value: string; sub?: string;
  color: "purple" | "blue" | "green" | "orange" | "red" | "teal";
}) {
  const palette: Record<string, string> = {
    purple: "border-purple-700 text-purple-300",
    blue:   "border-blue-700 text-blue-300",
    green:  "border-green-700 text-green-300",
    orange: "border-orange-700 text-orange-300",
    red:    "border-red-700 text-red-300",
    teal:   "border-teal-700 text-teal-300",
  };
  return (
    <div className={`bg-gray-900 border rounded-xl p-4 ${palette[color] ?? "border-gray-700 text-gray-300"}`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function PredRow({ pred }: { pred: GiePrediction }) {
  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800">
      <td className="py-2 text-purple-300 font-medium">{horizonLabel(pred.horizon)}</td>
      <td className="py-2 text-right text-gray-200">{fmt(pred.predictions.users.forecast)}</td>
      <td className="py-2 text-right text-gray-200">${fmt(pred.predictions.tvl.forecast)}</td>
      <td className="py-2 text-right text-gray-200">{fmt(pred.predictions.validators.forecast)}</td>
      <td className="py-2 text-right">
        <span className={pred.predictions.ecosystemHealth >= 70 ? "text-green-400" : "text-orange-400"}>
          {pred.predictions.ecosystemHealth.toFixed(1)}
        </span>
      </td>
      <td className="py-2 text-right text-gray-400">{conf(pred.confidence)}</td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-200 font-medium">{value}</span>
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return <p className="text-sm text-gray-500 italic">{msg}</p>;
}
