import { Ghostnavbar } from "@ghostchain/ui-components";
import { GhostFooter } from "@ghostchain/ui-components";
import { ChainBadge } from "@ghostchain/ui-components";
import { StatusDot } from "@ghostchain/ui-components";

const NAV = [
  { label: "Dashboard",  href: "/" },
  { label: "Models",     href: "/models" },
  { label: "Alerts",     href: "/alerts" },
  { label: "Proposals",  href: "/proposals" },
];

const METRICS = [
  { label: "Transactions classified",  value: "—",   sub: "last 24h" },
  { label: "Risk alerts triggered",    value: "—",   sub: "last 24h" },
  { label: "Proposals drafted by AI",  value: "—",   sub: "pending ratification" },
  { label: "Fraud patterns detected",  value: "—",   sub: "all-time" },
];

export default function AIPage() {
  return (
    <>
      <Ghostnavbar appName="GhostBrain" nav={NAV} />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-zinc-100 mb-1">GhostBrain</h1>
            <p className="text-zinc-400 text-sm">AI-powered transaction intelligence, risk scoring, and autonomous governance drafting.</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
            <StatusDot status="healthy" />
            Core API · port 7900
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {METRICS.map(({ label, value, sub }) => (
            <div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="text-2xl font-bold text-zinc-100 mb-1">{value}</div>
              <div className="text-xs text-zinc-400 font-medium">{label}</div>
              <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* Layer coverage */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 mb-6">
          <h2 className="text-sm font-semibold text-zinc-100 mb-4">Layer Coverage</h2>
          <div className="flex flex-col gap-3">
            {(["L1", "L2", "L3"] as const).map((chain) => (
              <div key={chain} className="flex items-center gap-3">
                <ChainBadge chain={chain} />
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-600 rounded-full w-full animate-pulse opacity-60" />
                </div>
                <StatusDot status="healthy" />
              </div>
            ))}
          </div>
        </div>

        {/* Governance note */}
        <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 text-sm text-amber-400">
          <strong className="font-medium">Autonomous governance:</strong> GhostBrain may draft proposals but cannot execute them on-chain without human ratification via governance quorum.
        </div>
      </main>

      <GhostFooter />
    </>
  );
}
