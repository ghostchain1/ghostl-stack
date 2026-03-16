import { headers } from "next/headers";
import { GhostFooter, Ghostnavbar, StatusDot } from "@ghostchain/ui-components";

const NAV = [
  { label: "Live Now", href: "/" },
  { label: "Schedule", href: "/schedule" },
  { label: "Archive", href: "/archive" },
  { label: "Create", href: "/create" },
];

const FEATURED = [
  { title: "GhostChain Governance Call #14", host: "ghost.dao", viewers: "—", tags: ["Governance", "L1"] },
  { title: "Building on GhostL3", host: "ghostdev.gns", viewers: "—", tags: ["Dev", "L3"] },
  { title: "GhostXchange LP Deep Dive", host: "ghostx.gns", viewers: "—", tags: ["DeFi", "GhostXchange"] },
];

const domainVariants = {
  default: {
    appName: "LitVyb Live",
    title: "LitVyb Live",
    subtitle: "Watch and host on-chain streams. Monetize with GST on GhostL3.",
    ctaLabel: "Download App →",
    ctaHref: "https://apps.ghostchain.cloud/vyb/download",
    banner: "Creator economy and live social surfaces anchored to GhostL3.",
  },
  "ghostchain.life": {
    appName: "ghostchain.life",
    title: "GhostChain Life",
    subtitle: "The creator economy and social layer for GhostChain. Stream, tip, subscribe, and monetize in GST.",
    ctaLabel: "Download LitVyb →",
    ctaHref: "https://apps.ghostchain.cloud/vyb/download",
    banner: "ghostchain.life is the consumer-facing GhostChain identity for creators and communities.",
  },
  "ghostchain.live": {
    appName: "ghostchain.live",
    title: "GhostChain Live",
    subtitle: "Live broadcasts, launch events, governance sessions, and creator channels powered by LitVyb Live.",
    ctaLabel: "Open Download Page →",
    ctaHref: "https://apps.ghostchain.cloud/vyb/download",
    banner: "ghostchain.live is the broadcast entry point for the GhostChain media and creator stack.",
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

export default async function LivePage() {
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
          <a href={variant.ctaHref} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
            {variant.ctaLabel}
          </a>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <StatusDot status="healthy" />
          <span className="text-sm font-semibold text-zinc-200">Live Now</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {FEATURED.map(({ title, host, viewers, tags }) => (
            <div key={title} className="group rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden hover:border-zinc-700 transition-colors cursor-pointer">
              <div className="aspect-video bg-zinc-800 relative flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center">
                  <span className="text-zinc-400 text-xl">▶</span>
                </div>
                <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-red-600 rounded text-xs text-white font-medium">
                  <StatusDot status="healthy" />
                  LIVE
                </div>
                <div className="absolute top-2 right-2 text-xs bg-zinc-900/80 px-2 py-0.5 rounded text-zinc-300">
                  {viewers} watching
                </div>
              </div>
              <div className="p-4">
                <div className="text-sm font-medium text-zinc-100 mb-1 line-clamp-2">{title}</div>
                <div className="text-xs text-zinc-500 mb-2">{host}</div>
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400 border border-zinc-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          Streams are tokenized on <span className="text-teal-400 font-medium">GhostL3</span> (chain 903). Tip, subscribe, and settle with <span className="text-violet-400 font-medium">GST</span>, the only gas token across the GhostChain stack.
        </div>
      </main>

      <GhostFooter />
    </>
  );
}
