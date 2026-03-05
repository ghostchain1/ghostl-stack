"use client";

import { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tier = "NONE" | "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

interface BadgeInfo {
  tier:       Tier;
  tokenId:    string;
  mintedAt:   number;
  updatedAt:  number;
  discount:   number; // basis points
}

// ─── Tier meta ────────────────────────────────────────────────────────────────

const TIER_META: Record<Tier, { emoji: string; label: string; color: string; discountPct: number }> = {
  NONE:    { emoji: "○",  label: "No Badge",   color: "text-gray-500",   discountPct: 0  },
  BRONZE:  { emoji: "🥉", label: "Bronze",     color: "text-amber-600",  discountPct: 10 },
  SILVER:  { emoji: "🥈", label: "Silver",     color: "text-slate-300",  discountPct: 20 },
  GOLD:    { emoji: "🥇", label: "Gold",       color: "text-yellow-400", discountPct: 35 },
  DIAMOND: { emoji: "💎", label: "Diamond",    color: "text-cyan-300",   discountPct: 50 },
};

// Thresholds in human-readable GST amounts
const TIER_THRESHOLDS: Record<Tier, number> = {
  NONE:    0,
  BRONZE:  100,
  SILVER:  1_000,
  GOLD:    10_000,
  DIAMOND: 50_000,
};

const TIER_ORDER: Tier[] = ["NONE", "BRONZE", "SILVER", "GOLD", "DIAMOND"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function BadgeDisplay() {
  const { address, isConnected, provider } = useWallet();
  const [badge, setBadge]   = useState<BadgeInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isConnected || !address || !provider) {
      setBadge(null);
      return;
    }

    const badgeAddr = process.env.NEXT_PUBLIC_GHOSTX_BADGE ?? "";
    if (!badgeAddr) return;

    setLoading(true);

    // Minimal ABI — just what we need
    const abi = [
      "function hasBadge(address) view returns (bool)",
      "function getBadge(address) view returns (tuple(uint256 tokenId, uint8 tier, uint256 mintedAt, uint256 updatedAt))",
      "function discountBps(address) view returns (uint256)",
    ];

    // Use ghost via the provider
    import("ghost").then(({ ghost }) => {
      const web3 = new ghost.BrowserProvider(provider as unknown as ghost.Eip1193Provider);
      const contract = new ghost.Contract(badgeAddr, abi, web3);

      Promise.all([
        contract.hasBadge(address) as Promise<boolean>,
        contract.discountBps(address) as Promise<bigint>,
      ])
        .then(async ([has, discount]) => {
          if (!has) {
            setBadge({ tier: "NONE", tokenId: "", mintedAt: 0, updatedAt: 0, discount: 0 });
            return;
          }
          const raw = await (contract.getBadge(address) as Promise<[bigint, number, bigint, bigint]>);
          const tierNames: Tier[] = ["NONE", "BRONZE", "SILVER", "GOLD", "DIAMOND"];
          setBadge({
            tier:      tierNames[raw[1]] ?? "NONE",
            tokenId:   raw[0].toString(),
            mintedAt:  Number(raw[2]),
            updatedAt: Number(raw[3]),
            discount:  Number(discount),
          });
        })
        .catch(() => setBadge(null))
        .finally(() => setLoading(false));
    });
  }, [address, isConnected, provider]);

  if (!isConnected) return null;
  if (loading) return <div className="text-xs text-gray-500 animate-pulse">Loading badge…</div>;

  const tier = badge?.tier ?? "NONE";
  const meta = TIER_META[tier];
  const nextTier = TIER_ORDER[TIER_ORDER.indexOf(tier) + 1] as Tier | undefined;

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Trader Badge</h3>
        {badge?.tokenId && (
          <span className="text-xs text-gray-500">#{badge.tokenId}</span>
        )}
      </div>

      {/* Current tier */}
      <div className="flex items-center gap-3">
        <span className="text-4xl">{meta.emoji}</span>
        <div>
          <p className={`text-lg font-bold ${meta.color}`}>{meta.label}</p>
          <p className="text-xs text-gray-400">
            {meta.discountPct > 0
              ? `${meta.discountPct}% fee discount`
              : "Stake GST to earn a badge"}
          </p>
        </div>
      </div>

      {/* Progress to next tier */}
      {nextTier && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Next: {TIER_META[nextTier].label}</span>
            <span>Stake ≥ {TIER_THRESHOLDS[nextTier].toLocaleString()} GST</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-500"
              style={{ width: tier === "NONE" ? "0%" : "60%" }}
            />
          </div>
        </div>
      )}

      {tier === "DIAMOND" && (
        <p className="text-xs text-cyan-400 font-medium">✦ Maximum tier achieved</p>
      )}
    </div>
  );
}
