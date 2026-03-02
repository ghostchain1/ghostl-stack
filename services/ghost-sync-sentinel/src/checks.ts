import { jsonRpc, hexToNumber } from "./rpc.js";

/**
 * OP Stack sync status response shape.
 * op-node exposes this via `optimism_syncStatus` (port 9546 / 19546).
 * Field names are stable across recent op-node versions.
 */
type OpSyncStatus = {
  current_l1?: { number: number; hash: string; timestamp: number };
  head_l1?: { number: number; hash: string; timestamp: number };
  unsafe_l2?: { number: number; hash: string; timestamp: number; l1origin?: unknown };
  safe_l2?: { number: number; hash: string; timestamp: number; l1origin?: unknown };
  finalized_l2?: { number: number; hash: string; timestamp: number; l1origin?: unknown };
  // Tolerate older field names
  [k: string]: unknown;
};

export type LayerSample = {
  name: "L1" | "L2" | "L3";
  now: number;
  headBlock?: number;
  headTime?: number;
  safeBlock?: number;
  safeTime?: number;
  finalizedBlock?: number;
  finalizedTime?: number;
  syncing?: boolean;
  peerCount?: number;
  errors: string[];
};

// ─── L1 check ────────────────────────────────────────────────────────────────

export async function checkL1(url: string): Promise<LayerSample> {
  const now = Math.floor(Date.now() / 1000);
  const errors: string[] = [];

  let syncing = false;
  let headBlock: number | undefined;
  let peerCount: number | undefined;

  try {
    const s = await jsonRpc<boolean | object>(url, "eth_syncing");
    syncing = s !== false;
  } catch (e: unknown) {
    errors.push(`eth_syncing: ${(e as Error).message}`);
  }

  try {
    const b = await jsonRpc<string>(url, "eth_blockNumber");
    headBlock = hexToNumber(b);
  } catch (e: unknown) {
    errors.push(`eth_blockNumber: ${(e as Error).message}`);
  }

  try {
    const p = await jsonRpc<string>(url, "net_peerCount");
    peerCount = hexToNumber(p);
  } catch (e: unknown) {
    errors.push(`net_peerCount: ${(e as Error).message}`);
  }

  return { name: "L1", now, headBlock, syncing, peerCount, errors };
}

// ─── Rollup (L2 / L3) check ──────────────────────────────────────────────────

function pickTs(x: unknown): number | undefined {
  if (!x || typeof x !== "object") return undefined;
  const obj = x as Record<string, unknown>;
  if (typeof obj["timestamp"] === "number") return obj["timestamp"];
  if (typeof obj["time"] === "number") return obj["time"];
  return undefined;
}

function pickNum(x: unknown): number | undefined {
  if (!x || typeof x !== "object") return undefined;
  const obj = x as Record<string, unknown>;
  if (typeof obj["number"] === "number") return obj["number"];
  if (typeof obj["num"] === "number") return obj["num"];
  return undefined;
}

/**
 * Check an OP Stack rollup node.
 * Primary method: `optimism_syncStatus` (used by op-node ≥ v1.x).
 * Fallback method: `rollup_syncStatus` (older op-node builds).
 *
 * @param name  "L2" or "L3"
 * @param url   op-node RPC URL (e.g. http://op-node:9546 or http://l3-op-node:19546)
 */
