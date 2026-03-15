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
        <div className="c3-layout">

          {/* ── Sidebar ──────────────────────────────────────────────────────── */}
          <nav className="c3-sidebar">
            <div className="c3-brand">
              <span className="c3-logo">👻</span>
              <div>
                <div className="c3-brand-title">GhostStack C3</div>
                <div className="c3-brand-sub">Command &amp; Control</div>
              </div>
            </div>

            <div className="c3-nav-section">🌐 Overview</div>
            <a href="/dashboard/overview"        className="c3-nav-link">Dashboard Overview</a>

            <div className="c3-nav-section">⛓ Blockchain</div>
            <a href="/dashboard/chains"          className="c3-nav-link">Chain Status</a>
            <a href="/dashboard/validators"      className="c3-nav-link">Validators</a>
            <a href="/dashboard/nodes"           className="c3-nav-link">Nodes</a>

            <div className="c3-nav-section">🤖 AI Systems</div>
            <a href="/dashboard/ai"              className="c3-nav-link">AI Engines</a>

            <div className="c3-nav-section">📈 Growth</div>
            <a href="/dashboard/marketing"       className="c3-nav-link">Marketing</a>

            <div className="c3-nav-section">💰 Economy</div>
            <a href="/dashboard/revenue"         className="c3-nav-link">Revenue</a>
            <a href="/dashboard/treasury"        className="c3-nav-link">Treasury</a>

            <div className="c3-nav-section">🏛 Governance</div>
            <a href="/dashboard/governance"      className="c3-nav-link">Proposals &amp; Votes</a>

            <div className="c3-nav-section">🔧 Infrastructure</div>
            <a href="/dashboard/infrastructure"  className="c3-nav-link">VMs &amp; Containers</a>

            <div className="c3-nav-section">📋 Operations</div>
            <a href="/dashboard/logs"            className="c3-nav-link">Live Log Stream</a>
            <a href="/dashboard/aiops"           className="c3-nav-link">🔮 AIOps Center</a>
            <a href="/dashboard/agents"          className="c3-nav-link">🤖 AI Agents</a>
            <a href="/dashboard/cognitive"       className="c3-nav-link">🧠 Cognitive Layer</a>

            <div className="c3-sidebar-footer">
              <div className="c3-version">C3 v1.0.0 · Port 3100</div>
              <a href="http://localhost:3000" target="_blank" rel="noopener" className="c3-ext-link">GSCC ↗</a>
              &nbsp;&nbsp;
              <a href="http://localhost:3001" target="_blank" rel="noopener" className="c3-ext-link">Grafana ↗</a>
            </div>
          </nav>

          {/* ── Main content ─────────────────────────────────────────────────── */}
          <main className="c3-main">{children}</main>

        </div>
      </body>
    </html>
  );
}
