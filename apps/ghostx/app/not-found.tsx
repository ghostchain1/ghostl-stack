import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-6">
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
          <circle cx="30" cy="30" r="28" stroke="#6366f1" strokeWidth="2" opacity="0.4" />
          <text x="30" y="38" textAnchor="middle" fontSize="22" fill="#6366f1" fontFamily="monospace" fontWeight="bold">X</text>
        </svg>
      </div>
      <h1 className="text-8xl font-bold mb-3" style={{ color: "#6366f1", textShadow: "0 0 40px rgba(99,102,241,0.35)" }}>
        404
      </h1>
      <p className="text-xl text-gray-400 mb-2 font-medium">Order not found</p>
      <p className="text-sm text-gray-600 mb-8 max-w-sm">
        This page doesn&#39;t exist on Ghost X. Check the order book or return to trading.
      </p>
      <div className="flex gap-3 flex-wrap justify-center">
        <Link
          href="/"
          className="px-5 py-2.5 rounded-lg font-semibold text-sm"
          style={{
            background: "rgba(99,102,241,0.12)",
            border: "1px solid rgba(99,102,241,0.35)",
            color: "#6366f1",
            textDecoration: "none",
          }}
        >
          Trade
        </Link>
        <Link
          href="/staking"
          className="px-5 py-2.5 rounded-lg font-semibold text-sm"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#9ca3af",
            textDecoration: "none",
          }}
        >
          Staking
        </Link>
      </div>
    </div>
  );
}
