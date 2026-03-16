import { notFound } from "next/navigation";
import { GHOST_SITES } from "@ghostchain/config";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

type StatusPage = {
  title: string;
  intro: string;
  badge: string;
  sections: Array<{ title: string; body: string }>;
};

const PAGES: Record<string, StatusPage> = {
  incidents: {
    title: "Incident Feed",
    intro: "Track active and resolved GhostChain incidents across the branded public surfaces and the Ghost routing stack.",
    badge: "Active Monitoring",
    sections: [
      { title: "Current State", body: "No platform-wide incident is open in this static status surface. Live service checks continue to publish on the root dashboard." },
      { title: "Escalation Path", body: "Operational incidents flow through Ghost portal alerting, GhostBrain analysis, and service-specific response channels." },
      { title: "Public Update Model", body: "When a real incident is opened, this page can carry a concise incident summary without dropping users into a 404." },
    ],
  },
  history: {
    title: "Status History",
    intro: "Historical uptime and recovery posture for the GhostChain public network and service mesh.",
    badge: "90 Day Window",
    sections: [
      { title: "Availability", body: "The branded status surface summarizes operational continuity for GhostChain services, RPC, bridge, and public portals." },
      { title: "Postmortems", body: "Any material degradation should result in a documented review routed through governance and platform operations." },
      { title: "Reporting", body: "This history page exists as a stable path for future reporting instead of leaving bookmarked status links broken." },
    ],
  },
  maintenance: {
    title: "Maintenance Windows",
    intro: "Planned upgrades, infrastructure maintenance, and GhostChain rollout windows for public-facing services.",
    badge: "Scheduled Work",
    sections: [
      { title: "Planned Upgrades", body: "Maintenance windows cover portal upgrades, RPC fleet work, and public infrastructure changes that preserve Ghost routing law." },
      { title: "Operator Notice", body: "Validator and operator-facing changes should still be staged and announced through the relevant GhostChain governance and node surfaces." },
      { title: "Stable Path", body: "This page is intentionally present so public maintenance links remain branded and resolvable even before dynamic scheduling is wired in." },
    ],
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug: [slug] }));
}

export default async function StatusSubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/")];
  if (!page) notFound();

  return (
    <>
      <PublicNavbar cta={{ label: "Status Home", href: GHOST_SITES.status.url }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">GhostChain Status</span>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>{page.title}</h1>
            <p style={{ color: "#94a3b8", maxWidth: 720, margin: "0 auto 20px" }}>{page.intro}</p>
            <div style={{ display: "inline-block", background: "#10B98122", color: "#10B981", padding: "6px 16px", borderRadius: 20, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase" }}>
              {page.badge}
            </div>
          </div>
        </section>

        <section style={{ padding: "0 24px 80px" }}>
          <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "1rem", marginBottom: "2rem" }}>
            {page.sections.map((section) => (
              <div key={section.title} className="card">
                <h2 style={{ fontWeight: 700, marginBottom: "0.5rem" }}>{section.title}</h2>
                <p style={{ color: "#94a3b8", margin: 0 }}>{section.body}</p>
              </div>
            ))}
          </div>
          <div className="container" style={{ textAlign: "center" }}>
            <a href={GHOST_SITES.status.url} className="btn-primary">Return to Status Overview</a>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
