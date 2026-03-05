/**
 * Ghost X – Staking & Rewards Page
 * Route: /staking
 */
"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const StakingPanel  = dynamic(() => import("../../components/StakingPanel"),  { ssr: false });
const BadgeDisplay  = dynamic(() => import("../../components/BadgeDisplay"),  { ssr: false });

export default function StakingPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Staking &amp; Rewards</h1>
        <p className="text-sm text-gray-400 mt-1">
          Stake GST to earn a share of Ghost X trading fees and unlock NFT badge tier discounts.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: "🪙", title: "Stake GST",      desc: "Deposit GST tokens with optional lock periods for bonus multipliers." },
          { icon: "💎", title: "Earn Badges",    desc: "Hit staking thresholds to receive soulbound NFT badges (Bronze → Diamond)." },
          { icon: "💸", title: "Fee Discounts",  desc: "Badge holders get 10–50% off trading fees on every order." },
        ].map((c) => (
          <div key={c.title} className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="text-2xl mb-2">{c.icon}</div>
            <p className="text-sm font-semibold text-white">{c.title}</p>
            <p className="text-xs text-gray-400 mt-1">{c.desc}</p>
          </div>
        ))}
      </div>

      {/* Tier table */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs">
              <th className="text-left px-4 py-3">Tier</th>
              <th className="text-right px-4 py-3">Min Stake</th>
              <th className="text-right px-4 py-3">Fee Discount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {[
              { emoji: "🥉", name: "Bronze",  stake: "100",    discount: "10%" },
              { emoji: "🥈", name: "Silver",  stake: "1,000",  discount: "20%" },
              { emoji: "🥇", name: "Gold",    stake: "10,000", discount: "35%" },
              { emoji: "💎", name: "Diamond", stake: "50,000", discount: "50%" },
            ].map((t) => (
              <tr key={t.name} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 font-medium text-white">{t.emoji} {t.name}</td>
                <td className="px-4 py-3 text-right text-gray-300 font-mono">{t.stake} GST</td>
                <td className="px-4 py-3 text-right text-violet-400 font-semibold">{t.discount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lock period multipliers */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Reward Multipliers
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-800">
          {[
            { label: "Flexible", mult: "1×",    sub: "Unstake anytime" },
            { label: "30 Days",  mult: "1.25×", sub: "30-day lock"     },
            { label: "90 Days",  mult: "1.75×", sub: "90-day lock"     },
            { label: "180 Days", mult: "2.5×",  sub: "180-day lock"    },
          ].map((m) => (
            <div key={m.label} className="px-4 py-3 text-center">
              <p className="text-lg font-bold text-violet-400">{m.mult}</p>
              <p className="text-xs font-medium text-white mt-0.5">{m.label}</p>
              <p className="text-xs text-gray-500">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive panels */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
        <Suspense fallback={<Skeleton />}>
          <StakingPanel />
        </Suspense>
        <Suspense fallback={<Skeleton />}>
          <BadgeDisplay />
        </Suspense>
      </div>
    </div>
  );
}

function Skeleton() {
  return <div className="rounded-xl bg-gray-900 animate-pulse h-48" />;
}
