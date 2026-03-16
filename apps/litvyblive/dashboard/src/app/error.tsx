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
    console.error("[LitVybzLive Dashboard] Segment error:", error);
  }, [error]);

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
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
          <circle cx="26" cy="26" r="24" stroke="#FFD700" strokeWidth="2" opacity="0.5" />
          <path d="M26 14v14" stroke="#FFD700" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="26" cy="35" r="1.5" fill="#FFD700" />
        </svg>
      </div>
      <h1
        style={{
          fontSize: "clamp(1.75rem, 6vw, 2.75rem)",
          fontWeight: 700,
          margin: "0 0 0.5rem",
          color: "#FFD700",
          lineHeight: 1.1,
        }}
      >
        Dashboard Error
      </h1>
      <p style={{ color: "rgba(255,255,255,0.55)", margin: "0 0 0.4rem", maxWidth: "400px" }}>
        {error.message || "An unexpected error occurred in the LitVybzLive dashboard."}
      </p>
      {error.digest && (
        <p style={{ fontSize: "0.77rem", color: "rgba(255,255,255,0.25)", fontFamily: "monospace", margin: "0 0 1.5rem" }}>
          digest: {error.digest}
        </p>
      )}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center", marginTop: "1rem" }}>
        <button
          onClick={reset}
          style={{
            padding: "0.65rem 1.5rem",
            background: "rgba(255,215,0,0.12)",
            border: "1px solid rgba(255,215,0,0.35)",
            borderRadius: "10px",
            color: "#FFD700",
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
            padding: "0.65rem 1.5rem",
            background: "rgba(123,47,190,0.12)",
            border: "1px solid rgba(123,47,190,0.35)",
            borderRadius: "10px",
            color: "#a855f7",
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
