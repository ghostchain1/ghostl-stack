"use client";

import { useState, useEffect } from "react";

const LOGO_SRC = "/assets/ghost-logo.png";

interface SplashScreenProps {
  /** ms before auto-dismissing (default 2200) */
  duration?: number;
  onDone?: () => void;
}

export default function SplashScreen({ duration = 2200, onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<"circuits" | "logo" | "text" | "fade">("circuits");

  useEffect(() => {
    // 0.3s → circuits light up
    const t1 = setTimeout(() => setPhase("logo"), 300);
    // 0.9s → logo appears
    const t2 = setTimeout(() => setPhase("text"), 900);
    // 1.6s → text fades in
    const t3 = setTimeout(() => setPhase("fade"), 1600);
    // duration → done
    const t4 = setTimeout(() => onDone?.(), duration);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, [duration, onDone]);

  return (
    <div
      role="status"
      aria-label="Loading GhostChain"
      style={{
        position:        "fixed",
        inset:           0,
        zIndex:          9999,
        background:      "#0A0A0A",
        display:         "flex",
        flexDirection:   "column",
        alignItems:      "center",
        justifyContent:  "center",
        gap:             "1.5rem",
        opacity:         phase === "fade" ? 0 : 1,
        transition:      phase === "fade" ? "opacity 0.45s ease" : "none",
        pointerEvents:   "none",
      }}
    >
      {/* Circuit lines */}
      <svg
        viewBox="0 0 400 120"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: phase === "circuits" ? 0.7 : 0.2,
          transition: "opacity 0.4s",
        }}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {[
          "M0,30 L80,30 L100,60 L160,60",
          "M400,80 L300,80 L280,50 L220,50",
          "M0,90  L60,90  L90,40  L180,40",
          "M400,20 L340,20 L310,70 L230,70",
          "M180,10 L200,10 L200,110 L220,110",
        ].map((d, i) => (
          <path key={i} d={d} stroke="#FFD700" strokeWidth="1.5" fill="none" filter="url(#glow)"
            style={{ animation: `pulse-line ${1.2 + i * 0.2}s ease-in-out infinite alternate` }}
          />
        ))}
        <style>{`
          @keyframes pulse-line {
            from { stroke-opacity: 0.3; }
            to   { stroke-opacity: 1.0; }
          }
        `}</style>
      </svg>

      {/* Logo */}
      <img
        src={LOGO_SRC}
        alt="GhostChain"
        width={180}
        height={180}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        style={{
          opacity:    phase === "logo" || phase === "text" || phase === "fade" ? 1 : 0,
          transform:  phase === "circuits" ? "scale(0.6)" : "scale(1)",
          transition: "opacity 0.7s ease, transform 0.7s cubic-bezier(0.16,1,0.3,1)",
          filter:     "drop-shadow(0 0 24px #FFD700) drop-shadow(0 0 8px #FFAA00)",
          zIndex:     1,
        }}
      />

      {/* Text */}
      <div style={{
        textAlign:  "center",
        opacity:    phase === "text" || phase === "fade" ? 1 : 0,
        transform:  phase === "text" || phase === "fade" ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
        zIndex:     1,
      }}>
        <p style={{
          fontFamily:    "'Orbitron', 'Inter', sans-serif",
          fontSize:      "clamp(1.4rem, 4vw, 2.2rem)",
          fontWeight:    800,
          letterSpacing: "0.18em",
          color:         "#FFD700",
          textTransform: "uppercase",
        }}>GHOSTCHAIN</p>
        <p style={{ color: "#C0C0C0", fontSize: "0.85rem", marginTop: "0.4rem", letterSpacing: "0.08em" }}>
          Powering the Sovereign AI Economy
        </p>
      </div>
    </div>
  );
}
