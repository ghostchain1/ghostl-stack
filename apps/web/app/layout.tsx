import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GhostChain | Sovereign AI Blockchain",
  description: "GhostChain — the sovereign AI blockchain powering GhostL2, GhostL3, and the GhostStack ecosystem",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="layout">
          <nav className="sidebar">
            <div className="sidebar-brand">
              <span className="ghost-icon">👻</span>
              <span>GhostStack</span>
            </div>
            <ul className="nav-links">
              <li className="nav-section">� Public</li>
              <li><a href="/public-landing">Landing Page</a></li>
              <li><a href="/ecosystem">Ecosystem</a></li>
              <li><a href="/token">Token (GST)</a></li>
              <li><a href="/developers">Developers</a></li>

              <li className="nav-section">�🎯 Command Center</li>
              <li><a href="/command-center">GSCC Overview</a></li>
              <li><a href="/command-center/ai">AI Engine Control</a></li>
              <li><a href="/command-center/logs">Live Log Stream</a></li>
              <li><a href="/command-center-3d">3D Network Map</a></li>

              <li className="nav-section">⚡ Overview</li>
              <li><a href="/">Dashboard</a></li>
              <li><a href="/command-hub">Command Hub</a></li>

              <li className="nav-section">🏗 Infrastructure</li>
              <li><a href="/infrastructure">Infrastructure</a></li>
              <li><a href="/control-plane">Control Plane</a></li>

              <li className="nav-section">⛓ Blockchain</li>
              <li><a href="/blockchain">Blockchain</a></li>
              <li><a href="/multichain">Multichain</a></li>
              <li><a href="/validators">Validators</a></li>

              <li className="nav-section">💰 Economy</li>
              <li><a href="/economy">Economy</a></li>
              <li><a href="/data-mesh">Data Mesh</a></li>
              <li><a href="/simulation">SimLab</a></li>
              <li><a href="/governance">Governance</a></li>

              <li className="nav-section">🤖 AI Systems</li>
              <li><a href="/ai">AI System</a></li>
              <li><a href="/kernel">Kernel</a></li>
              <li><a href="/orchestrator">Orchestrator</a></li>
              <li><a href="/intelligence">Intelligence</a></li>
              <li><a href="/evolution">Evolution</a></li>
              <li><a href="/copilot">AI Copilot</a></li>

              <li className="nav-section">🔧 Autonomous Engines</li>
              <li><a href="/aie">Infrastructure Engine</a></li>
              <li><a href="/ase">Security Engine</a></li>
              <li><a href="/gie">Intelligence Engine</a></li>
              <li><a href="/governance">Governance Engine</a></li>
              <li><a href="/interchain">Interchain Engine</a></li>
              <li><a href="/agents">AI Agent Network</a></li>
              <li><a href="/development">Development Engine</a></li>
              <li><a href="/evolution-engine">Self-Evolution Engine</a></li>
              <li><a href="/planetary">Planetary Network Engine</a></li>
              <li><a href="/interplanetary">Interplanetary Network Engine</a></li>
              <li><a href="/hypervisor">Hypervisor Control Layer</a></li>
              <li><a href="/revenue">Autonomous Revenue Engine</a></li>

              <li className="nav-section">📈 Growth Engines</li>
              <li><a href="/marketing">AI Marketing</a></li>
              <li><a href="/growth">Viral Growth</a></li>
              <li><a href="/adoption">Adoption</a></li>
              <li><a href="/expansion">Expansion</a></li>
              <li><a href="/aee">Economy Engine</a></li>

              <li className="nav-section">�🔐 Security</li>
              <li><a href="/security">Security</a></li>
              <li><a href="/compliance">Compliance</a></li>

              <li className="nav-section">🛠 DevOps</li>
              <li><a href="/devops">DevOps</a></li>
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
