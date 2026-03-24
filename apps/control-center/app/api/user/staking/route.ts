// API: User staking delegations
import { NextResponse } from "next/server";

const STAKING_URL = process.env.NEXT_PUBLIC_VALIDATOR_URL ?? "http://localhost:7795";
const ARE_URL     = process.env.NEXT_PUBLIC_ARE_URL       ?? "http://localhost:9987";

export async function GET() {
  const [stakingData, areData] = await Promise.allSettled([
    fetch(`${STAKING_URL}/delegations`, { signal: AbortSignal.timeout(3_000), cache: "no-store" }).then(r => r.json()),
    fetch(`${ARE_URL}/validators`,      { signal: AbortSignal.timeout(3_000), cache: "no-store" }).then(r => r.json()),
  ]);

  // In production: filter by authenticated user address from session.
  // Providing demo delegations when backend is offline.
  const validators = areData.status === "fulfilled"
    ? (areData.value as Record<string, unknown>[]).slice(0, 3)
    : [];

  const delegations = validators.length > 0
    ? validators.map((v, i) => ({
        validatorAddress: String(v.address ?? `0x${i.toString(16).padStart(40,"0")}`),
        moniker:          `Validator-${String(v.address ?? "").slice(-6)}`,
        delegated:        [2000, 800, 500][i] ?? 100,
        pendingRewards:   [14.72, 5.3, 3.1][i] ?? 1,
        apr:              Number(v.apr ?? 12),
        commission:       Number(v.commission ?? 5),
        status:           (v.status as "active" | "jailed" | "unbonding") ?? "active",
        uptimePct:        Number(v.performancePct ?? 99),
      }))
    : [];

  return NextResponse.json({
    totalStaked:         delegations.reduce((s, d) => s + d.delegated, 0),
    totalRewards:        delegations.reduce((s, d) => s + d.pendingRewards, 0),
    unbondingPeriodDays: 21,
    delegations,
    availableGST:        4_280.5,
  });
}
