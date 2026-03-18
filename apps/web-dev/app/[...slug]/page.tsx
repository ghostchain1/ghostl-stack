import { notFound } from "next/navigation";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

type PageContent = {
  title: string;
  intro: string;
  cards: Array<{ title: string; body: string }>;
};

const PAGES: Record<string, PageContent> = {
  docs: {
    title: "Developer Docs",
    intro: "Start with the GhostChain developer handbook, then drill into quickstarts, branded SDKs, and RPC onboarding.",
    cards: [
      { title: "Quickstart", body: "Install the workspace, use Node 22, and start with the Ghost-native toolchain." },
      { title: "Routing Law", body: "GhostL3 calls route through GhostL2 before GhostChain L1 settlement. No direct L3 -> L1 path." },
      { title: "Ghost SDKs", body: "Use ghost-sdk-core for new code and the branded wrapper packages for language-specific surfaces." },
    ],
  },
  "docs/quickstart": {
    title: "Quickstart Guide",
    intro: "Install the GhostStack workspace, point at Ghost-native RPC endpoints, and start with the branded SDK surface.",
    cards: [
      { title: "1. Install", body: "Use Node 22, run `npm install`, and keep work inside the branded GhostChain workspace packages." },
      { title: "2. Connect", body: "Use GhostChain L1 on 18545, GhostL2 on 29547, and GhostL3 on 39545 via `ghost_` methods." },
      { title: "3. Build", body: "Prefer `@ghostchain/ghost-sdk-core` for new code and `@ghostchain/sdk` for compatibility paths." },
    ],
  },
  grants: {
    title: "Builder Grants",
    intro: "GhostChain grants fund GST-native apps, infrastructure improvements, and branding-safe SDK integrations.",
    cards: [
      { title: "Infrastructure", body: "Improve validators, observability, routing enforcement, or branded deployment tooling." },
      { title: "Applications", body: "Build GhostWallet extensions, GhostXchange flows, or GhostL3-native consumer apps." },
      { title: "Developer Experience", body: "Contribute docs, SDK wrappers, or migration tooling that preserves Ghost branding systemwide." },
    ],
  },
  "sdk/ghostjs": {
    title: "ghost.js",
    intro: "JavaScript and TypeScript access to GhostChain RPC, contracts, and wallet flows using the Ghost branding layer.",
    cards: [
      { title: "Preferred Path", body: "Use `@ghostchain/ghost-sdk-core` for new applications that do not need compatibility wrappers." },
      { title: "Compatibility Layer", body: "Use `@ghostchain/sdk` where an ethers-style adapter is still required by existing integrations." },
      { title: "RPC Methods", body: "Favor `ghost_` namespace methods and keep GST terminology throughout your app surface." },
    ],
  },
  "sdk/ghostpy": {
    title: "ghost-py",
    intro: "Python access to GhostChain RPC, indexers, automation, and treasury-safe workflows.",
    cards: [
      { title: "Async Ready", body: "Use async client flows for monitoring, queue consumers, and GhostBrain automation hooks." },
      { title: "Chain Awareness", body: "Model chain IDs explicitly: 14000101 for L1, 901 for L2, and 903 for L3." },
      { title: "Governance Safety", body: "Python tooling may prepare proposals, but production execution still routes through governance relay and quorum." },
    ],
  },
  "sdk/ghostrs": {
    title: "ghost-rs",
    intro: "Rust crate access for low-latency GhostChain services, routing enforcement, and validator-side integrations.",
    cards: [
      { title: "High Throughput", body: "Use Rust clients for latency-sensitive indexers, relayers, and exchange-side ingestion." },
      { title: "Routing Guard", body: "Preserve the GhostL3 -> GhostL2 -> GhostChain L1 settlement law in service boundaries and typed APIs." },
      { title: "GST First", body: "Keep gas, balances, and rewards GST-denominated across all integration layers." },
    ],
  },
  "sdk/ghostgo": {
    title: "ghost-go",
    intro: "Go module support for GhostChain node services, RPC access, and infrastructure-side automation.",
    cards: [
      { title: "Node Integrations", body: "Use Go for GhostChain edge services, relays, and performance-sensitive backends." },
      { title: "Operational Safety", body: "Infrastructure tooling must keep routing guardrails and branded endpoint names intact." },
      { title: "Observed Endpoints", body: "Wire L1, L2, and L3 RPCs separately and document which layer each workflow actually touches." },
    ],
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((key) => ({ slug: key.split("/") }));
}

export default async function DevSubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/")];
  if (!page) notFound();

  return (
    <>
      <PublicNavbar cta={{ label: "API Docs", href: "https://dev.ghostchain.cloud/docs" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center" }}>
          <div className="container">
            <span className="tag">Developer Portal</span>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>{page.title}</h1>
            <p style={{ color: "var(--text-muted)", maxWidth: 720, margin: "0 auto" }}>{page.intro}</p>
          </div>
        </section>
        <section style={{ padding: "0 24px 80px" }}>
          <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "1rem" }}>
            {page.cards.map((card) => (
              <div key={card.title} className="card">
                <h2 style={{ fontWeight: 700, marginBottom: "0.5rem" }}>{card.title}</h2>
                <p style={{ color: "var(--text-muted)", margin: 0 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
