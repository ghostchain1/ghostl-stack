import { fetchEcon } from "@/src/lib/econ-api";

export default async function FlowsPage() {
  const summary = await fetchEcon<{ totals: Record<string, string>; flowCount: number }>("/v1/flows/summary").catch(() => ({ totals: {}, flowCount: 0 }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Flows</h1>
      <p className="mt-2 text-sm text-gray-400">L3 → L2 → L1 fee flow and routing-law proof counters.</p>

      <section className="mt-6 rounded-xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-sm font-medium text-gray-300">Flow Totals</h2>
        <div className="mt-3 space-y-2 text-sm">
          {Object.keys(summary.totals).length === 0 && <p className="text-gray-400">No flow totals indexed yet.</p>}
          {Object.entries(summary.totals).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-white/5 pb-1">
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-gray-400">Indexed flow events: {summary.flowCount}</p>
      </section>
    </main>
  );
}