export async function checkRollup(name: "L2" | "L3", url: string): Promise<LayerSample> {
  const now = Math.floor(Date.now() / 1000);
  const errors: string[] = [];

  let headBlock: number | undefined;
  let headTime: number | undefined;
  let safeBlock: number | undefined;
  let safeTime: number | undefined;
  let finalizedBlock: number | undefined;
  let finalizedTime: number | undefined;

  // Try optimism_syncStatus first (canonical for this stack), then rollup_syncStatus as fallback.
  let st: OpSyncStatus | null = null;
  let methodUsed = "";

  for (const method of ["optimism_syncStatus", "rollup_syncStatus"]) {
    try {
      st = await jsonRpc<OpSyncStatus>(url, method);
      methodUsed = method;
      break;
    } catch (e: unknown) {
      errors.push(`${method}: ${(e as Error).message}`);
    }
  }

  if (st) {
    // Resolve head (unsafe) block
    const headSrc = st["unsafe_l2"] ?? st["head_l2"] ?? st["unsafe"] ?? st["head"];
    headBlock = pickNum(headSrc);
    headTime = pickTs(headSrc);

    // Resolve safe block
    const safeSrc = st["safe_l2"] ?? st["safe"];
    safeBlock = pickNum(safeSrc);
    safeTime = pickTs(safeSrc);

    // Resolve finalized block
    const finalSrc = st["finalized_l2"] ?? st["finalized"];
    finalizedBlock = pickNum(finalSrc);
    finalizedTime = pickTs(finalSrc);

    // Clear errors for the method that succeeded
    const successIdx = errors.findIndex((e) => e.startsWith(methodUsed));
    if (successIdx !== -1) errors.splice(successIdx, 1);
  }

  return {
    name,
    now,
    headBlock,
    headTime,
    safeBlock,
    safeTime,
    finalizedBlock,
    finalizedTime,
    errors
  };
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

export type SentinelResult = {
  ok: boolean;
  routingLawOk: boolean;
  reasons: string[];
  l1: LayerSample;
  l2: LayerSample;
  l3: LayerSample;
  checkedAt: number;
};

export function evaluate(
  l1: LayerSample,
  l2: LayerSample,
  l3: LayerSample,
  thresholds: {
    maxHeadLagSec: number;
    maxSafeLagSec: number;
    enforceRoutingLaw: boolean;
    l1HostnameHint?: string;
    l2RpcUrl?: string;
    l3RpcUrl?: string;
  }
): SentinelResult {
  const reasons: string[] = [];

  function headLag(sample: LayerSample): number | undefined {
    if (typeof sample.headTime !== "number") return undefined;
    return sample.now - sample.headTime;
  }

  function safeLag(sample: LayerSample): number | undefined {
    if (typeof sample.safeTime !== "number") return undefined;
    return sample.now - sample.safeTime;
  }

  // ── L1 checks ──
  if (l1.syncing) {
    reasons.push("L1 is syncing (eth_syncing != false)");
  }
  if (typeof l1.headBlock === "undefined" && l1.errors.length > 0) {
    reasons.push(`L1 unreachable: ${l1.errors.join("; ")}`);
  }

  // ── L2 checks ──
  const l2HeadLag = headLag(l2);
  const l2SafeLag = safeLag(l2);

  if (typeof l2HeadLag === "number" && l2HeadLag > thresholds.maxHeadLagSec) {
    reasons.push(`L2 head stale: ${l2HeadLag}s (max ${thresholds.maxHeadLagSec}s)`);
  }
  if (typeof l2SafeLag === "number" && l2SafeLag > thresholds.maxSafeLagSec) {
    reasons.push(`L2 safe stale: ${l2SafeLag}s (max ${thresholds.maxSafeLagSec}s)`);
  }
  if (typeof l2.safeBlock === "number" && typeof l2.headBlock === "number" && l2.safeBlock > l2.headBlock) {
    reasons.push("L2 safeBlock > headBlock (invalid state)");
  }
  if (l2.errors.length > 0 && typeof l2.headTime === "undefined") {
    reasons.push(`L2 unreachable: ${l2.errors.join("; ")}`);
  }

  // ── L3 checks ──
  const l3HeadLag = headLag(l3);
  const l3SafeLag = safeLag(l3);

  if (typeof l3HeadLag === "number" && l3HeadLag > thresholds.maxHeadLagSec) {
    reasons.push(`L3 head stale: ${l3HeadLag}s (max ${thresholds.maxHeadLagSec}s)`);
  }
  if (typeof l3SafeLag === "number" && l3SafeLag > thresholds.maxSafeLagSec) {
    reasons.push(`L3 safe stale: ${l3SafeLag}s (max ${thresholds.maxSafeLagSec}s)`);
  }
  if (typeof l3.safeBlock === "number" && typeof l3.headBlock === "number" && l3.safeBlock > l3.headBlock) {
    reasons.push("L3 safeBlock > headBlock (invalid state)");
  }
  if (l3.errors.length > 0 && typeof l3.headTime === "undefined") {
    reasons.push(`L3 unreachable: ${l3.errors.join("; ")}`);
  }

  // ── Routing law enforcement ──
  // GhostL3 must ONLY talk to GhostL2; GhostL2 must ONLY talk to GhostChain (L1).
  // Configuration invariant: L3_RPC_URL must NOT reference the L1 hostname.
  // Network-level enforcement is done by Docker network isolation.
  let routingLawOk = true;

  if (thresholds.enforceRoutingLaw && thresholds.l1HostnameHint) {
    const hint = thresholds.l1HostnameHint.toLowerCase();
    const l3Url = (thresholds.l3RpcUrl ?? "").toLowerCase();
    const l2Url = (thresholds.l2RpcUrl ?? "").toLowerCase();

    // L3 RPC URL must not reference L1 hostname
    if (hint && l3Url.includes(hint)) {
      routingLawOk = false;
      reasons.push(
        `ROUTING LAW VIOLATION: L3_RPC_URL contains L1 hostname hint "${thresholds.l1HostnameHint}". ` +
          "L3 must only communicate with L2."
      );
    }

    // L2 RPC URL must not reference L1 hostname (sanity check)
    if (hint && l2Url.includes(hint)) {
      // L2 op-node talks to L1 by design (it derives from L1), so this is expected.
      // We only flag if L2's *execution* RPC is the L1 endpoint.
      // This is a soft warning, not a hard violation.
    }
  }

  const ok = reasons.length === 0 && routingLawOk;

  return {
    ok,
    routingLawOk,
    reasons,
    l1,
    l2,
    l3,
    checkedAt: Math.floor(Date.now() / 1000)
  };
}
