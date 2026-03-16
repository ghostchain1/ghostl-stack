import Link from "next/link";
import { notFound } from "next/navigation";
import { ChainBadge, GhostFooter, Ghostnavbar, StatusDot } from "@ghostchain/ui-components";

const NAV = [
  { label: "Bridge", href: "/" },
  { label: "History", href: "/history" },
  { label: "Status", href: "/status" },
];

type BridgePage = {
  title: string;
  intro: string;
  cta: { label: string; href: string };
  routes: Array<{ title: string; description: string; from: "L1" | "L2" | "L3"; to: "L1" | "L2" | "L3" }>;
  note: string;
};

const PAGES: Record<string, BridgePage> = {
  history: {
    title: "Bridge History",
    intro: "Inspect every GST bridge movement with explicit routing-law visibility and finality checkpoints.",
    cta: { label: "Check live bridge health", href: "/status" },
    routes: [
      { title: "Creator settlement", description: "GhostL3 payouts reconcile into GhostL2 before settlement propagation.", from: "L3", to: "L2" },
      { title: "Treasury settlement", description: "Treasury-bound flows finalize through GhostChain L1 after GhostL2 relay.", from: "L2", to: "L1" },
      { title: "Application returns", description: "Inbound flows back to app space re-enter through GhostL2 before GhostL3.", from: "L2", to: "L3" },
    ],
    note: "Every history view should explain why direct L3 -> L1 hops do not exist in GhostChain.",
  },
  status: {
    title: "Bridge Status",
    intro: "Review the operational state of the canonical bridge contracts and cross-layer relay path.",
    cta: { label: "Review bridge history", href: "/history" },
    routes: [
      { title: "L2L3Bridge", description: "Primary utility-chain relay contract at 0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2.", from: "L3", to: "L2" },
      { title: "L1 Rollup", description: "GhostL2 settlement contract at 0xad32D5C2Da9f4159C4cc98686C005852b3905355.", from: "L2", to: "L1" },
      { title: "L2 Rollup", description: "GhostL3 settlement contract at 0x130A46b6E41DB6E1e18fb9c759F223c459190e90.", from: "L2", to: "L3" },
    ],
    note: "Finality remains oracle-driven per layer: L1 0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422, L2 0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A, L3 0x87F850cbC2cFfac086F20d0d7307E12d06fA2127.",
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug: [slug] }));
}

export default async function BridgeSubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/")];
  if (!page) notFound();

  return (
    <>
      <Ghostnavbar appName="Bridge" nav={NAV} />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-violet-400 mb-2">GhostChain Bridge</p>
            <h1 className="text-3xl font-bold text-zinc-100 mb-2">{page.title}</h1>
            <p className="text-sm text-zinc-400 max-w-2xl">{page.intro}</p>
          </div>
          <Link href={page.cta.href} className="px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-zinc-100 hover:bg-zinc-800 transition-colors">
            {page.cta.label}
          </Link>
        </div>

        <div className="flex flex-col gap-4 mb-8">
          {page.routes.map((route) => (
            <div key={route.title} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-center gap-3 mb-3">
                <StatusDot status="healthy" />
                <h2 className="text-sm font-semibold text-zinc-100">{route.title}</h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3">
                <ChainBadge chain={route.from} showLabel={false} />
                <span>-&gt;</span>
                <ChainBadge chain={route.to} showLabel={false} />
              </div>
              <p className="text-sm text-zinc-400 leading-6">{route.description}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400 leading-6">
          {page.note}
        </div>
      </main>
      <GhostFooter />
    </>
  );
}
