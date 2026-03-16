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
    console.error("[GhostX DEX] Segment error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-5">
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
          <circle cx="26" cy="26" r="24" stroke="#f59e0b" strokeWidth="2" opacity="0.4" />
          <path d="M26 16v12" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="26" cy="35" r="1.5" fill="#f59e0b" />
        </svg>
      </div>
      <h1 className="text-4xl font-bold mb-2" style={{ color: "#f59e0b" }}>
        Exchange Error
      </h1>
      <p className="text-gray-400 mb-1 max-w-md">
        {error.message || "An unexpected error occurred in the Ghost X exchange."}
      </p>
      {error.digest && (
        <p className="text-xs text-gray-600 font-mono mb-6">digest: {error.digest}</p>
      )}
      <div className="flex gap-3 flex-wrap justify-center mt-4">
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-lg font-semibold text-sm cursor-pointer"
          style={{
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.35)",
            color: "#f59e0b",
            fontFamily: "inherit",
          }}
        >
          Try Again
        </button>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-lg font-semibold text-sm"
          style={{
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.2)",
            color: "#818cf8",
            textDecoration: "none",
          }}
        >
          Back to Trading
        </Link>
      </div>
    </div>
  );
}
