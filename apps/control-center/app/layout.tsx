import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GhostStack C3 — Unified Command & Control Center",
  description: "GhostBrain human interface — control every chain, node, AI engine, validator, VM, and revenue system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Mobile hamburger */}
        <button className="c3-mobile-toggle" id="c3-toggle" aria-label="Open navigation">☰</button>
        <div className="c3-mobile-overlay" id="c3-overlay" />

        <div className="c3-layout">

          {/* ── Sidebar ──────────────────────────────────────────────────────── */}
          <nav className="c3-sidebar" id="c3-sidebar">
            <div className="c3-brand">
              <span className="c3-logo">👻</span>
              <div>
                <div className="c3-brand-title">GhostStack C3</div>
                <div className="c3-brand-sub">Command &amp; Control · Employee</div>
              </div>
            </div>

            {/* ── Overview ── */}
            <div className="c3-nav-section">🌐 Overview</div>
            <a href="/dashboard/overview"       className="c3-nav-link">📊 Dashboard</a>

            {/* ── Blockchain ── */}
            <div className="c3-nav-section">⛓ Blockchain</div>
            <a href="/dashboard/chains"         className="c3-nav-link">🔗 Chain Status</a>
            <a href="/dashboard/validators"     className="c3-nav-link">🗳 Validators</a>
            <a href="/dashboard/nodes"          className="c3-nav-link">🖥 Nodes</a>
            <a href="/dashboard/bridges"        className="c3-nav-link">🌉 Bridges</a>
            <a href="/dashboard/tokens"         className="c3-nav-link">🪙 GST Token</a>

            {/* ── Smart Contracts ── */}
            <div className="c3-nav-section">📄 Contracts</div>
            <a href="/dashboard/contracts"      className="c3-nav-link">📋 Contract Registry</a>

            {/* ── AI Systems ── */}
            <div className="c3-nav-section">🤖 AI Systems</div>
            <a href="/dashboard/ai"             className="c3-nav-link">⚡ AI Engines</a>
            <a href="/dashboard/agents"         className="c3-nav-link">🤖 AI Agents</a>
            <a href="/dashboard/cognitive"      className="c3-nav-link">🧠 Cognitive Layer</a>
            <a href="/dashboard/aiops"          className="c3-nav-link">🔮 AIOps Center</a>

            {/* ── Growth ── */}
            <div className="c3-nav-section">📈 Growth</div>
            <a href="/dashboard/marketing"      className="c3-nav-link">📣 Marketing</a>

            {/* ── Economy ── */}
            <div className="c3-nav-section">💰 Economy</div>
            <a href="/dashboard/revenue"        className="c3-nav-link">💰 Revenue</a>
            <a href="/dashboard/treasury"       className="c3-nav-link">🏦 Treasury</a>

            {/* ── Governance ── */}
            <div className="c3-nav-section">🏛 Governance</div>
            <a href="/dashboard/governance"     className="c3-nav-link">🗳 Proposals &amp; Votes</a>

            {/* ── Infrastructure ── */}
            <div className="c3-nav-section">🔧 Infrastructure</div>
            <a href="/dashboard/infrastructure" className="c3-nav-link">🖥 VMs &amp; Containers</a>
            <a href="/dashboard/services"       className="c3-nav-link">⚙️ All Services</a>

            {/* ── Naming & Identity ── */}
            <div className="c3-nav-section">🔤 Identity</div>
            <a href="/dashboard/gns"            className="c3-nav-link">🔤 GNS Names</a>

            {/* ── Security ── */}
            <div className="c3-nav-section">🔒 Security</div>
            <a href="/dashboard/security"       className="c3-nav-link">🛡 Security &amp; Alerts</a>

            {/* ── Operations ── */}
            <div className="c3-nav-section">📋 Operations</div>
            <a href="/dashboard/logs"           className="c3-nav-link">📜 Live Log Stream</a>
            <a href="/dashboard/settings"       className="c3-nav-link">⚙️ Settings</a>

            {/* ── Other Systems ── */}
            <div className="c3-nav-section">🌐 Other Portals</div>
            <a href="/user"                     className="c3-nav-link">👤 User Portal</a>
            <a href="/docs"                     className="c3-nav-link">📖 Docs &amp; Whitepaper</a>

            <div className="c3-sidebar-footer">
              <div className="c3-version">C3 v2.0.0 · Port 3100</div>
              <a href="/dashboard/chains" className="c3-ext-link">L1 :18545</a>
              &nbsp;·&nbsp;
              <a href="/dashboard/chains" className="c3-ext-link">L2 :29545</a>
              &nbsp;·&nbsp;
              <a href="/dashboard/chains" className="c3-ext-link">L3 :39545</a>
            </div>
          </nav>

          {/* ── Main content ─────────────────────────────────────────────────── */}
          <main className="c3-main">{children}</main>

        </div>

        {/* Mobile toggle script */}
        <script dangerouslySetInnerHTML={{__html:`
          (function(){
            var toggle=document.getElementById('c3-toggle');
            var sidebar=document.getElementById('c3-sidebar');
            var overlay=document.getElementById('c3-overlay');
            if(!toggle||!sidebar||!overlay) return;
            function open(){sidebar.classList.add('open');overlay.classList.add('open');toggle.textContent='✕';}
            function close(){sidebar.classList.remove('open');overlay.classList.remove('open');toggle.textContent='☰';}
            toggle.addEventListener('click',function(){sidebar.classList.contains('open')?close():open();});
            overlay.addEventListener('click',close);
            document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
          })();
        `}} />
      </body>
    </html>
  );
}
