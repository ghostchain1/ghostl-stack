import { notFound } from "next/navigation";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

const PAGES = {
  press: {
    title: "Press Kit",
    intro: "Download GhostChain brand guidance, media notes, and official messaging for the sovereign Ghost ecosystem.",
  },
  careers: {
    title: "Careers",
    intro: "GhostChain is hiring across protocol engineering, AI operations, and branded developer platform work.",
  },
} as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug: [slug] }));
}

export default async function CompanySubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/") as keyof typeof PAGES];
  if (!page) notFound();

  return (
    <>
      <PublicNavbar cta={{ label: "Join the Team", href: "/careers" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center" }}>
          <div className="container">
            <span className="tag">GhostChain Company</span>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>{page.title}</h1>
            <p style={{ color: "#94a3b8", maxWidth: 720, margin: "0 auto" }}>{page.intro}</p>
          </div>
        </section>
        <section style={{ padding: "0 24px 80px" }}>
          <div className="container card" style={{ color: "#94a3b8" }}>
            Keep every external asset GhostChain branded: GhostWallet, GhostScan, GNS, GhostXchange, and GST terminology only.
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
