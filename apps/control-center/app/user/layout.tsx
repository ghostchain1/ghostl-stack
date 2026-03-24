// GhostStack — User Portal Layout
// Separate from C3 employee system — user-facing wallet, staking, governance, bridge
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GhostStack — User Portal",
  description: "GhostChain user portal — wallet, staking, governance, bridge, and transactions",
};

export default function UserPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="up-layout">
      {/* Mobile toggle */}
      <button className="c3-mobile-toggle" id="up-toggle" aria-label="Open navigation">☰</button>
      <div className="c3-mobile-overlay" id="up-overlay" />

      {/* ── User Sidebar ─────────────────────────────────────────────────────── */}
      <nav className="up-sidebar" id="up-sidebar">
        <div className="up-brand">
          <span className="up-logo">👻</span>
          <div>
            <div className="up-brand-title">GhostWallet</div>
            <div className="up-brand-sub">User Portal</div>
          </div>
        </div>

        <div className="up-nav-section">💼 Account</div>
        <a href="/user"                  className="up-nav-link">🏠 Home</a>
        <a href="/user/wallet"           className="up-nav-link">💳 Wallet</a>
        <a href="/user/transactions"     className="up-nav-link">📋 Transactions</a>
        <a href="/user/profile"          className="up-nav-link">👤 Profile</a>

        <div className="up-nav-section">⚡ Earn</div>
        <a href="/user/staking"          className="up-nav-link">🔒 Staking</a>

        <div className="up-nav-section">🌐 Network</div>
        <a href="/user/governance"       className="up-nav-link">🏛 Governance</a>
        <a href="/user/bridge"           className="up-nav-link">🌉 Bridge</a>

        <div className="up-nav-section">📚 Learn</div>
        <a href="/docs"                  className="up-nav-link">📖 Documentation</a>
        <a href="/docs/whitepaper"       className="up-nav-link">📄 Whitepaper</a>

        <div className="up-footer">
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
            GhostChain · L1:14000101 · L2:901 · L3:903
          </div>
          <a href="/dashboard/overview" style={{ fontSize: "0.72rem", color: "var(--user-accent)", textDecoration: "none" }}>
            Employee C3 ↗
          </a>
        </div>
      </nav>

      {/* ── User main ────────────────────────────────────────────────────────── */}
      <main className="up-main">{children}</main>

      {/* Mobile script */}
      <script dangerouslySetInnerHTML={{__html:`
        (function(){
          var t=document.getElementById('up-toggle');
          var s=document.getElementById('up-sidebar');
          var o=document.getElementById('up-overlay');
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
