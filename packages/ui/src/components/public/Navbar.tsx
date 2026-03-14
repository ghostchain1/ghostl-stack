"use client";
import Link from "next/link";
import { useState } from "react";

interface NavLink { label: string; href: string; }

interface NavbarProps {
  links?: NavLink[];
  siteName?: string;
  cta?: { label: string; href: string };
}

const defaultLinks: NavLink[] = [
  { label: "Technology", href: "/technology" },
  { label: "Ecosystem",  href: "/ecosystem" },
  { label: "Developers", href: "https://dev.ghostchain.cloud" },
  { label: "Investors",  href: "https://invest.ghostchain.cloud" },
  { label: "Portal",     href: "https://portal.ghostchain.cloud" },
];

export function PublicNavbar({ links = defaultLinks, siteName = "GhostChain", cta }: NavbarProps) {
  const [open, setOpen] = useState(false);
  return (
    <nav style={{ background: "rgba(5,5,7,0.95)", borderBottom: "1px solid #1a1a2e", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(12px)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", height: 64, gap: "2rem" }}>
        <Link href="/" style={{ fontSize: "1.25rem", fontWeight: 700, color: "#00F0FF", textDecoration: "none", letterSpacing: "-0.02em", flexShrink: 0 }}>
          ◈ {siteName}
        </Link>
        <div style={{ display: "flex", gap: "1.5rem", flex: 1 }} className="nav-links-desktop">
          {links.map(l => (
            <Link key={l.href} href={l.href} style={{ color: "#94a3b8", textDecoration: "none", fontSize: "0.875rem", fontWeight: 500 }}
              onMouseEnter={e => (e.currentTarget.style.color = "#e2e8f0")}
              onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}>
              {l.label}
            </Link>
          ))}
        </div>
        {cta && (
          <Link href={cta.href} style={{ background: "linear-gradient(135deg, #00F0FF22, #7A00FF22)", border: "1px solid #00F0FF55", color: "#00F0FF", padding: "0.5rem 1.25rem", borderRadius: 8, textDecoration: "none", fontSize: "0.875rem", fontWeight: 600 }}>
            {cta.label}
          </Link>
        )}
      </div>
    </nav>
  );
}
