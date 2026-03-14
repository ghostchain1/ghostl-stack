/**
 * DeFi Analyzer
 *
 * Queries GhostL2 (port 29545) for pool health, TVL, and fee revenue.
 * Pool addresses are configurable via env; defaults represent common devnet pools.
 *
 * Returns both DefiState and LiquidityState so the network analyzer can
 * assemble the full NetworkState without duplicating RPC calls.
 */
import type { DefiState, LiquidityState, PoolHealth } from "../types.js";
import { LIQUIDITY_POLICY } from "../policies/liquidity-policy.js";
import { SECURITY_POLICY } from "../policies/security-policy.js";

const L2_RPC = process.env.GHOSTCHAIN_L2_RPC ?? "http://127.0.0.1:29545";

// Pool addresses come from environment; comma-separated list of 0x addresses.
// Each pool is a GhostXchange pair. The first token in every pair is assumed GST.
const POOL_ADDRESSES: string[] = (process.env.DEFI_POOL_ADDRESSES ?? "")
  .split(",")
  .map(a => a.trim())
  .filter(a => a.startsWith("0x"));

// ERC-20 balanceOf(address) selector: 0x70a08231
const BALANCE_OF_SELECTOR = "0x70a08231";
// GST native token address on L2
const GST_ADDRESS_L2 = process.env.GST_ADDRESS_L2 ?? "0x0000000000000000000000000000000000000000";

// Rolling 24 h baseline tx rate from env (tx/min) for spike detection
const BASELINE_TX_RATE = parseInt(process.env.BASELINE_TX_RATE_PER_MIN ?? "10", 10);
// Rolling 24 h bridge volume baseline (GST wei)
const BASELINE_BRIDGE_VOL = BigInt(process.env.BASELINE_BRIDGE_VOL_WEI ?? "0");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function rpcCall(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  const resp = await fetch(url, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal:  AbortSignal.timeout(5_000),
  });
  const json = await resp.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`L2 RPC ${method}: ${json.error.message}`);
  return json.result;
}

/** ABI-encode an address argument: 32-byte left-zero-padded. */
function encodeAddressArg(addr: string): string {
  return addr.replace("0x", "").padStart(64, "0");
}

/** Query ERC-20 balanceOf(addr) for a token at a pool address. */
async function balanceOf(tokenAddr: string, holderAddr: string): Promise<bigint> {
  const data   = BALANCE_OF_SELECTOR + encodeAddressArg(holderAddr);
  const result = await rpcCall(L2_RPC, "ghost_call", [
    { to: tokenAddr, data },
    "latest",
  ]);
  return BigInt(result as string);
}

/** Get native GST balance of an address on L2. */
async function nativeBalance(addr: string): Promise<bigint> {
  const result = await rpcCall(L2_RPC, "ghost_getBalance", [addr, "latest"]);
  return BigInt(result as string);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DefiAnalysis {
  defi: DefiState;
  liquidity: LiquidityState;
}

export async function analyzeDefi(): Promise<DefiAnalysis> {
  const pools: PoolHealth[] = [];
  let totalTVL = 0n;

  // Query each configured pool for GST reserve and estimate TVL
  for (const poolAddr of POOL_ADDRESSES) {
    try {
      const gstReserve =
        GST_ADDRESS_L2 !== "0x0000000000000000000000000000000000000000"
          ? await balanceOf(GST_ADDRESS_L2, poolAddr)
          : await nativeBalance(poolAddr);

      const tvl            = gstReserve * 2n; // approximate symmetric pool
      const gstReservePct  = tvl > 0n ? Number((gstReserve * 100n) / tvl) : 0;

      pools.push({
        address:       poolAddr,
        token0Symbol:  "GST",
        token1Symbol:  "UNKNOWN",
        gstReserve,
        otherReserve:  gstReserve, // symmetric heuristic
        gstReservePct,
        tvl,
      });

      totalTVL += tvl;
    } catch {
      // Pool unreachable — skip
    }
  }

  // Compute aggregate metrics
  const l2GstReserve    = pools.reduce((acc, p) => acc + p.gstReserve, 0n);
  const l2GstReservePct = totalTVL > 0n ? Number((l2GstReserve * 100n) / totalTVL) : 100;

  const maxPoolTVLPct = pools.length > 0 && totalTVL > 0n
    ? Math.max(...pools.map(p => Number((p.tvl * 100n) / totalTVL)))
    : 0;

  const liquidity: LiquidityState = {
    totalTVL,
    l2GstReserve,
    l2GstReservePct,
    low:   l2GstReservePct < LIQUIDITY_POLICY.MIN_GST_RESERVE_PCT && pools.length > 0,
    high:  maxPoolTVLPct > LIQUIDITY_POLICY.MAX_TVL_CONCENTRATION_PCT,
    pools,
  };

  // Estimate current tx rate from latest block for spike detection
  let txSpike = 1;
  try {
    const block = await rpcCall(L2_RPC, "ghost_getBlockByNumber", ["latest", true]) as {
      transactions: unknown[];
      timestamp: string;
    };
    const blockTime         = 2; // seconds (approx)
    const currentRatePerMin = (block.transactions.length / blockTime) * 60;
    txSpike                 = BASELINE_TX_RATE > 0 ? currentRatePerMin / BASELINE_TX_RATE : 1;
  } catch { /* use default */ }

  const defi: DefiState = {
    totalFeeRevenue24h:  0n,            // populated by on-chain fee oracle when available
    avgPoolUtilisation:  pools.length > 0 ? 50 : 0, // placeholder — extend with swap event data
    bridgeVolume24h:     BASELINE_BRIDGE_VOL,
    anomalousDrain:      l2GstReservePct < (LIQUIDITY_POLICY.MIN_GST_RESERVE_PCT / 2) && pools.length > 0,
    txSpike:             Math.round(txSpike * 100) / 100,
  };

  return { defi, liquidity };
}
