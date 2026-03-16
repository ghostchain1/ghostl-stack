import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1
        style={{
          fontFamily: '"Orbitron", "Courier New", monospace',
          fontSize: "clamp(4rem, 15vw, 8rem)",
          fontWeight: 900,
          color: "var(--accent, #FFD700)",
          lineHeight: 1,
          marginBottom: "0.5rem",
          textShadow: "0 0 30px rgba(255,215,0,0.4)",
        }}
      >
        404
      </h1>
      <p
        style={{
          fontSize: "1.25rem",
          color: "var(--text-muted, rgba(232,232,232,0.5))",
          marginBottom: "0.75rem",
        }}
      >
        Page not found on GhostChain.
      </p>
      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--text-muted, rgba(232,232,232,0.35))",
          marginBottom: "2.5rem",
        }}
      >
        The route you requested does not exist in this layer.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          padding: "0.75rem 2.5rem",
          border: "1px solid var(--accent, #FFD700)",
          borderRadius: "var(--radius, 0.5rem)",
          color: "var(--accent, #FFD700)",
          textDecoration: "none",
          fontFamily: '"Orbitron", monospace',
          fontSize: "0.8rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Return Home
      </Link>
    </main>
  );
}
