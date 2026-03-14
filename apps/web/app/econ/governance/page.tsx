import { fetchEcon } from "@/src/lib/econ-api";

export default async function GovernancePage() {
  const executions = await fetchEcon<{ receipts: Array<{ proposalId?: string; strategy?: string; amountWei?: string; ts?: string }> }>("/v1/governance/executions").catch(() => ({ receipts: [] }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Governance</h1>
      <p className="mt-2 text-sm text-gray-400">Proposals, queued actions, and execution receipts.</p>

      <section className="mt-6 rounded-xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-sm font-medium text-gray-300">Recent Execution Receipts</h2>
        <div className="mt-3 space-y-2 text-sm">
          {executions.receipts.length === 0 && <p className="text-gray-400">No execution receipts indexed yet.</p>}
          {executions.receipts.map((r, idx) => (
            <div key={`${r.proposalId ?? "proposal"}-${idx}`} className="grid grid-cols-4 gap-2 border-b border-white/5 pb-1">
              <span>{r.proposalId ?? "n/a"}</span>
              <span>{r.strategy ?? "n/a"}</span>
              <span>{r.amountWei ?? "0"}</span>
              <span>{r.ts ?? "n/a"}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
