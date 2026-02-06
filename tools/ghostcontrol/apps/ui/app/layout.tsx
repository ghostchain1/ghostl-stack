import type { ReactNode } from "react";

import "./globals.css";

export const metadata = {
  title: "GhostControl",
  description: "Central autonomous control plane for the Ghost stack",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <nav className="nav">
            <a className="pill" href="/">
              Status
            </a>
            <a className="pill" href="/incidents">
              Incidents
            </a>
            <a className="pill" href="/actions">
              Actions
            </a>
            <a className="pill" href="/evidence">
              Evidence
            </a>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}

