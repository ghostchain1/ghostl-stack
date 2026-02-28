import { fetchEcon } from "@/src/lib/econ-api";

export default async function TreasuryPage() {
  const holdings = await fetchEcon<{ treasuryBalanceWei: string; positions: Array<{ strategy: string; amountWei: string }> }>("/v1/treasury/holdings").catch(() => ({ treasuryBalanceWei: "0", positions: [] }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Treasury</h1>
      <p className="mt-2 text-sm text-gray-400">Holdings, inflows/outflows, and strategy positions.</p>

      <section className="mt-6 rounded-xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-sm font-medium text-gray-300">Treasury Balance (wei)</h2>
        <p className="mt-2 text-xl font-semibold">{holdings.treasuryBalanceWei}</p>
      </section>

      <section className="mt-6 rounded-xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-sm font-medium text-gray-300">Strategy Positions</h2>
        <div className="mt-3 space-y-2 text-sm">
          {holdings.positions.length === 0 && <p className="text-gray-400">No indexed positions yet.</p>}
          {holdings.positions.map((p, idx) => (
            <div key={`${p.strategy}-${idx}`} className="flex justify-between border-b border-white/5 pb-1">
              <span>{p.strategy}</span>
              <span>{p.amountWei}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
