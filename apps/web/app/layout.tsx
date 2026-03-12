import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GhostStack Command Center",
  description: "Unified AI-managed blockchain infrastructure dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="layout">
          <nav className="sidebar">
            <div className="sidebar-brand">
              <span className="ghost-icon">👻</span>
              <span>GhostStack</span>
            </div>
            <ul className="nav-links">
              <li><a href="/">Dashboard</a></li>
              <li><a href="/control-plane">Control Plane</a></li>
              <li><a href="/infrastructure">Infrastructure</a></li>
              <li><a href="/validators">Validators</a></li>
              <li><a href="/economy">Economy</a></li>
              <li><a href="/data-mesh">Data Mesh</a></li>
              <li><a href="/multichain">Multichain</a></li>
              <li><a href="/governance">Governance</a></li>
              <li><a href="/simulation">SimLab</a></li>
              <li><a href="/ai">AI System</a></li>
              <li><a href="/security">Security</a></li>
            </ul>
            <div className="sidebar-footer">
              <a href={process.env.NEXT_PUBLIC_GRAFANA_URL || "http://localhost:3001"}
                 target="_blank" rel="noopener">Grafana ↗</a>
            </div>
          </nav>
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
