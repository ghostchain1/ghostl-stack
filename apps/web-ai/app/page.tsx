import { headers } from "next/headers";
import { ChainBadge, GhostFooter, Ghostnavbar, StatusDot } from "@ghostchain/ui-components";

const NAV = [
  { label: "Dashboard", href: "/" },
  { label: "Models", href: "/models" },
  { label: "Alerts", href: "/alerts" },
  { label: "Proposals", href: "/proposals" },
];

const METRICS = [
  { label: "Transactions classified", value: "—", sub: "last 24h" },
  { label: "Risk alerts triggered", value: "—", sub: "last 24h" },
  { label: "Proposals drafted by AI", value: "—", sub: "pending ratification" },
  { label: "Fraud patterns detected", value: "—", sub: "all-time" },
];

const domainVariants = {
  default: {
    appName: "GhostBrain",
    title: "GhostBrain",
    subtitle: "AI-powered transaction intelligence, risk scoring, fraud detection, and autonomous governance drafting.",
    banner: "GhostBrain powers monitoring, automation, and incident intelligence across the GhostChain stack.",
  },
  "ghostchain.space": {
    appName: "GhostChain Space",
    title: "GhostChain Space",
    subtitle: "Network intelligence, GhostBrain telemetry, and AI-managed operational awareness across the GhostChain mesh.",
    banner: "ghostchain.space is the owned-domain entry point for GhostBrain and the wider AI control surface.",
  },
} as const;

function normalizeHost(value: string | null) {
  return (value || "").split(":")[0].replace(/^www\./, "").toLowerCase();
}

async function getVariant() {
  const requestHeaders = await headers();
  const host = normalizeHost(requestHeaders.get("x-forwarded-host") || requestHeaders.get("host"));
  return domainVariants[host as keyof typeof domainVariants] || domainVariants.default;
}

export default async function AIPage() {
  const variant = await getVariant();

  return (
    <>
      <Ghostnavbar appName={variant.appName} nav={NAV} />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm text-violet-200 mb-8">
          {variant.banner}
        </div>

        <div className="flex items-center justify-between mb-10 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-zinc-100 mb-1">{variant.title}</h1>
            <p className="text-zinc-400 text-sm">{variant.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
            <StatusDot status="healthy" />
            Core API · port 7900
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {METRICS.map(({ label, value, sub }) => (
            <div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="text-2xl font-bold text-zinc-100 mb-1">{value}</div>
              <div className="text-xs text-zinc-400 font-medium">{label}</div>
              <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 mb-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
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

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-sm font-semibold text-zinc-100 mb-4">Quick Links</h2>
            <div className="flex flex-col gap-3 text-sm">
              <a href="https://portal.ghostchain.cloud" className="text-zinc-300 hover:text-violet-300 transition-colors">Ghost Portal →</a>
              <a href="https://status.ghostchain.cloud" className="text-zinc-300 hover:text-violet-300 transition-colors">Network Status →</a>
              <a href="https://docs.ghostchain.cloud/architecture/ghostbrain" className="text-zinc-300 hover:text-violet-300 transition-colors">GhostBrain Architecture →</a>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 text-sm text-amber-400">
          <strong className="font-medium">Autonomous governance:</strong> GhostBrain may draft proposals, but execution stays gated behind human ratification and GhostChain governance quorum.
        </div>
      </main>

      <GhostFooter />
    </>
  );
}
