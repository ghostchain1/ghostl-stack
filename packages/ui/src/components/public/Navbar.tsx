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
    <nav style={{
      background: "rgba(10,10,10,0.96)",
      borderBottom: "1px solid rgba(255,215,0,0.18)",
      position: "sticky", top: 0, zIndex: 100,
      backdropFilter: "blur(16px)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", height: 68, gap: "2rem" }}>
        <Link href="https://ghostchain.cloud" style={{
          fontFamily: "'Orbitron', 'Inter', sans-serif",
          fontSize: "1.15rem", fontWeight: 700,
          color: "#FFD700", textDecoration: "none",
          letterSpacing: "0.08em", flexShrink: 0,
          textShadow: "0 0 12px rgba(255,215,0,0.5)",
        }}>
          👻 {siteName}
        </Link>
        <div style={{ display: "flex", gap: "1.5rem", flex: 1 }} className="nav-links-desktop">
          {links.map(l => (
            <Link key={l.href} href={l.href} style={{ color: "#C0C0C0", textDecoration: "none", fontSize: "0.875rem", fontWeight: 500 }}
              onMouseEnter={e => (e.currentTarget.style.color = "#FFD700")}
              onMouseLeave={e => (e.currentTarget.style.color = "#C0C0C0")}>
              {l.label}
            </Link>
          ))}
        </div>
        {cta && (
          <Link href={cta.href} style={{
            background: "linear-gradient(135deg, #FFD700, #FFAA00)",
            color: "#000", padding: "0.5rem 1.25rem", borderRadius: 8,
            textDecoration: "none", fontSize: "0.875rem", fontWeight: 700,
            letterSpacing: "0.04em",
          }}>
            {cta.label}
          </Link>
        )}
      </div>
    </nav>
  );
}
