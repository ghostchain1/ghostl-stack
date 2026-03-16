import Link from "next/link";
import { notFound } from "next/navigation";
import { GHOST_SITES } from "@ghostchain/config";
import { ChainBadge, GhostFooter, Ghostnavbar } from "@ghostchain/ui-components";

const NAV = [
  { label: "Endpoints", href: "/" },
  { label: "API Keys", href: "/keys" },
  { label: "Usage", href: "/usage" },
  { label: "Docs", href: GHOST_SITES.docs.url },
];

type RpcPortalPage = {
  title: string;
  intro: string;
  cta: { label: string; href: string };
  cards: Array<{ title: string; body: string; chain?: "L1" | "L2" | "L3" }>;
  note: string;
};

const PAGES: Record<string, RpcPortalPage> = {
  keys: {
    title: "API Keys",
    intro: "Provision GhostChain RPC credentials with branded quota controls and chain-aware rate limits.",
    cta: { label: "Inspect usage trends", href: "/usage" },
    cards: [
      { title: "Workspace Keys", body: "Issue per-team keys for GhostChain L1 access and treasury-sensitive workloads.", chain: "L1" },
      { title: "App Keys", body: "Scope high-throughput app traffic to GhostL2 and GhostL3 without overloading shared ingress.", chain: "L2" },
      { title: "Read-Only Profiles", body: "Lock certain keys to `ghost_` read methods for observability and dashboard traffic." },
    ],
    note: "Credential scopes should describe chain access clearly. L3-only keys must not imply direct L1 settlement capability.",
  },
  usage: {
    title: "Usage Analytics",
    intro: "Review request mix, latency, and `ghost_` namespace adoption across the GhostChain RPC estate.",
    cta: { label: "Manage API keys", href: "/keys" },
    cards: [
      { title: "GhostChain L1", body: "Track settlement-heavy reads and canonical proof verification volume.", chain: "L1" },
      { title: "GhostL2", body: "Monitor bridge relay, exchange, and routing intermediary workload.", chain: "L2" },
      { title: "GhostL3", body: "Measure application bursts, creator economy spikes, and archive retrieval traffic.", chain: "L3" },
    ],
    note: "The portal should promote Ghost-native RPC calls first and only surface compatibility fallbacks as secondary detail.",
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug: [slug] }));
}

export default async function RpcPortalSubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/")];
  if (!page) notFound();

  return (
    <>
      <Ghostnavbar appName="RPC Portal" nav={NAV} />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-violet-400 mb-2">Ghost RPC Portal</p>
            <h1 className="text-3xl font-bold text-zinc-100 mb-2">{page.title}</h1>
            <p className="text-sm text-zinc-400 max-w-2xl">{page.intro}</p>
          </div>
          <Link href={page.cta.href} className="px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-zinc-100 hover:bg-zinc-800 transition-colors">
            {page.cta.label}
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {page.cards.map((card) => (
            <div key={card.title} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-100">{card.title}</h2>
                {card.chain ? <ChainBadge chain={card.chain} showLabel={false} /> : null}
              </div>
              <p className="text-sm text-zinc-400 leading-6">{card.body}</p>
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
