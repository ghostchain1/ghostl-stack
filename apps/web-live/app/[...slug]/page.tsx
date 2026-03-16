import Link from "next/link";
import { notFound } from "next/navigation";
import { GhostFooter, Ghostnavbar, StatusDot } from "@ghostchain/ui-components";

const NAV = [
  { label: "Live Now", href: "/" },
  { label: "Schedule", href: "/schedule" },
  { label: "Archive", href: "/archive" },
  { label: "Create", href: "/create" },
];

type LivePage = {
  title: string;
  intro: string;
  cta: { label: string; href: string };
  items: Array<{ title: string; body: string; accent: string }>;
  note: string;
};

const PAGES: Record<string, LivePage> = {
  schedule: {
    title: "Streaming Schedule",
    intro: "Coordinate governance calls, validator briefings, and builder streams across GhostChain layers.",
    cta: { label: "Open creator tools", href: "/create" },
    items: [
      { title: "Validator Forum", body: "Daily network review focused on uptime, missed blocks, and GST yield distribution.", accent: "#FFD700" },
      { title: "GhostBrain Briefing", body: "Model-quality review for proposal drafting, anomaly detection, and policy assist.", accent: "#8B5CF6" },
      { title: "Builder Launches", body: "New GhostL3 applications demo creator tooling, routing safety, and GST monetization.", accent: "#06B6D4" },
    ],
    note: "Publishing still respects the GhostChain routing law: GhostL3 stream utility settles through GhostL2 before L1 accounting.",
  },
  archive: {
    title: "Stream Archive",
    intro: "Browse recorded sessions with GhostChain-native metadata, payout history, and GST revenue attribution.",
    cta: { label: "View the live lineup", href: "/" },
    items: [
      { title: "Governance Replays", body: "Replay passed and failed proposal debates with GST-weighted participation context.", accent: "#10B981" },
      { title: "Developer Sessions", body: "Reference implementation walk-throughs for Ghost SDKs, GNS, and bridge operations.", accent: "#FFAA00" },
      { title: "Ecosystem Broadcasts", body: "Creator economy updates, GhostXchange releases, and validator onboarding sessions.", accent: "#EC4899" },
    ],
    note: "Archive pages should retain provenance and GST monetization context, not just the raw video asset.",
  },
  create: {
    title: "Creator Studio",
    intro: "Prepare a GhostChain-native live event with GST monetization, moderation, and layer-aware payout routing.",
    cta: { label: "Review the publishing schedule", href: "/schedule" },
    items: [
      { title: "Stream Identity", body: "Bind your channel to a Ghost name and publish under a verified creator profile.", accent: "#8B5CF6" },
      { title: "GST Revenue", body: "Define subscription tiers, tipping rules, and archive payout flow on GhostL3.", accent: "#10B981" },
      { title: "Safety Controls", body: "Require moderation, replay retention, and payout review before final settlement.", accent: "#EF4444" },
    ],
    note: "LitVyb Live is GST-first. Creator revenue, memberships, and replay licensing stay denominated in GST.",
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug: [slug] }));
}

export default async function LiveSubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/")];
  if (!page) notFound();

  return (
    <>
      <Ghostnavbar appName="Live" nav={NAV} />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-violet-400 mb-2">LitVyb Live</p>
            <h1 className="text-3xl font-bold text-zinc-100 mb-2">{page.title}</h1>
            <p className="text-sm text-zinc-400 max-w-2xl">{page.intro}</p>
          </div>
          <Link href={page.cta.href} className="px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-zinc-100 hover:bg-zinc-800 transition-colors">
            {page.cta.label}
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {page.items.map((item) => (
            <div key={item.title} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-center gap-2 mb-3">
                <StatusDot status="healthy" />
                <h2 className="text-sm font-semibold text-zinc-100">{item.title}</h2>
              </div>
              <div className="w-14 h-1 rounded-full mb-4" style={{ background: item.accent }} />
              <p className="text-sm text-zinc-400 leading-6">{item.body}</p>
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
