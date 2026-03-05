"use client";

import { useWallet } from "../context/WalletContext";

export default function WalletButton() {
  const {
    connect,
    disconnect,
    switchChain,
    address,
    shortAddr,
    balanceStr,
    isConnected,
    isGhostWallet,
    isCorrectChain,
    connecting,
    error,
    clearError,
  } = useWallet();

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={connect}
          disabled={connecting}
          className="flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          {connecting ? (
            <>
              <Spinner />
              Connecting…
            </>
          ) : (
            <>
              <GhostIcon />
              Connect Ghost Wallet
            </>
          )}
        </button>
        {error && (
          <p className="text-xs text-red-400 max-w-xs text-right">
            {error}{" "}
            <button onClick={clearError} className="underline">dismiss</button>
          </p>
        )}
      </div>
    );
  }

  // ── Wrong chain warning ────────────────────────────────────────────────────
  if (!isCorrectChain) {
    return (
      <button
        onClick={switchChain}
        className="flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
      >
        ⚠ Switch to GhostChain L2
      </button>
    );
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-3">
      {/* Balance pill */}
      <div className="hidden sm:flex flex-col items-end leading-tight">
        <span className="text-xs text-gray-400">Balance</span>
        <span className="text-sm font-mono text-white">{balanceStr} GST</span>
      </div>

      {/* Address chip */}
      <div className="flex items-center gap-2 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2">
        {isGhostWallet && (
          <span title="Ghost Wallet" className="text-lg leading-none">
            👻
          </span>
        )}
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-gray-400">
            {isGhostWallet ? "Ghost Wallet" : "Connected"}
          </span>
          <span className="text-sm font-mono text-white">{shortAddr}</span>
        </div>

        {/* Disconnect */}
        <button
          onClick={disconnect}
          title="Disconnect"
          className="ml-1 text-gray-500 hover:text-red-400 transition-colors text-xs"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function GhostIcon() {
  return <span className="text-lg leading-none">👻</span>;
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8z"
      />
    </svg>
  );
}
