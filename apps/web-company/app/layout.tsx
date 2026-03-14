import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:      "Enterprise — GhostChain Solutions",
  description:"Private chain deployments, enterprise SLAs, and B2B blockchain consulting.",
  themeColor: "#FFD700",
  icons: {
    icon:  [
      { url: "https://ghostchain.cloud/favicon.svg",     type: "image/svg+xml" },
      { url: "https://ghostchain.cloud/favicon.png",     sizes: "32x32" },
      { url: "https://ghostchain.cloud/favicon-192.png", sizes: "192x192" },
    ],
    apple: "https://ghostchain.cloud/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    title: "Enterprise — GhostChain Solutions",
    description: "Private chain deployments, enterprise SLAs, and B2B blockchain consulting.",
    siteName: "GhostChain",
    images: [{ url: "https://ghostchain.cloud/logo.png", width: 500, height: 500 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Enterprise — GhostChain Solutions",
    description: "Private chain deployments, enterprise SLAs, and B2B blockchain consulting.",
    images: ["https://ghostchain.cloud/logo.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* ── TOP NAV ──────────────────────────────────────────────── */}
        <header className="ghost-nav">
          <a href="https://ghostchain.cloud" className="ghost-nav-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://ghostchain.cloud/logo.webp"
              alt="GhostChain"
              className="ghost-nav-logo"
              width={34}
              height={34}
            />
            <span>GHOSTCHAIN</span>
          </a>
          <nav className="ghost-nav-links">
            <a href="https://invest.ghostchain.cloud">Invest</a>
            <a href="https://explorer.ghostchain.cloud">Explorer</a>
            <a href="https://dev.ghostchain.cloud">Developers</a>
            <a href="https://nodes.ghostchain.cloud">Nodes</a>
            <a href="https://governance.ghostchain.cloud">Governance</a>
            <a href="https://status.ghostchain.cloud">Status</a>
          </nav>
          <a href="https://app.ghostchain.cloud" className="ghost-nav-cta">
            &#9654;&nbsp;App
          </a>
        </header>

        {/* ── CONTENT ──────────────────────────────────────────────── */}
        <main className="ghost-main">{children}</main>

        {/* ── FOOTER ───────────────────────────────────────────────── */}
        <footer className="ghost-foot">
          <div className="ghost-foot-inner">
            <a href="https://ghostchain.cloud" className="ghost-foot-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://ghostchain.cloud/logo.webp"
                alt="GhostChain"
                width={22}
                height={22}
              />
              GhostChain
            </a>
            <nav className="ghost-foot-links">
              <a href="https://invest.ghostchain.cloud">Investors</a>
              <a href="https://apps.ghostchain.cloud">Apps</a>
              <a href="https://explorer.ghostchain.cloud">Explorer</a>
              <a href="https://dev.ghostchain.cloud">Developers</a>
              <a href="https://bridge.ghostchain.cloud">Bridge</a>
              <a href="https://company.ghostchain.cloud">Enterprise</a>
            </nav>
            <p className="ghost-foot-copy">&copy; 2026 GhostChain. All rights reserved.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
