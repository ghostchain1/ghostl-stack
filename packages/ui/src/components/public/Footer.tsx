import Link from "next/link";

const cols = [
  {
    title: "Platform",
    links: [
      { label: "GhostChain L1", href: "https://ghostchain.cloud/technology" },
      { label: "GhostL2",       href: "https://ghostchain.cloud/technology#l2" },
      { label: "GhostL3",       href: "https://ghostchain.cloud/technology#l3" },
      { label: "Tokenomics",    href: "https://ghostchain.cloud/tokenomics" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "https://dev.ghostchain.cloud/docs" },
      { label: "SDK",           href: "https://dev.ghostchain.cloud/sdk" },
      { label: "RPC Endpoints", href: "https://dev.ghostchain.cloud/rpc" },
      { label: "Grants",        href: "https://dev.ghostchain.cloud/grants" },
    ],
  },
  {
    title: "Ecosystem",
    links: [
      { label: "App Directory",  href: "https://apps.ghostchain.cloud" },
      { label: "Explorer",       href: "https://explorer.ghostchain.cloud" },
      { label: "Governance",     href: "https://governance.ghostchain.cloud" },
      { label: "Node Operators", href: "https://nodes.ghostchain.cloud" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About",   href: "https://ghostchain.company/team" },
      { label: "Careers", href: "https://ghostchain.company/careers" },
      { label: "Press",   href: "https://ghostchain.company/press" },
      { label: "Contact", href: "https://ghostchain.company/contact" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer style={{ background: "#050507", borderTop: "1px solid #1a1a2e", padding: "4rem 1.5rem 2rem" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "3rem", marginBottom: "3rem" }}>
          <div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#00F0FF", marginBottom: "1rem" }}>◈ GhostChain</div>
            <p style={{ color: "#64748b", fontSize: "0.875rem", lineHeight: 1.6, maxWidth: 240 }}>
              Sovereign AI-powered multi-layer blockchain. L1 · L2 · L3.
            </p>
            <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}>
              {["𝕏", "⬡ GitHub", "◎ Discord"].map(s => (
                <span key={s} style={{ color: "#475569", fontSize: "0.8rem", cursor: "pointer" }}>{s}</span>
              ))}
            </div>
          </div>
          {cols.map(col => (
            <div key={col.title}>
              <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "0.875rem", marginBottom: "1rem" }}>{col.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {col.links.map(l => (
                  <Link key={l.href} href={l.href} style={{ color: "#64748b", fontSize: "0.8125rem", textDecoration: "none" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#94a3b8")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#64748b")}>
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #1a1a2e", paddingTop: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <span style={{ color: "#475569", fontSize: "0.8125rem" }}>© 2026 GhostChain. All rights reserved.</span>
          <div style={{ display: "flex", gap: "1.5rem" }}>
            {["Privacy Policy", "Terms of Service", "Security"].map(l => (
              <span key={l} style={{ color: "#475569", fontSize: "0.8125rem", cursor: "pointer" }}>{l}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
