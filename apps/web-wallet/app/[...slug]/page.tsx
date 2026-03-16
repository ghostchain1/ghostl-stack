import Link from "next/link";
import { notFound } from "next/navigation";
import { ChainBadge, GhostFooter, Ghostnavbar } from "@ghostchain/ui-components";

const NAV = [
  { label: "Send", href: "/send" },
  { label: "Receive", href: "/receive" },
  { label: "History", href: "/history" },
  { label: "Settings", href: "/settings" },
];

type WalletPage = {
  title: string;
  intro: string;
  cta: { label: string; href: string };
  cards: Array<{ title: string; body: string; chain?: "L1" | "L2" | "L3" }>;
  note: string;
};

const PAGES: Record<string, WalletPage> = {
  send: {
    title: "Send GST",
    intro: "Transfer GST across GhostChain L1, GhostL2, and GhostL3 with routing-aware execution.",
    cta: { label: "Review transfer history", href: "/history" },
    cards: [
      { title: "L1 Settlement", body: "Final external settlement remains anchored on GhostChain L1.", chain: "L1" },
      { title: "L2 Throughput", body: "Use GhostL2 for lower latency transfers and exchange-side liquidity.", chain: "L2" },
      { title: "L3 Utility", body: "Use GhostL3 for application-heavy movement and creator economy flows.", chain: "L3" },
    ],
    note: "GhostWallet only exposes GST-denominated transfers. No ETH or non-GST gas paths are surfaced.",
  },
  receive: {
    title: "Receive GST",
    intro: "Generate branded receive instructions for any Ghost layer and map them to your Ghost Name System identity.",
    cta: { label: "Open wallet settings", href: "/settings" },
    cards: [
      { title: "Primary Address", body: "Use one canonical GhostWallet identity and expose layer-specific deposit instructions." },
      { title: "GNS Resolution", body: "Bind readable Ghost names to your address book so senders can resolve destinations safely." },
      { title: "Bridge Awareness", body: "Inbound flow from GhostL3 always reconciles through GhostL2 before L1 settlement.", chain: "L2" },
    ],
    note: "Display the chain ID in every receive flow: 14000101 for L1, 901 for L2, and 903 for L3.",
  },
  history: {
    title: "Transaction History",
    intro: "Audit recent GST movement, cross-layer relays, and pending bridge confirmations from one branded ledger.",
    cta: { label: "Send more GST", href: "/send" },
    cards: [
      { title: "Native Transfers", body: "Spot direct Ghost RPC transfer records and distinguish them from queued bridge relays." },
      { title: "Bridge Events", body: "Track L3 -> L2 -> L1 progression without breaking the routing law." },
      { title: "Finality Checks", body: "Use canonical oracle confirmations to explain when a movement is fully settled.", chain: "L1" },
    ],
    note: "History entries should always explain whether the move was direct on-layer or part of a cross-layer route.",
  },
  settings: {
    title: "Wallet Settings",
    intro: "Harden your GhostWallet defaults for routing safety, RPC hygiene, and branded identity management.",
    cta: { label: "Prepare a receive profile", href: "/receive" },
    cards: [
      { title: "RPC Namespace", body: "Prefer Ghost-native `ghost_` methods for all wallet and balance reads." },
      { title: "Chain Guardrails", body: "Reject any direct L3 -> L1 call path and keep the L3 -> L2 -> L1 invariant enforced." },
      { title: "Identity Controls", body: "Manage GhostWallet profile metadata, GNS aliases, and safe contact labeling." },
    ],
    note: "Security posture should remain GhostChain branded end-to-end: GhostWallet, GhostScan, GNS, GST, and GhostXchange.",
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug: [slug] }));
}

export default async function WalletSubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/")];
  if (!page) notFound();

  return (
    <>
      <Ghostnavbar appName="GhostWallet" nav={NAV} />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-violet-400 mb-2">GhostWallet</p>
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
