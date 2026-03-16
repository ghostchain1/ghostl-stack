"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GhostChain Control Center] Segment error:", error);
  }, [error]);

  return (
    <div
      style={{
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
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <circle cx="28" cy="28" r="26" stroke="#f2c14e" strokeWidth="2" opacity="0.4" />
          <path d="M28 18v14" stroke="#f2c14e" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="28" cy="38" r="1.5" fill="#f2c14e" />
        </svg>
      </div>
      <h1
        style={{
          fontSize: "clamp(2rem, 8vw, 3.5rem)",
          fontWeight: 700,
          margin: "0 0 0.5rem",
          color: "#f2c14e",
          textShadow: "0 0 30px rgba(242,193,78,0.3)",
          letterSpacing: "-1px",
          lineHeight: 1.1,
        }}
      >
        Something went wrong
      </h1>
      <p
        style={{
          fontSize: "1rem",
          color: "#9fb1c8",
          margin: "0 0 0.4rem",
          maxWidth: "420px",
        }}
      >
        {error.message || "An unexpected error occurred in the Control Center."}
      </p>
      {error.digest && (
        <p style={{ fontSize: "0.78rem", color: "#4a5a6b", margin: "0 0 1.75rem", fontFamily: "monospace" }}>
          Digest: {error.digest}
        </p>
      )}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center", marginTop: "0.75rem" }}>
        <button
          onClick={reset}
          style={{
            padding: "0.65rem 1.4rem",
            background: "rgba(242,193,78,0.12)",
            border: "1px solid rgba(242,193,78,0.35)",
            borderRadius: "10px",
            color: "#f2c14e",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Try Again
        </button>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0.65rem 1.4rem",
            background: "rgba(35,214,166,0.08)",
            border: "1px solid rgba(35,214,166,0.25)",
            borderRadius: "10px",
            color: "#23d6a6",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
