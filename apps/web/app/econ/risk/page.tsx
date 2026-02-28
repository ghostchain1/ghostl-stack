import { fetchEcon } from "@/src/lib/econ-api";

export default async function RiskPage() {
  const exposures = await fetchEcon<{ exposures: Array<{ strategy: string; exposureWei: string }> }>("/v1/risk/exposures").catch(() => ({ exposures: [] }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Risk</h1>
      <p className="mt-2 text-sm text-gray-400">Policy constraints and strategy exposure overview.</p>

      <section className="mt-6 rounded-xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-sm font-medium text-gray-300">Current Exposures</h2>
        <div className="mt-3 space-y-2 text-sm">
          {exposures.exposures.length === 0 && <p className="text-gray-400">No exposures indexed yet.</p>}
          {exposures.exposures.map((e) => (
            <div key={e.strategy} className="flex justify-between border-b border-white/5 pb-1">
              <span>{e.strategy}</span>
              <span>{e.exposureWei}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
