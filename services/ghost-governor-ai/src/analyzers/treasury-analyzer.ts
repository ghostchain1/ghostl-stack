/**
 * Treasury Analyzer
 *
 * Fetches the GhostChain L1 treasury balance via JSON-RPC and estimates
 * rolling revenue and burn from environment configuration.
 */
import type { TreasuryState } from "../types.js";
import { ECONOMIC_POLICY } from "../policies/economic-policy.js";

const L1_RPC              = process.env.GHOSTCHAIN_L1_RPC      ?? "http://127.0.0.1:18545";
const TREASURY_ADDRESS    = process.env.GHOST_TREASURY_ADDRESS ?? "0x0000000000000000000000000000000000000000";
// Monthly revenue and burn can be seeded from env for initial bootstrapping
// until an on-chain revenue oracle is available.
const MONTHLY_REVENUE_WEI = BigInt(process.env.TREASURY_MONTHLY_REVENUE_WEI ?? "0");
const MONTHLY_BURN_WEI    = BigInt(process.env.TREASURY_MONTHLY_BURN_WEI    ?? "0");

async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const resp = await fetch(L1_RPC, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal:  AbortSignal.timeout(5_000),
  });
  const json = await resp.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

export async function analyzeTreasury(): Promise<TreasuryState> {
  let balanceL1 = 0n;

  try {
    const raw = await rpcCall("ghost_getBalance", [TREASURY_ADDRESS, "latest"]);
    balanceL1  = BigInt(raw as string);
  } catch {
    // L1 unreachable — proceed with zero balance; governor skips invest/buyback signals
  }

  const nextBuybackThreshold =
    MONTHLY_REVENUE_WEI > 0n ? MONTHLY_REVENUE_WEI / 4n : ECONOMIC_POLICY.TREASURY_MIN_BALANCE / 4n;

  const buybackPending = balanceL1 > 0n && balanceL1 < ECONOMIC_POLICY.TREASURY_MIN_BALANCE;

  return {
    balanceL1,
    monthlyRevenue:        MONTHLY_REVENUE_WEI,
    monthlyBurn:           MONTHLY_BURN_WEI,
    buybackPending,
    nextBuybackThreshold,
  };
}
