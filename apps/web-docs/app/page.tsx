import { Ghostnavbar } from "@ghostchain/ui-components";
import { GhostFooter } from "@ghostchain/ui-components";
import Link from "next/link";

const NAV = [
  { label: "Guides",       href: "/guides" },
  { label: "API Ref",      href: "/api" },
  { label: "Architecture", href: "/architecture" },
  { label: "SDK",          href: "/sdk" },
];

const SECTIONS = [
  {
    title: "Getting Started",
    links: [
      { label: "GhostChain Overview",  href: "/guides/overview" },
      { label: "Dev Setup",            href: "/guides/dev-setup" },
      { label: "Deploy a Contract",    href: "/guides/deploy" },
      { label: "GST Token",            href: "/guides/gst" },
    ],
  },
  {
    title: "SDK",
    links: [
      { label: "ghost-sdk-core",       href: "/sdk/ghost-sdk-core" },
      { label: "ghost-sdk (ethers v6)",href: "/sdk/ghost-sdk" },
      { label: "RPC Reference",        href: "/sdk/rpc" },
      { label: "GNS Resolver",         href: "/sdk/gns" },
    ],
  },
  {
    title: "Architecture",
    links: [
      { label: "L1 / L2 / L3 Layers",  href: "/architecture/layers" },
      { label: "Routing Law",           href: "/architecture/routing" },
      { label: "Liquidity Gravity Engine", href: "/architecture/lge" },
      { label: "GhostBrain AI",         href: "/architecture/ghostbrain" },
    ],
  },
  {
    title: "Governance",
    links: [
      { label: "GhostChainGovernor",   href: "/governance/governor" },
      { label: "GhostConstitution",    href: "/governance/constitution" },
      { label: "Proposal Lifecycle",   href: "/governance/proposals" },
      { label: "GhostXchange",         href: "/governance/ghostxchange" },
    ],
  },
];

export default function DocsPage() {
  return (
    <>
      <Ghostnavbar appName="Docs" nav={NAV} />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-zinc-100 mb-2">GhostChain Developer Docs</h1>
          <p className="text-zinc-400">
            Build on the sovereign, AI-native blockchain stack — L1, L2, L3, GhostBrain, GNS, GhostXchange, and more.
          </p>
        </div>

        {/* Search */}
        <div className="mb-12">
          <input
            type="search"
            placeholder="Search documentation…"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-600"
          />
        </div>

        {/* Sections */}
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
