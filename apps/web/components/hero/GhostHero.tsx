"use client";

import dynamic from "next/dynamic";

const GhostNetwork = dynamic(() => import("../background/GhostNetwork"), { ssr: false });

export default function GhostHero() {
  return (
    <section
      style={{
        position:       "relative",
        minHeight:      "100vh",
        background:     "#0A0A0A",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        overflow:       "hidden",
        padding:        "2rem",
      }}
    >
      {/* WebGL background */}
      <GhostNetwork />

      {/* Radial gold vignette */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(255,215,0,0.06) 0%, transparent 70%)",
      }} />

      {/* Logo */}
      <img
        src="/assets/ghost-logo.png"
        alt="GhostChain"
        width={200}
        height={200}
        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
        style={{
          position: "relative",
          zIndex: 1,
          filter: "drop-shadow(0 0 32px #FFD700) drop-shadow(0 0 12px #FFAA00)",
          animation: "ghost-float 6s ease-in-out infinite",
        }}
      />

      {/* Headline */}
      <h1 style={{
        position:      "relative",
        zIndex:        1,
        marginTop:     "2rem",
        fontFamily:    "'Orbitron', 'Inter', sans-serif",
        fontSize:      "clamp(2rem, 6vw, 4.5rem)",
        fontWeight:    900,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color:         "#FFD700",
        textAlign:     "center",
        textShadow:    "0 0 32px rgba(255,215,0,0.7)",
      }}>
        GHOSTCHAIN
      </h1>

      <p style={{
        position:      "relative",
        zIndex:        1,
        marginTop:     "1rem",
        fontSize:      "clamp(1rem, 2.5vw, 1.4rem)",
        color:         "#C0C0C0",
        textAlign:     "center",
        letterSpacing: "0.06em",
        maxWidth:      "520px",
      }}>
        The Sovereign AI Blockchain
      </p>

      {/* CTA buttons */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", gap: "1rem", marginTop: "2.5rem", flexWrap: "wrap", justifyContent: "center" }}>
        <a href="/command-center" className="ghost-btn-primary">Launch App</a>
        <a href="/developers" className="ghost-btn-outline">Developer Docs</a>
      </div>

      {/* Ecosystem chips */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", gap: "0.75rem", marginTop: "3rem", flexWrap: "wrap", justifyContent: "center" }}>
        {["GhostChain L1", "GhostL2", "GhostL3", "Ghost Token GST", "GhostXchange", "GhostBrain AI"].map(label => (
          <span key={label} style={{
            padding:      "0.3rem 0.9rem",
            border:       "1px solid rgba(255,215,0,0.3)",
            borderRadius: "999px",
            color:        "#C0C0C0",
            fontSize:     "0.78rem",
            letterSpacing: "0.04em",
            background:   "rgba(255,215,0,0.05)",
          }}>{label}</span>
        ))}
      </div>

      <style>{`
        @keyframes ghost-float {
          0%,100% { transform: translateY(0) rotate(-1deg); }
          50%      { transform: translateY(-14px) rotate(1deg); }
        }
      `}</style>
    </section>
  );
}
