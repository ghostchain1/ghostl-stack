import Link from "next/link";
import { notFound } from "next/navigation";
import { GhostFooter, Ghostnavbar } from "@ghostchain/ui-components";

const NAV = [
  { label: "Guides", href: "/guides" },
  { label: "API Ref", href: "/api" },
  { label: "Architecture", href: "/architecture" },
  { label: "SDK", href: "/sdk" },
];

type DocsPage = {
  eyebrow: string;
  title: string;
  intro: string;
  bullets?: string[];
  code?: string;
  related: Array<{ label: string; href: string }>;
};

const PAGES: Record<string, DocsPage> = {
  guides: {
    eyebrow: "Guides",
    title: "Getting Started Guides",
    intro: "Start with the GhostChain stack from GST fundamentals through deployment and routing-safe app design.",
    bullets: [
      "Use GhostChain L1 for external settlement and sovereign anchoring.",
      "Use GhostL2 as the mandatory transit layer between L3 and L1.",
      "Use GhostL3 for app-specific execution and GST-denominated utility flows.",
    ],
    related: [
      { label: "GhostChain overview", href: "/guides/overview" },
      { label: "Developer setup", href: "/guides/dev-setup" },
      { label: "Deploy a contract", href: "/guides/deploy" },
    ],
  },
  "guides/overview": {
    eyebrow: "Guides",
    title: "GhostChain Overview",
    intro: "GhostChain is a sovereign three-layer stack: GhostChain L1, GhostL2, and GhostL3, all powered by GST.",
    bullets: [
      "Chain IDs: 14000101 on L1, 901 on L2, and 903 on L3.",
      "Wallet: GhostWallet. Explorer: GhostScan. Naming: GNS. Exchange: GhostXchange.",
      "All cross-layer traffic respects L3 -> L2 -> L1 routing.",
    ],
    related: [
      { label: "Layer architecture", href: "/architecture/layers" },
      { label: "Routing law", href: "/architecture/routing" },
    ],
  },
  "guides/dev-setup": {
    eyebrow: "Guides",
    title: "Developer Setup",
    intro: "Install the GhostStack workspace, use Node 22, and prefer the branded SDK surface for all new code.",
    code: `npm install\nnpm run build\nnpm run brand:full\nnpm run gst:leakage`,
    related: [
      { label: "ghost-sdk-core", href: "/sdk/ghost-sdk-core" },
      { label: "RPC reference", href: "/sdk/rpc" },
    ],
  },
  "guides/deploy": {
    eyebrow: "Guides",
    title: "Deploy a Contract",
    intro: "Use GhostChain-branded build and governance workflows before any production deployment.",
    bullets: [
      "Compiler baseline: Solidity 0.8.24 with via_ir enabled.",
      "Run `npm run phase2:preflight` before governance-linked deployment work.",
      "Draft proposals through the signing relay instead of inline execution.",
    ],
    related: [
      { label: "Ghost constitution", href: "/governance/constitution" },
      { label: "Proposal lifecycle", href: "/governance/proposals" },
    ],
  },
  "guides/gst": {
    eyebrow: "Guides",
    title: "GST Token",
    intro: "GST is the only gas token across the GhostChain ecosystem. No ETH or alternate gas token branding should leak through the stack.",
    bullets: [
      "Use GST for fees on L1, L2, and L3.",
      "Keep treasury, rewards, and creator payouts denominated in GST.",
      "Audit for non-GST token leakage before release.",
    ],
    related: [
      { label: "GhostXchange governance", href: "/governance/ghostxchange" },
      { label: "SDK quickstart", href: "/sdk/ghost-sdk" },
    ],
  },
  api: {
    eyebrow: "API",
    title: "API Reference",
    intro: "GhostStack service APIs should be fronted through branded BFF and portal surfaces, not raw node exposure from the browser.",
    bullets: [
      "Prefer Ghost-native BFF endpoints for users and operators.",
      "Expose RPC capability through the Ghost RPC Portal with `ghost_` methods.",
      "Keep settlement and governance writes bounded and auditable.",
    ],
    related: [
      { label: "RPC reference", href: "/sdk/rpc" },
      { label: "GNS resolver", href: "/sdk/gns" },
    ],
  },
  architecture: {
    eyebrow: "Architecture",
    title: "GhostStack Architecture",
    intro: "The core architecture centers on routing law, GhostBrain automation, and a branded microservice edge.",
    related: [
      { label: "L1 / L2 / L3 layers", href: "/architecture/layers" },
      { label: "Routing law", href: "/architecture/routing" },
      { label: "GhostBrain AI", href: "/architecture/ghostbrain" },
    ],
  },
  "architecture/layers": {
    eyebrow: "Architecture",
    title: "L1 / L2 / L3 Layers",
    intro: "GhostChain L1 handles sovereign anchoring, GhostL2 mediates rollup coordination, and GhostL3 serves app throughput.",
    bullets: [
      "L1 RPC port 18545.",
      "L2 RPC port 29545.",
      "L3 RPC port 39545.",
    ],
    related: [
      { label: "Routing law", href: "/architecture/routing" },
      { label: "GhostBrain AI", href: "/architecture/ghostbrain" },
    ],
  },
  "architecture/routing": {
    eyebrow: "Architecture",
    title: "Routing Law",
    intro: "GhostChain enforces a non-negotiable route: GhostL3 -> GhostL2 -> GhostChain L1.",
    bullets: [
      "L3 never calls L1 directly.",
      "L2 never settles externally except through L1.",
      "The routing guard packages enforce this at runtime.",
    ],
    related: [
      { label: "Layer overview", href: "/architecture/layers" },
      { label: "ghost-sdk-core", href: "/sdk/ghost-sdk-core" },
    ],
  },
  "architecture/lge": {
    eyebrow: "Architecture",
    title: "Liquidity Gravity Engine",
    intro: "The liquidity layer aligns GST flow, bridge demand, and exchange behavior across GhostL2 and GhostL3.",
    related: [
      { label: "GhostXchange governance", href: "/governance/ghostxchange" },
      { label: "GhostChain overview", href: "/guides/overview" },
    ],
  },
  "architecture/ghostbrain": {
    eyebrow: "Architecture",
    title: "GhostBrain AI",
    intro: "GhostBrain drafts proposals, scores anomalies, and recommends bounded action while preserving human governance control.",
    bullets: [
      "Proposal drafting is advisory until ratified.",
      "Infrastructure action must respect allowlists and cooldowns.",
      "AI may not change consensus or token supply autonomously.",
    ],
    related: [
      { label: "Proposal lifecycle", href: "/governance/proposals" },
      { label: "ghost-sdk (ethers)", href: "/sdk/ghost-sdk" },
    ],
  },
  sdk: {
    eyebrow: "SDK",
    title: "SDK Overview",
    intro: "Use GhostChain-branded SDKs throughout the workspace and prefer `ghost-sdk-core` for new integration code.",
    related: [
      { label: "ghost-sdk-core", href: "/sdk/ghost-sdk-core" },
      { label: "ghost-sdk", href: "/sdk/ghost-sdk" },
      { label: "GNS resolver", href: "/sdk/gns" },
    ],
  },
  "sdk/ghost-sdk-core": {
    eyebrow: "SDK",
    title: "ghost-sdk-core",
    intro: "The preferred SDK for new code: native GhostChain primitives without direct ethers dependency in app code.",
    code: `import { createGhostProvider } from "@ghostchain/ghost-sdk-core";\n\nconst provider = createGhostProvider({\n  rpcUrl: "http://localhost:18545",\n  chainId: 14000101,\n});`,
    related: [
      { label: "RPC reference", href: "/sdk/rpc" },
      { label: "Routing law", href: "/architecture/routing" },
    ],
  },
  "sdk/ghost-sdk": {
    eyebrow: "SDK",
    title: "ghost-sdk",
    intro: "Compatibility layer for existing integrations that still need the broader branded ethers-backed surface.",
    code: `import { ghost, JsonRpcProvider, Wallet } from "@ghostchain/sdk";\n\nconst provider = new JsonRpcProvider("http://localhost:29545");\nconst wallet = new Wallet(process.env.PRIVATE_KEY!, provider);`,
    related: [
      { label: "ghost-sdk-core", href: "/sdk/ghost-sdk-core" },
      { label: "GNS resolver", href: "/sdk/gns" },
    ],
  },
  "sdk/rpc": {
    eyebrow: "SDK",
    title: "RPC Reference",
    intro: "GhostStack uses the `ghost_` namespace for RPC. Avoid emitting `eth_` methods from application code.",
    bullets: [
      "L1 uses port 18545.",
      "L2 uses port 29545.",
      "L3 uses port 39545.",
    ],
    related: [
      { label: "ghost-sdk-core", href: "/sdk/ghost-sdk-core" },
      { label: "Routing law", href: "/architecture/routing" },
    ],
  },
  "sdk/gns": {
    eyebrow: "SDK",
    title: "GNS Resolver",
    intro: "Ghost Name System provides branded identity resolution for wallets, creators, and infrastructure endpoints.",
    related: [
      { label: "API reference", href: "/api" },
      { label: "GST token", href: "/guides/gst" },
    ],
  },
  governance: {
    eyebrow: "Governance",
    title: "Governance Overview",
    intro: "Ghost governance ratifies policy, treasury, and protocol decisions across the ecosystem.",
    related: [
      { label: "GhostChainGovernor", href: "/governance/governor" },
      { label: "GhostConstitution", href: "/governance/constitution" },
      { label: "Proposal lifecycle", href: "/governance/proposals" },
    ],
  },
  "governance/governor": {
    eyebrow: "Governance",
    title: "GhostChainGovernor",
    intro: "The canonical governor contract coordinates proposal submission, voting, and execution gating.",
    related: [
      { label: "Proposal lifecycle", href: "/governance/proposals" },
      { label: "Ghost constitution", href: "/governance/constitution" },
    ],
  },
  "governance/constitution": {
    eyebrow: "Governance",
    title: "GhostConstitution",
    intro: "The constitution defines the sovereign rules the AI and operator layers must not bypass.",
    bullets: [
      "Consensus changes require human ratification.",
      "Bridge quorum changes require governance approval.",
      "Supply logic cannot be altered autonomously.",
    ],
    related: [
      { label: "Governor", href: "/governance/governor" },
      { label: "Routing law", href: "/architecture/routing" },
    ],
  },
  "governance/proposals": {
    eyebrow: "Governance",
    title: "Proposal Lifecycle",
    intro: "Draft, simulate, ratify, and relay. Governance changes pass through bounded stages before execution.",
    related: [
      { label: "GhostChainGovernor", href: "/governance/governor" },
      { label: "GhostBrain AI", href: "/architecture/ghostbrain" },
    ],
  },
  "governance/ghostxchange": {
    eyebrow: "Governance",
    title: "GhostXchange Governance",
    intro: "Exchange and liquidity policy stays GhostChain branded and remains subordinate to the constitutional governance model.",
    related: [
      { label: "GST token", href: "/guides/gst" },
      { label: "Liquidity Gravity Engine", href: "/architecture/lge" },
    ],
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((key) => ({ slug: key.split("/") }));
}

export default async function DocsSubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/")];
  if (!page) notFound();

  return (
    <>
      <Ghostnavbar appName="Docs" nav={NAV} />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-[0.25em] text-violet-400 mb-2">{page.eyebrow}</p>
          <h1 className="text-3xl font-bold text-zinc-100 mb-3">{page.title}</h1>
          <p className="text-sm text-zinc-400 max-w-3xl leading-6">{page.intro}</p>
        </div>

        {page.bullets ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 mb-6">
            <ul className="space-y-3 text-sm text-zinc-300">
              {page.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-3">
                  <span className="text-violet-400">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {page.code ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 mb-6">
            <pre className="bg-zinc-950 rounded-xl p-4 text-xs text-zinc-300 overflow-x-auto font-mono whitespace-pre-wrap">
              {page.code}
            </pre>
          </div>
        ) : null}

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-sm font-semibold text-zinc-100 mb-4">Related</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {page.related.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300 hover:border-violet-500 hover:text-violet-300 transition-colors">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </main>
      <GhostFooter />
    </>
  );
}
