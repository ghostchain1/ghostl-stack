"use client";

import { useState, useEffect, FormEvent } from "react";
import {
  MaxUint256,
  createGhostXBrowserProvider,
  createGhostXContract,
  parseGhostXUnits,
  type ContractTransactionResponse,
  type Signer,
} from "@ghostchain/ghostx-sdk";
import { useWallet } from "../context/WalletContext";

// ─── Lock period options ────────────────────────────────────────────────────

type LockPeriod = "FLEXIBLE" | "LOCKED_30" | "LOCKED_90" | "LOCKED_180";

const LOCK_OPTIONS: { value: LockPeriod; label: string; multiplier: string }[] = [
  { value: "FLEXIBLE",   label: "Flexible",  multiplier: "1×"    },
  { value: "LOCKED_30",  label: "30 days",   multiplier: "1.25×" },
  { value: "LOCKED_90",  label: "90 days",   multiplier: "1.75×" },
  { value: "LOCKED_180", label: "180 days",  multiplier: "2.5×"  },
];

const LOCK_PERIOD_IDX: Record<LockPeriod, number> = {
  FLEXIBLE: 0, LOCKED_30: 1, LOCKED_90: 2, LOCKED_180: 3,
};

// ─── Minimal staking ABI ────────────────────────────────────────────────────

