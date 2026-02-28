import { fetchEcon } from "@/src/lib/econ-api";

export default async function ProofsPage() {
  const snapshots = await fetchEcon<{ snapshots: Array<{ epoch: number; root: string; uri: string; ts: string }> }>("/v1/proofs/snapshots").catch(() => ({ snapshots: [] }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Proofs</h1>
      <p className="mt-2 text-sm text-gray-400">Merkle snapshots and verification artifacts.</p>

      <section className="mt-6 rounded-xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-sm font-medium text-gray-300">Snapshot Registry</h2>
        <div className="mt-3 space-y-2 text-xs">
          {snapshots.snapshots.length === 0 && <p className="text-gray-400">No snapshots indexed yet.</p>}
          {snapshots.snapshots.map((s, idx) => (
            <div key={`${s.epoch}-${idx}`} className="grid grid-cols-4 gap-2 border-b border-white/5 pb-1">
              <span>epoch {s.epoch}</span>
              <span className="truncate">{s.root}</span>
              <span className="truncate">{s.uri}</span>
              <span>{s.ts}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
