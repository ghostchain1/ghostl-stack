import { notFound } from "next/navigation";
import { GHOST_SITES } from "@ghostchain/config";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

type PortalPage = {
  title: string;
  intro: string;
  cta: { label: string; href: string };
  cards: Array<{ title: string; body: string }>;
};

const PAGES: Record<string, PortalPage> = {
  alerts: {
    title: "Operational Alerts",
    intro: "Review active alerts across GhostChain services, routing integrity, validator health, and AI-managed infrastructure.",
    cta: { label: "View system status", href: GHOST_SITES.status.url },
    cards: [
      { title: "Routing Guard", body: "Alerts surface attempts to bypass the GhostL3 -> GhostL2 -> GhostChain L1 law." },
      { title: "Service Drift", body: "Track degraded app surfaces, stalled queues, and unhealthy public endpoints." },
      { title: "Operator Signals", body: "Correlate validator, treasury, and AI alerts without leaving the Ghost portal." },
    ],
  },
  incidents: {
    title: "Incident Ledger",
    intro: "Track public incident history, mitigations, and service recovery notes for the GhostChain web and infrastructure mesh.",
    cta: { label: "Open GhostBrain", href: GHOST_SITES.ai.url },
    cards: [
      { title: "Current State", body: "Record what failed, which services were touched, and what user-facing impact occurred." },
      { title: "Mitigation", body: "Explain the bounded recovery action, whether manual or AI-assisted, and why it was safe." },
      { title: "Evidence", body: "Link incident handling back to logs, metrics, and governance context where needed." },
    ],
  },
  "contracts/deploy": {
    title: "Contract Deploy",
    intro: "Prepare Ghost-branded contract deployments with routing-law awareness, GST-denominated assumptions, and verification follow-through.",
    cta: { label: "Open Developer Hub", href: GHOST_SITES.dev.url },
    cards: [
      { title: "Brand Constants", body: "Inherit GhostBrand constants and preserve canonical GST, chain IDs, and naming." },
      { title: "Deployment Flow", body: "Target the correct layer deliberately and keep cross-layer calls inside the routing guard." },
      { title: "Post-Deploy", body: "Move immediately into verification, explorer registration, and governance-linked change control if needed." },
    ],
  },
  "contracts/verify": {
    title: "Contract Verify",
    intro: "Keep deployed contracts visible in GhostScan and align source verification with the branded contract toolchain.",
    cta: { label: "Open GhostScan", href: GHOST_SITES.explorer.url },
    cards: [
      { title: "Source Match", body: "Verify compiler settings, optimizer flags, and branded imports before claiming a match." },
      { title: "GhostScan Surface", body: "Use GhostScan instead of third-party explorers for the canonical verification flow." },
      { title: "Governance Context", body: "Attach proposal or operating context when verification follows a governance-scoped upgrade." },
    ],
  },
  "contracts/abi": {
    title: "ABI Library",
    intro: "Access ABI surfaces and contract interface references for GhostChain deployments, wallets, and service integrations.",
    cta: { label: "Open Docs", href: GHOST_SITES.docs.url },
    cards: [
      { title: "Application Use", body: "Expose verified ABIs to app, wallet, and explorer surfaces without drifting from canonical interfaces." },
      { title: "Service Use", body: "Share ABI definitions across relayers, indexers, and RPC consumers through the branded package layer." },
      { title: "Versioning", body: "Track ABI changes alongside governance or release context so clients can migrate safely." },
    ],
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((key) => ({ slug: key.split("/") }));
}

export default async function PortalSubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/")];
  if (!page) notFound();

  return (
    <>
      <PublicNavbar cta={{ label: GHOST_SITES.main.domain, href: GHOST_SITES.main.url }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">Ghost Control Center</span>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>{page.title}</h1>
            <p style={{ color: "#94a3b8", maxWidth: 720, margin: "0 auto" }}>{page.intro}</p>
          </div>
        </section>

        <section style={{ padding: "0 24px 80px" }}>
          <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "1rem", marginBottom: "2rem" }}>
            {page.cards.map((card) => (
              <div key={card.title} className="card">
                <h2 style={{ fontWeight: 700, marginBottom: "0.5rem" }}>{card.title}</h2>
                <p style={{ color: "#94a3b8", margin: 0 }}>{card.body}</p>
              </div>
            ))}
          </div>
          <div className="container" style={{ textAlign: "center" }}>
            <a href={page.cta.href} className="btn-primary">{page.cta.label}</a>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
