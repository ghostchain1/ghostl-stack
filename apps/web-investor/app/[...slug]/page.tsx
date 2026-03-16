import { notFound } from "next/navigation";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

const PAGES = {
  treasury: {
    title: "Treasury Overview",
    intro: "Inspect GhostChain treasury posture, GST reserves, and governance-scoped capital allocation from the investor surface.",
    bullets: [
      "Treasury accounting should reconcile against GhostChain L1 and proposal-approved distribution records.",
      "GST remains the denomination for reserves, grants, validator programs, and treasury reporting.",
      "Capital deployment should always reference the governance proposal or operating mandate that authorized it.",
    ],
  },
  tokenomics: {
    title: "GST Tokenomics",
    intro: "Review the branded GST allocation model, validator incentives, and treasury distribution guardrails.",
    bullets: [
      "GST is the only gas token across GhostChain, GhostL2, and GhostL3.",
      "Validator rewards, treasury accounting, and ecosystem grants remain GST-denominated.",
      "Supply or allocation changes require governance ratification.",
    ],
  },
  reports: {
    title: "Financial Reports",
    intro: "Track treasury transparency, validator economics, and ecosystem funding posture from a single GhostChain investor surface.",
    bullets: [
      "Treasury status should reconcile against on-chain GhostChain L1 data.",
      "Yield summaries should distinguish staking, fees, and programmatic treasury flows.",
      "Governance-linked capital deployment remains auditable and proposal-scoped.",
    ],
  },
} as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug: [slug] }));
}

export default async function InvestorSubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/") as keyof typeof PAGES];
  if (!page) notFound();

  return (
    <>
      <PublicNavbar cta={{ label: "Get GST", href: "https://exchange.ghostchain.cloud" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center" }}>
          <div className="container">
            <span className="tag">Investor Relations</span>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>{page.title}</h1>
            <p style={{ color: "#94a3b8", maxWidth: 720, margin: "0 auto" }}>{page.intro}</p>
          </div>
        </section>
        <section style={{ padding: "0 24px 80px" }}>
          <div className="container card">
            <ul style={{ display: "grid", gap: "1rem", color: "#94a3b8" }}>
              {page.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
