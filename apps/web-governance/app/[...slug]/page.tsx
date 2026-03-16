import { notFound } from "next/navigation";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

const PAGES = {
  propose: {
    title: "Submit Proposal",
    intro: "Draft a GhostChain governance proposal with constitutional, treasury, and routing-law context before relay.",
  },
  constitution: {
    title: "Read Constitution",
    intro: "The Ghost constitution defines the operating boundaries for governance, AI, treasury, and consensus.",
  },
  council: {
    title: "Ghost Council",
    intro: "Meet the elected council responsible for guarded oversight of critical GhostChain decisions.",
  },
} as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug: [slug] }));
}

export default async function GovernanceSubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/") as keyof typeof PAGES];
  if (!page) notFound();

  return (
    <>
      <PublicNavbar cta={{ label: "Connect Wallet", href: "https://portal.ghostchain.cloud" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center" }}>
          <div className="container">
            <span className="tag">Ghost Governance</span>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>{page.title}</h1>
            <p style={{ color: "#94a3b8", maxWidth: 720, margin: "0 auto" }}>{page.intro}</p>
          </div>
        </section>
        <section style={{ padding: "0 24px 80px" }}>
          <div className="container card" style={{ color: "#94a3b8" }}>
            Governance flows here should remain branded and bounded: AI may draft, humans ratify, and routing law stays enforced.
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
