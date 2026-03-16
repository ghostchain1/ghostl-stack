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
    console.error("[LitVybzLive Dashboard] Global error:", error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body
        style={{
          margin: 0,
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
          borderTop: "3px solid #7B2FBE",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(2rem, 7vw, 3rem)",
            fontWeight: 700,
            margin: "0 0 0.75rem",
            background: "linear-gradient(135deg, #7B2FBE, #FF2D78)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            lineHeight: 1.1,
          }}
        >
          LitVybzLive — Fatal Error
        </h1>
        <p style={{ color: "rgba(255,255,255,0.5)", margin: "0 0 0.4rem", maxWidth: "380px" }}>
          {error.message || "The dashboard encountered a critical error. Please reload."}
        </p>
        {error.digest && (
          <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.25)", fontFamily: "monospace", margin: "0 0 2rem" }}>
            digest: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: "1rem",
            padding: "0.7rem 2.25rem",
            background: "linear-gradient(135deg, rgba(123,47,190,0.2), rgba(255,45,120,0.2))",
            border: "1px solid rgba(123,47,190,0.5)",
            borderRadius: "10px",
            color: "#ffffff",
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
