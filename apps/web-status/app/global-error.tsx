"use client";

import { useEffect } from "react";

// global-error.tsx replaces the entire document tree on fatal errors,
// so it must render its own <html> and <body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GhostChain] fatal error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: "#0A0A0A",
          color: "#E8E8E8",
          margin: 0,
          padding: "2rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          textAlign: "center",
          fontFamily: 'system-ui, "Segoe UI", sans-serif',
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            borderTop: "3px solid #FFD700",
            paddingTop: "2rem",
            maxWidth: "40rem",
            width: "100%",
          }}
        >
          <h1
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: "clamp(1.25rem, 4vw, 2rem)",
              fontWeight: 700,
              color: "#FFD700",
              marginBottom: "1rem",
              letterSpacing: "0.05em",
            }}
          >
            GhostChain — Fatal Error
          </h1>
          <p
            style={{
              color: "rgba(232,232,232,0.5)",
              marginBottom: "0.5rem",
              lineHeight: 1.6,
            }}
          >
            {error.message || "A fatal error occurred. Please reload the page."}
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: "0.7rem",
                color: "rgba(232,232,232,0.25)",
                marginBottom: "2rem",
                fontFamily: "monospace",
              }}
            >
              digest: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: "0.75rem 2.5rem",
              border: "1px solid #FFD700",
              borderRadius: "0.5rem",
              color: "#FFD700",
              background: "transparent",
              cursor: "pointer",
              fontFamily: '"Courier New", monospace',
              fontSize: "0.85rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
