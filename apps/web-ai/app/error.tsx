"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GhostChain] runtime error:", error);
  }, [error]);

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
      <h2
        style={{
          fontFamily: '"Orbitron", "Courier New", monospace',
          fontSize: "clamp(1.5rem, 5vw, 2.5rem)",
          fontWeight: 700,
          color: "var(--accent, #FFD700)",
          marginBottom: "1rem",
        }}
      >
        Something went wrong
      </h2>
      <p
        style={{
          color: "var(--text-muted, rgba(232,232,232,0.5))",
          marginBottom: "0.5rem",
          maxWidth: "36rem",
        }}
      >
        {error.message || "An unexpected error occurred."}
      </p>
      {error.digest && (
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted, rgba(232,232,232,0.3))",
            marginBottom: "2rem",
            fontFamily: "monospace",
          }}
        >
          digest: {error.digest}
        </p>
      )}
      <div style={{ display: "flex", gap: "1rem" }}>
        <button
          onClick={reset}
          style={{
            padding: "0.75rem 2rem",
            border: "1px solid var(--accent, #FFD700)",
            borderRadius: "var(--radius, 0.5rem)",
            color: "var(--accent, #FFD700)",
            background: "transparent",
            cursor: "pointer",
            fontFamily: '"Orbitron", monospace',
            fontSize: "0.8rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Try Again
        </button>
        <a
          href="/"
          style={{
            padding: "0.75rem 2rem",
            border: "1px solid var(--border, rgba(255,215,0,0.2))",
            borderRadius: "var(--radius, 0.5rem)",
            color: "var(--text-muted, rgba(232,232,232,0.5))",
            textDecoration: "none",
            fontFamily: '"Orbitron", monospace',
            fontSize: "0.8rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Go Home
        </a>
      </div>
    </main>
  );
}