const STAKING_ABI = [
  "function stake(uint256 amount, uint8 lockPeriod) external",
  "function unstake() external",
  "function unstakePartial(uint256 amount) external",
  "function harvest() external",
  "function pendingRewards(address user) view returns (uint256)",
  "function stakes(address user) view returns (uint256 amount, uint256 weightedAmount, uint256 rewardDebt, uint256 unlocksAt, uint8 lockPeriod, uint256 pendingRewards)",
  "function totalStake() view returns (uint256)",
  "function totalWeightedStake() view returns (uint256)",
];

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(wei: bigint, decimals = 2): string {
  const e = Number(wei) / 1e18;
  return e.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function dateStr(ts: bigint): string {
  if (ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toLocaleDateString();
}

// ─── Component ──────────────────────────────────────────────────────────────

interface StakeInfo {
  amount:         bigint;
  weightedAmount: bigint;
  unlocksAt:      bigint;
  lockPeriod:     number;
  pendingRewards: bigint;
}

export default function StakingPanel() {
  const { address, isConnected, isCorrectChain, provider } = useWallet();

  const STAKING_ADDR   = process.env.NEXT_PUBLIC_GHOSTX_STAKING  ?? "";
  const STAKE_TOKEN    = process.env.NEXT_PUBLIC_GHOSTX_STAKE_TOKEN ?? "";

  const [stakeInfo,   setStakeInfo]   = useState<StakeInfo | null>(null);
  const [pending,     setPending]     = useState<bigint>(0n);
  const [walletBal,   setWalletBal]   = useState<bigint>(0n);
  const [amountStr,   setAmountStr]   = useState("");
  const [lockPeriod,  setLockPeriod]  = useState<LockPeriod>("FLEXIBLE");
  const [loading,     setLoading]     = useState(false);
  const [txStatus,    setTxStatus]    = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  // ── Load on-chain state ─────────────────────────────────────────────────

  async function loadState() {
    if (!address || !provider || !STAKING_ADDR || !STAKE_TOKEN) return;
    const web3 = createGhostXBrowserProvider(provider);
    const staking  = createGhostXContract(STAKING_ADDR, STAKING_ABI, web3);
    const token    = createGhostXContract(STAKE_TOKEN,  ERC20_ABI,   web3);

    const [raw, pend, bal] = await Promise.all([
      staking.stakes(address) as Promise<[bigint,bigint,bigint,bigint,number,bigint]>,
      staking.pendingRewards(address) as Promise<bigint>,
      token.balanceOf(address) as Promise<bigint>,
    ]);

    setStakeInfo({ amount: raw[0], weightedAmount: raw[1], unlocksAt: raw[3], lockPeriod: raw[4], pendingRewards: raw[5] });
    setPending(pend);
    setWalletBal(bal);
  }

  useEffect(() => {
    if (isConnected && isCorrectChain) loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected, isCorrectChain]);

  // ── Tx wrappers ─────────────────────────────────────────────────────────

  async function withTx(label: string, fn: (signer: Signer) => Promise<ContractTransactionResponse>) {
    setError(null);
    setTxStatus(null);
    setLoading(true);
    try {
      if (!provider) {
        throw new Error("GhostWallet not connected");
      }
      const web3   = createGhostXBrowserProvider(provider);
      const signer = await web3.getSigner();
      setTxStatus(`${label}: waiting for signature…`);
      const tx = await fn(signer);
      setTxStatus(`${label}: confirming…`);
      await tx.wait();
      setTxStatus(`${label}: done ✓`);
      await loadState();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Transaction failed");
      setTxStatus(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleStake(e: FormEvent) {
    e.preventDefault();
    if (!amountStr || !STAKING_ADDR || !STAKE_TOKEN) return;

    await withTx("Stake", async (signer) => {
      const amount = parseGhostXUnits(amountStr, 18);
      const token   = createGhostXContract(STAKE_TOKEN,  ERC20_ABI,   signer);
      const staking = createGhostXContract(STAKING_ADDR, STAKING_ABI, signer);

      // Approve if needed
      const allowance = await token.allowance(await signer.getAddress(), STAKING_ADDR) as bigint;
      if (allowance < amount) {
        const approveTx = await token.approve(STAKING_ADDR, MaxUint256) as ContractTransactionResponse;
        await approveTx.wait();
      }

      return staking.stake(amount, LOCK_PERIOD_IDX[lockPeriod]) as Promise<ContractTransactionResponse>;
    });
    setAmountStr("");
  }

  async function handleUnstake() {
    await withTx("Unstake", (signer) =>
      createGhostXContract(STAKING_ADDR, STAKING_ABI, signer).unstake() as Promise<ContractTransactionResponse>
    );
  }

  async function handleHarvest() {
    await withTx("Harvest", (signer) =>
      createGhostXContract(STAKING_ADDR, STAKING_ABI, signer).harvest() as Promise<ContractTransactionResponse>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 text-center text-sm text-gray-400">
        Connect Ghost Wallet to stake
      </div>
    );
  }

  if (!STAKING_ADDR || !STAKE_TOKEN) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 text-center text-sm text-gray-400">
        Staking contract not configured — set <code>NEXT_PUBLIC_GHOSTX_STAKING</code> and <code>NEXT_PUBLIC_GHOSTX_STAKE_TOKEN</code>.
      </div>
    );
  }

  const isLocked = stakeInfo && stakeInfo.unlocksAt > 0n && stakeInfo.unlocksAt > BigInt(Math.floor(Date.now() / 1000));

  return (
    <div className="space-y-4">
      {/* ── Current position ─────────────────────────────────────────── */}
      {stakeInfo && stakeInfo.amount > 0n && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Your Position</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Staked"   value={`${fmt(stakeInfo.amount)} GST`} />
            <Stat label="Weighted" value={`${fmt(stakeInfo.weightedAmount)} GST`} />
            <Stat label="Pending Rewards" value={`${fmt(pending)} GST`} />
            <Stat label="Unlocks" value={dateStr(stakeInfo.unlocksAt)} />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleHarvest}
              disabled={loading || pending === 0n}
              className="flex-1 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 px-3 py-2 text-sm font-medium text-white transition-colors"
            >
              Harvest {pending > 0n ? `(${fmt(pending, 4)} GST)` : ""}
            </button>
            <button
              onClick={handleUnstake}
              disabled={loading || !!isLocked}
              title={isLocked ? `Locked until ${dateStr(stakeInfo.unlocksAt)}` : "Unstake all"}
              className="flex-1 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 px-3 py-2 text-sm font-medium text-white transition-colors"
            >
              {isLocked ? `🔒 Locked` : "Unstake All"}
            </button>
          </div>
        </div>
      )}

      {/* ── Stake form ───────────────────────────────────────────────── */}
      <form onSubmit={handleStake} className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Stake GST</h3>

        {/* Wallet balance */}
        <p className="text-xs text-gray-500">
          Wallet balance: <span className="text-gray-300">{fmt(walletBal)} GST</span>
        </p>

        {/* Amount */}
        <div className="relative">
          <input
            type="number"
            min="0"
            step="any"
            placeholder="Amount"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <button
            type="button"
            onClick={() => setAmountStr(fmt(walletBal, 6).replace(/,/g, ""))}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-violet-400 hover:text-violet-300"
          >
            MAX
          </button>
        </div>

        {/* Lock period */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {LOCK_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setLockPeriod(opt.value)}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                lockPeriod === opt.value
                  ? "border-violet-500 bg-violet-900/50 text-violet-300"
                  : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500"
              }`}
            >
              <div>{opt.label}</div>
              <div className="text-violet-400">{opt.multiplier}</div>
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={loading || !amountStr}
          className="w-full rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          {loading ? "Processing…" : "Stake GST"}
        </button>
      </form>

      {/* Status / error */}
      {txStatus && <p className="text-xs text-violet-400">{txStatus}</p>}
      {error    && <p className="text-xs text-red-400 break-words">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}
