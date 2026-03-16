import { notFound } from "next/navigation";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

const PAGES = {
  kyc: {
    title: "Institutional Onboarding",
    intro: "Prepare compliance, custody, and settlement preferences before accessing GhostXchange liquidity.",
    cards: [
      { title: "Entity Verification", body: "Capture legal entity, operator, and jurisdictional details before account creation." },
      { title: "Settlement Profile", body: "Choose branded GST settlement preferences and supported GhostChain layers." },
      { title: "Risk Review", body: "Record AML, sanctions, and source-of-funds evidence in one onboarding package." },
    ],
  },
  contact: {
    title: "Talk to a Rep",
    intro: "Connect with the GhostXchange team for OTC, custody, and institutional API support.",
    cards: [
      { title: "OTC Desk", body: "Coordinate large-block GST execution and treasury rebalancing flows." },
      { title: "Custody", body: "Review GhostChain-native custody and operational segregation options." },
      { title: "Prime Services", body: "Discuss exchange-side routing, credit, and cross-layer settlement operations." },
    ],
  },
} as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug: [slug] }));
}

export default async function ExchangeSubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/") as keyof typeof PAGES];
  if (!page) notFound();

  return (
    <>
      <PublicNavbar cta={{ label: "Onboard Now", href: "/kyc" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center" }}>
          <div className="container">
            <span className="tag">GhostXchange</span>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>{page.title}</h1>
            <p style={{ color: "#94a3b8", maxWidth: 720, margin: "0 auto" }}>{page.intro}</p>
          </div>
        </section>
        <section style={{ padding: "0 24px 80px" }}>
          <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "1rem" }}>
            {page.cards.map((card) => (
              <div key={card.title} className="card">
                <h2 style={{ fontWeight: 700, marginBottom: "0.5rem" }}>{card.title}</h2>
                <p style={{ color: "#94a3b8", margin: 0 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
