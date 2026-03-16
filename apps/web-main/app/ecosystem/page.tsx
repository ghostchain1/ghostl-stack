"use client";

import Link from "next/link";
import { GHOST_SITES } from "@ghostchain/config";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

const sites = [
  { title: "GhostChain Main", href: "/", description: "Network overview, architecture, and ecosystem entry point." },
  { title: "Developer Portal", href: GHOST_SITES.dev.url, description: "SDKs, docs, RPC onboarding, and grants." },
  { title: "GhostWallet", href: GHOST_SITES.wallet.url, description: "Multi-layer GST wallet and GNS identity hub." },
  { title: "Bridge", href: GHOST_SITES.bridge.url, description: "Canonical GhostChain L1/L2/L3 asset routing." },
  { title: "Governance", href: GHOST_SITES.governance.url, description: "Proposal authoring, voting, and constitutional policy." },
  { title: "Nodes", href: GHOST_SITES.nodes.url, description: "Validator onboarding, rewards, and infrastructure guidance." },
];

export default function EcosystemPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Launch App →", href: GHOST_SITES.portal.url }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center" }}>
          <div className="container">
            <span className="tag">Ghost Ecosystem</span>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              Every branded GhostChain surface, in one place
            </h1>
            <p style={{ color: "var(--text-muted)", maxWidth: 720, margin: "0 auto" }}>
              Use the ecosystem map to move between GhostChain public sites, operator surfaces, and utility apps without relying on external discovery.
            </p>
          </div>
        </section>

        <section style={{ padding: "0 24px 80px" }}>
          <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "1rem" }}>
            {sites.map((site) => (
              <a key={site.title} href={site.href} className="card" style={{ textDecoration: "none" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>{site.title}</h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginBottom: "1rem" }}>{site.description}</p>
                <span style={{ color: "#FFD700", fontSize: "0.82rem", fontWeight: 700 }}>Open site →</span>
              </a>
            ))}
          </div>
        </section>

        <section style={{ padding: "0 24px 80px", textAlign: "center" }}>
          <div className="container">
            <Link className="btn-secondary" href="/">Return to GhostChain main site</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
