"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GhostChain Control Center] Global error:", error);
  }, [error]);

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
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
          borderTop: "3px solid #23d6a6",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(2rem, 8vw, 3rem)",
            fontWeight: 700,
            margin: "0 0 0.75rem",
            color: "#f2c14e",
            lineHeight: 1.1,
          }}
        >
          Critical Error
        </h1>
        <p style={{ fontSize: "1rem", color: "#9fb1c8", margin: "0 0 0.4rem", maxWidth: "400px" }}>
          {error.message || "The GhostChain Control Center encountered a fatal error."}
        </p>
        {error.digest && (
          <p style={{ fontSize: "0.77rem", color: "#4a5a6b", margin: "0 0 2rem", fontFamily: "monospace" }}>
            Digest: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: "1rem",
            padding: "0.65rem 2rem",
            background: "rgba(35,214,166,0.12)",
            border: "1px solid rgba(35,214,166,0.35)",
            borderRadius: "10px",
            color: "#23d6a6",
            fontWeight: 700,
            fontSize: "1rem",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
