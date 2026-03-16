import { notFound } from "next/navigation";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

const PAGES = {
  setup: {
    title: "Node Setup",
    intro: "Prepare a Ghost validator or node deployment with GST stake, storage, and routing-safe infrastructure defaults.",
  },
  stake: {
    title: "Validator Stake",
    intro: "Review minimum GST bonding, delegation posture, and validator-set entry requirements for GhostChain participation.",
  },
  rewards: {
    title: "Validator Rewards",
    intro: "Track GST reward flows, fee participation, and performance-linked payout factors for validators and delegators.",
  },
  "docs/validators": {
    title: "Validator Docs",
    intro: "Review GhostChain validator requirements, commissioning, monitoring, and restart protection guidance.",
  },
  "docs/validator-rewards": {
    title: "Validator Rewards",
    intro: "Understand how GST reward distribution, validator performance, and treasury flows interact across GhostChain layers.",
  },
} as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((key) => ({ slug: key.split("/") }));
}

export default async function NodesSubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/") as keyof typeof PAGES];
  if (!page) notFound();

  return (
    <>
      <PublicNavbar cta={{ label: "Run a Node", href: "/setup" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center" }}>
          <div className="container">
            <span className="tag">Ghost Validator Network</span>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>{page.title}</h1>
            <p style={{ color: "#94a3b8", maxWidth: 720, margin: "0 auto" }}>{page.intro}</p>
          </div>
        </section>
        <section style={{ padding: "0 24px 80px" }}>
          <div className="container card" style={{ color: "#94a3b8" }}>
            Production nodes should stay within GhostChain governance and operational guardrails: allowlists, cooldowns, snapshots, and restart circuit breakers.
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
