import { notFound } from "next/navigation";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

type PageContent = {
  title: string;
  intro: string;
  cards: Array<{ title: string; body: string }>;
};

const PAGES: Record<string, PageContent> = {
  "docs/quickstart": {
    title: "Quickstart Guide",
    intro: "Install the GhostStack workspace, point at Ghost-native RPC endpoints, and start with the branded SDK surface.",
    cards: [
      { title: "1. Install", body: "Use Node 22, run `npm install`, and keep work inside the branded GhostChain workspace packages." },
      { title: "2. Connect", body: "Use GhostChain L1 on 18545, GhostL2 on 29545, and GhostL3 on 39545 via `ghost_` methods." },
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
