import { notFound } from "next/navigation";
import { GHOST_SITES } from "@ghostchain/config";
import { PublicFooter, PublicNavbar } from "@ghostchain/ui";

type AppDirectoryPage = {
  title: string;
  intro: string;
  status: string;
  cta: { label: string; href: string };
  cards: Array<{ title: string; body: string }>;
};

const PAGES: Record<string, AppDirectoryPage> = {
  ghostswap: {
    title: "GhostSwap",
    intro: "Ghost-native swap routing across GhostChain layers, with GST-denominated settlement and branded liquidity entry points.",
    status: "Live",
    cta: { label: "Open GhostXchange →", href: GHOST_SITES.exchange.url },
    cards: [
      { title: "GST Pairs", body: "Route swaps and pricing around GST-native markets instead of external token assumptions." },
      { title: "Layer-Aware Routing", body: "Keep application execution on GhostL2 and GhostL3 while preserving canonical settlement rules." },
      { title: "Portfolio Surface", body: "GhostSwap lives in the app universe and points traders into the broader Ghost liquidity stack." },
    ],
  },
  wallet: {
    title: "GhostWallet",
    intro: "Official GST wallet surface for GhostChain, GhostL2, and GhostL3 with branded send, receive, and history flows.",
    status: "Live",
    cta: { label: "Open GhostWallet →", href: GHOST_SITES.wallet.url },
    cards: [
      { title: "Canonical Wallet Domain", body: "GhostWallet now has a dedicated branded surface at wallet.ghostchain.cloud instead of a dead-end app-directory path." },
      { title: "GST Everywhere", body: "Wallet flows stay aligned with Ghost routing and GST denomination across all three Ghost layers." },
      { title: "Directory Alias", body: "This app-directory page exists so apps.ghostchain.cloud/wallet remains a valid launch path and no longer returns 404." },
    ],
  },
  nft: {
    title: "GhostNFT",
    intro: "Branded NFT marketplace and issuance surface for collections, provenance, and creator economy assets.",
    status: "Beta",
    cta: { label: "Open LitVyb Live →", href: `${GHOST_SITES.apps.url}/vyb` },
    cards: [
      { title: "Creator Economy", body: "Mint and distribute digital goods that align with GhostL3 creator flows and GST monetization." },
      { title: "GhostScan Visibility", body: "Track token provenance and collection activity through branded explorer surfaces." },
      { title: "Launch Path", body: "Marketplace and issuance features are staged behind the Ghost app directory while the core surface matures." },
    ],
  },
  id: {
    title: "GhostID",
    intro: "Identity, verification, and account-linked trust surfaces for the Ghost ecosystem.",
    status: "Coming Soon",
    cta: { label: "Open Portal →", href: GHOST_SITES.portal.url },
    cards: [
      { title: "GNS Alignment", body: "Identity flows will anchor to Ghost Name System profiles and branded account metadata." },
      { title: "Verification", body: "GhostID is intended to connect compliance, app identity, and operator trust without breaking the brand system." },
      { title: "Controlled Rollout", body: "The page exists now so the directory no longer dead-ends while the product surface is completed." },
    ],
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug: [slug] }));
}

export default async function AppDirectorySubpage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = PAGES[slug.join("/")];
  if (!page) notFound();

  return (
    <>
      <PublicNavbar cta={{ label: "App Universe", href: GHOST_SITES.apps.url }} />
      <main>
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">Ghost App Universe</span>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 800, margin: "24px 0 16px" }}>{page.title}</h1>
            <p style={{ color: "#94a3b8", maxWidth: 720, margin: "0 auto 20px" }}>{page.intro}</p>
            <div style={{ display: "inline-block", background: "#FFD70022", color: "#FFD700", padding: "6px 16px", borderRadius: 20, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase" }}>
              {page.status}
            </div>
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
