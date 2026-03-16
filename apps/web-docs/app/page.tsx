import { headers } from "next/headers";
import Link from "next/link";
import { GhostFooter, Ghostnavbar } from "@ghostchain/ui-components";

const NAV = [
  { label: "Guides", href: "/guides" },
  { label: "API Ref", href: "/api" },
  { label: "Architecture", href: "/architecture" },
  { label: "SDK", href: "/sdk" },
];

const SECTIONS = [
  {
    title: "Getting Started",
    links: [
      { label: "GhostChain Overview", href: "/guides/overview" },
      { label: "Dev Setup", href: "/guides/dev-setup" },
      { label: "Deploy a Contract", href: "/guides/deploy" },
      { label: "GST Token", href: "/guides/gst" },
    ],
  },
  {
    title: "SDK",
    links: [
      { label: "ghost-sdk-core", href: "/sdk/ghost-sdk-core" },
      { label: "ghost-sdk", href: "/sdk/ghost-sdk" },
      { label: "RPC Reference", href: "/sdk/rpc" },
      { label: "GNS Resolver", href: "/sdk/gns" },
    ],
  },
  {
    title: "Architecture",
    links: [
      { label: "L1 / L2 / L3 Layers", href: "/architecture/layers" },
      { label: "Routing Law", href: "/architecture/routing" },
      { label: "Liquidity Gravity Engine", href: "/architecture/lge" },
      { label: "GhostBrain AI", href: "/architecture/ghostbrain" },
    ],
  },
  {
    title: "Governance",
    links: [
      { label: "GhostChainGovernor", href: "/governance/governor" },
      { label: "GhostConstitution", href: "/governance/constitution" },
      { label: "Proposal Lifecycle", href: "/governance/proposals" },
      { label: "GhostXchange", href: "/governance/ghostxchange" },
    ],
  },
];

const domainVariants = {
  default: {
    appName: "Docs",
    eyebrow: "Developer Documentation",
    title: "GhostChain Developer Docs",
    intro: "Build on the sovereign, AI-native blockchain stack: GhostChain L1, GhostL2, GhostL3, GhostBrain, GNS, GhostXchange, and the GST token.",
    searchPlaceholder: "Search documentation…",
    quickLinks: [
      { label: "Developer Hub", href: "https://dev.ghostchain.cloud" },
      { label: "RPC Portal", href: "https://rpc.ghostchain.cloud" },
      { label: "GhostScan", href: "https://explorer.ghostchain.cloud" },
    ],
  },
  "ghostchain.info": {
    appName: "GhostChain Info",
    eyebrow: "Knowledge Base",
    title: "Network Facts, Docs, and Governance References",
    intro: "Use ghostchain.info as the reference surface for architecture, governance, routing law, GST guidance, and the developer documentation that backs the GhostChain brand system.",
    searchPlaceholder: "Search GhostChain info…",
    quickLinks: [
      { label: "Main Site", href: "https://ghostchain.cloud" },
      { label: "Governance", href: "https://governance.ghostchain.cloud" },
      { label: "Portal", href: "https://portal.ghostchain.cloud" },
    ],
  },
  "ghostchain.online": {
    appName: "GhostChain Online",
    eyebrow: "Service Manual",
    title: "The Live Documentation and Service Manual",
    intro: "GhostChain Online is the live operations handbook for docs, RPC onboarding, app discovery, and public service entry points across the GhostChain network.",
    searchPlaceholder: "Search online services…",
    quickLinks: [
      { label: "Apps", href: "https://apps.ghostchain.cloud" },
      { label: "Status", href: "https://status.ghostchain.cloud" },
      { label: "GhostBrain", href: "https://ai.ghostchain.cloud" },
    ],
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

export default async function DocsPage() {
  const variant = await getVariant();

  return (
    <>
      <Ghostnavbar appName={variant.appName} nav={NAV} />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="mb-12">
          <div className="text-xs uppercase tracking-[0.3em] text-violet-400 mb-3">{variant.eyebrow}</div>
          <h1 className="text-3xl font-bold text-zinc-100 mb-2">{variant.title}</h1>
          <p className="text-zinc-400">{variant.intro}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {variant.quickLinks.map((link) => (
            <a key={link.href} href={link.href} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300 hover:border-violet-500/40 transition-colors">
              <div className="text-zinc-100 font-semibold mb-1">{link.label}</div>
              <div className="text-zinc-500 text-xs">{link.href}</div>
            </a>
          ))}
        </div>

        <div className="mb-12">
          <input
            type="search"
            placeholder={variant.searchPlaceholder}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-600"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {SECTIONS.map(({ title, links }) => (
            <div key={title} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-sm font-semibold text-zinc-100 mb-4">{title}</h2>
              <ul className="flex flex-col gap-2">
                {links.map(({ label, href }) => (
                  <li key={href}>
                    <Link href={href} className="text-sm text-zinc-400 hover:text-violet-400 transition-colors">
                      {label} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>

      <GhostFooter />
    </>
  );
}
