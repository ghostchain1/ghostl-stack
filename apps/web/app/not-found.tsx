import Link from "next/link";

export default function NotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          background: "#05070f",
          color: "#ebf0f7",
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div style={{ marginBottom: "1.5rem" }}>
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="30" stroke="#23d6a6" strokeWidth="2" opacity="0.3" />
            <circle cx="32" cy="32" r="20" stroke="#23d6a6" strokeWidth="1.5" opacity="0.5" />
            <line x1="22" y1="22" x2="42" y2="42" stroke="#23d6a6" strokeWidth="2" strokeLinecap="round" />
            <line x1="42" y1="22" x2="22" y2="42" stroke="#23d6a6" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h1
          style={{
            fontSize: "clamp(3rem, 12vw, 6rem)",
            fontWeight: 700,
            margin: "0 0 0.25rem",
            color: "#23d6a6",
            textShadow: "0 0 40px rgba(35,214,166,0.4)",
            letterSpacing: "-2px",
            lineHeight: 1,
          }}
        >
          404
        </h1>
        <p
          style={{
            fontSize: "1.25rem",
            color: "#9fb1c8",
            margin: "0 0 0.5rem",
            fontWeight: 500,
          }}
        >
          Page not found
        </p>
        <p
          style={{
            fontSize: "0.95rem",
            color: "#4a5a6b",
            margin: "0 0 2rem",
            maxWidth: "400px",
          }}
        >
          This route doesn&#39;t exist in the GhostChain Control Center.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.65rem 1.5rem",
            background: "rgba(35,214,166,0.12)",
            border: "1px solid rgba(35,214,166,0.35)",
            borderRadius: "10px",
            color: "#23d6a6",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.9rem",
            transition: "all 0.2s",
          }}
        >
          ← Back to Dashboard
        </Link>
      </body>
    </html>
  );
}
