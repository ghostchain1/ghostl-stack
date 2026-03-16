import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        background: "#0A0A12",
        color: "#ffffff",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <div style={{ marginBottom: "1.5rem" }}>
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
          <circle cx="30" cy="30" r="28" stroke="#7B2FBE" strokeWidth="2" opacity="0.5" />
          <circle cx="30" cy="30" r="18" stroke="#FF2D78" strokeWidth="1.5" opacity="0.4" />
          <line x1="21" y1="21" x2="39" y2="39" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" />
          <line x1="39" y1="21" x2="21" y2="39" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <h1
        style={{
          fontSize: "clamp(3.5rem, 14vw, 6rem)",
          fontWeight: 800,
          margin: "0 0 0.25rem",
          background: "linear-gradient(135deg, #7B2FBE, #FF2D78)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          lineHeight: 1,
        }}
      >
        404
      </h1>
      <p style={{ fontSize: "1.2rem", color: "#FFD700", margin: "0 0 0.5rem", fontWeight: 600 }}>
        Page not found
      </p>
      <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.45)", margin: "0 0 2rem", maxWidth: "360px" }}>
        This page doesn&#39;t exist in the LitVybzLive admin dashboard.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.7rem 1.75rem",
          background: "linear-gradient(135deg, rgba(123,47,190,0.2), rgba(255,45,120,0.2))",
          border: "1px solid rgba(123,47,190,0.5)",
          borderRadius: "10px",
          color: "#ffffff",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: "0.9rem",
        }}
      >
        ← Back to Dashboard
      </Link>
    </div>
  );
}
