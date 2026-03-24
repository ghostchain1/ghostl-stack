// GhostStack — Documentation Layout
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GhostStack Docs — Technical Documentation & Whitepaper",
  description: "GhostChain architecture, whitepaper, API reference, and developer guides",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-layout">
      {/* Mobile toggle */}
      <button className="c3-mobile-toggle" id="docs-toggle" aria-label="Open navigation">☰</button>
      <div className="c3-mobile-overlay" id="docs-overlay" />

      {/* ── Docs Sidebar ───────────────────────────────────────────────────── */}
      <nav className="docs-sidebar" id="docs-sidebar">
        <div className="docs-sidebar-brand">
          <span>👻</span> GhostStack Docs
        </div>

        <div className="docs-nav-section">Getting Started</div>
        <a href="/docs"                    className="docs-nav-link">📖 Overview</a>
        <a href="/docs/getting-started"    className="docs-nav-link">🚀 Quick Start</a>

        <div className="docs-nav-section">White Paper</div>
        <a href="/docs/whitepaper"         className="docs-nav-link">📄 Whitepaper v2</a>
        <a href="/docs/whitepaper#abstract"       className="docs-nav-link" style={{ paddingLeft: "2rem" }}>Abstract</a>
        <a href="/docs/whitepaper#architecture"   className="docs-nav-link" style={{ paddingLeft: "2rem" }}>Architecture</a>
        <a href="/docs/whitepaper#tokenomics"     className="docs-nav-link" style={{ paddingLeft: "2rem" }}>Tokenomics</a>
        <a href="/docs/whitepaper#governance"     className="docs-nav-link" style={{ paddingLeft: "2rem" }}>Governance</a>
        <a href="/docs/whitepaper#security"       className="docs-nav-link" style={{ paddingLeft: "2rem" }}>Security</a>
        <a href="/docs/whitepaper#roadmap"        className="docs-nav-link" style={{ paddingLeft: "2rem" }}>Roadmap</a>

        <div className="docs-nav-section">Architecture</div>
        <a href="/docs/architecture"       className="docs-nav-link">🏗 System Architecture</a>
        <a href="/docs/architecture#l1"           className="docs-nav-link" style={{ paddingLeft: "2rem" }}>GhostChain L1</a>
        <a href="/docs/architecture#l2"           className="docs-nav-link" style={{ paddingLeft: "2rem" }}>GhostL2 (OP Stack)</a>
        <a href="/docs/architecture#l3"           className="docs-nav-link" style={{ paddingLeft: "2rem" }}>GhostL3 (OP Stack)</a>
        <a href="/docs/architecture#ai"           className="docs-nav-link" style={{ paddingLeft: "2rem" }}>AI / GhostBrain</a>
        <a href="/docs/architecture#lge"          className="docs-nav-link" style={{ paddingLeft: "2rem" }}>LGE</a>

        <div className="docs-nav-section">Developer Reference</div>
        <a href="/docs/api"                className="docs-nav-link">🔌 API Reference</a>
        <a href="/docs/contracts"          className="docs-nav-link">📄 Smart Contracts</a>
        <a href="/docs/sdk"                className="docs-nav-link">📦 ghost-sdk-core</a>

        <div className="docs-nav-section">Operations</div>
        <a href="/docs/deployment"         className="docs-nav-link">🚢 Deployment Guide</a>
        <a href="/docs/governance-ops"     className="docs-nav-link">🏛 Governance Ops</a>

        <div style={{ padding: "1rem 1.25rem", marginTop: "auto", borderTop: "1px solid var(--border)", fontSize: "0.72rem", color: "var(--text-muted)" }}>
          <div>GhostStack Docs v2</div>
          <a href="/dashboard/overview" style={{ color: "var(--cyan)", textDecoration: "none" }}>→ C3 Dashboard</a>
          &nbsp;·&nbsp;
          <a href="/user" style={{ color: "var(--cyan)", textDecoration: "none" }}>→ User Portal</a>
        </div>
      </nav>

      {/* ── Docs main ────────────────────────────────────────────────────────── */}
      <main className="docs-main">{children}</main>

      {/* Mobile script */}
      <script dangerouslySetInnerHTML={{__html:`
        (function(){
          var t=document.getElementById('docs-toggle');
          var s=document.getElementById('docs-sidebar');
          var o=document.getElementById('docs-overlay');
          if(!t||!s||!o) return;
          function open(){s.classList.add('open');o.classList.add('open');t.textContent='✕';}
          function close(){s.classList.remove('open');o.classList.remove('open');t.textContent='☰';}
          t.addEventListener('click',function(){s.classList.contains('open')?close():open();});
          o.addEventListener('click',close);
          document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
        })();
      `}} />
    </div>
  );
}
