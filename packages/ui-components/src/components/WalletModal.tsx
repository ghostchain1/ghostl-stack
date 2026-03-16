"use client";

import { useState } from "react";
import { Button } from "./Button";
import { GhostLogo } from "./GhostLogo";

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
}

type GhostWalletProvider = {
  request: (request: { method: string }) => Promise<string[]>;
};

declare global {
  interface Window {
    ghostWallet?: GhostWalletProvider;
  }
}

export function WalletModal({ open, onClose }: WalletModalProps) {
  const [connecting, setConnecting] = useState(false);

  if (!open) return null;

  async function handleConnect() {
    setConnecting(true);
    // GhostWallet connection via ghost-sdk-core injected provider
    if (typeof window !== "undefined" && window.ghostWallet) {
      try {
        await window.ghostWallet.request({ method: "ghost_requestAccounts" });
      } catch {
        // user rejected — not an error
      }
    }
    setConnecting(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <GhostLogo size={24} />
            <h2 className="text-zinc-100 font-semibold">Connect GhostWallet</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            ✕
          </button>
        </div>

        <p className="text-zinc-400 text-sm mb-6">
          Connect your GhostWallet to access multi-chain features (L1 / L2 / L3).
          Gas token: <span className="text-violet-400 font-medium">GST</span>.
        </p>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          loading={connecting}
          onClick={handleConnect}
        >
          Connect GhostWallet
        </Button>

        <p className="text-center text-xs text-zinc-600 mt-4">
          GhostWallet required — uses <span className="text-zinc-500">ghost_</span> RPC namespace
        </p>
      </div>
    </div>
  );
}
