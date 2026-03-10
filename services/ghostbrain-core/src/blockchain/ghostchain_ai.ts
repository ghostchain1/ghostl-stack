/**
 * GhostBrain — GhostChain Blockchain Intelligence Engine
 *
 * Monitors L1 / L2 / L3 RPC health, classifies transactions,
 * tracks block production, and feeds intelligence into the
 * memory / event system for pattern analysis and anomaly detection.
 *
 * Chain IDs:  L1 = 14000101 (port 18545)
 *             L2 = 901      (port 29545)
 *             L3 = 903      (port 39545)
 */

import { GhostJsonRpc }    from "@ghostchain/ghost-sdk-core";
import { store_event } from "../memory_engine.js";
import { log }         from "../observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const L1_RPC = process.env.L1_RPC_URL ?? "http://localhost:18545";
const L2_RPC = process.env.L2_RPC_URL ?? "http://localhost:29545";
const L3_RPC = process.env.L3_RPC_URL ?? "http://localhost:39545";

const SAMPLE_INTERVAL_MS  = Number(process.env.CHAIN_SAMPLE_INTERVAL_MS  ?? "15000");
const GAS_SPIKE_THRESHOLD = Number(process.env.CHAIN_GAS_SPIKE_THRESHOLD  ?? "2.0"); // multiplier vs baseline

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChainLayer = "l1" | "l2" | "l3";

export interface ChainStatus {
  layer:        ChainLayer;
  chainId:      number;
  rpcUrl:       string;
  blockNumber:  number;
  gasPrice:     bigint;
  peersOnline:  boolean;
  latencyMs:    number;
  healthy:      boolean;
  sampledAt:    number;
}

export interface TxClassification {
  hash:      string;
  layer:     ChainLayer;
  kind:      "transfer" | "contract_call" | "bridge" | "governance" | "unknown";
  gasUsed:   number;
  riskScore: number;
}

// ── Internal state ─────────────────────────────────────────────────────────────

const _chainStatus = new Map<ChainLayer, ChainStatus>();
const _gasBaseline = new Map<ChainLayer, bigint>(); // rolling baseline gas price
let   _sampleCount = 0;
let   _timer: ReturnType<typeof setInterval> | null = null;

// ── RPC helpers ───────────────────────────────────────────────────────────────

const _rpcClients = new Map<string, GhostJsonRpc>();

function rpcClientFor(url: string): GhostJsonRpc {
  let c = _rpcClients.get(url);
  if (!c) { c = new GhostJsonRpc(url, { timeoutMs: 8_000 }); _rpcClients.set(url, c); }
  return c;
}

async function rpcCall<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  return rpcClientFor(url).request<T>(method, params);
}

// ── Sampling ──────────────────────────────────────────────────────────────────

async function sampleChain(layer: ChainLayer, rpcUrl: string, chainId: number): Promise<void> {
  const t0 = Date.now();
  try {
    const [blockHex, gasPriceHex] = await Promise.all([
      rpcCall<string>(rpcUrl, "ghost_blockNumber"),
      rpcCall<string>(rpcUrl, "ghost_gasPrice"),
    ]);
    const latencyMs   = Date.now() - t0;
    const blockNumber = parseInt(blockHex, 16);
    const gasPrice    = BigInt(gasPriceHex);

    // Update gas baseline (exponential moving average)
    const prev = _gasBaseline.get(layer) ?? gasPrice;
    const ema  = (prev * 7n + gasPrice) / 8n;
    _gasBaseline.set(layer, ema);

    const status: ChainStatus = {
      layer, chainId, rpcUrl, blockNumber, gasPrice,
      peersOnline: true, latencyMs, healthy: true,
      sampledAt: Date.now(),
    };
    _chainStatus.set(layer, status);

    // Alert: gas spike
    if (gasPrice > ema * BigInt(Math.round(GAS_SPIKE_THRESHOLD * 100)) / 100n) {
      store_event({
        resourceId: layer,
        layer:      "chain" as const,
        category:   "economics",
        label:      "gas_spike",
        severity:   "warning",
        payload:    { gasPrice: gasPrice.toString(), baseline: ema.toString(), layer },
      });
    }

    // Alert: slow block time (latency > 5s implies RPC stall)
    if (latencyMs > 5000) {
      store_event({
        resourceId: layer,
        layer:      "chain" as const,
        category:   "performance",
        label:      "rpc_slow",
        severity:   "warning",
        payload:    { latencyMs, layer },
      });
    }

    log.debug("ghostchain_ai: sampled", `${layer} block=${blockNumber} gasPrice=${gasPrice} latency=${latencyMs}ms`);
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const prev = _chainStatus.get(layer);
    _chainStatus.set(layer, {
      layer, chainId, rpcUrl,
      blockNumber:  prev?.blockNumber  ?? 0,
      gasPrice:     prev?.gasPrice     ?? 0n,
      peersOnline:  false,
      latencyMs,
      healthy:      false,
      sampledAt:    Date.now(),
    });

    store_event({
      resourceId: layer,
      layer:      "chain" as const,
      category:   "health",
      label:      "chain_unreachable",
      severity:   "warning",
      payload:    { error: String(err), layer },
    });

    log.warn("ghostchain_ai: rpc_error", `${layer} — ${String(err)}`);
  }
}

async function sampleAll(): Promise<void> {
  _sampleCount++;
  await Promise.allSettled([
    sampleChain("l1", L1_RPC, 14000101),
    sampleChain("l2", L2_RPC, 901),
    sampleChain("l3", L3_RPC, 903),
  ]);
}

// ── Transaction classification ────────────────────────────────────────────────

/** Classify a raw transaction by its `to` / `input` fields. */
export function classifyTransaction(
  hash:  string,
  layer: ChainLayer,
  tx: { input?: string; to?: string | null; gasUsed?: number },
): TxClassification {
  const input   = tx.input ?? "0x";
  const gasUsed = tx.gasUsed ?? 0;

  let kind: TxClassification["kind"] = "unknown";
  let riskScore = 0.0;

  if (!tx.to) {
    kind      = "contract_call";
    riskScore = 0.3;  // contract deployment — moderate risk
  } else if (input === "0x" || input === "") {
    kind      = "transfer";
    riskScore = 0.1;
  } else if (input.startsWith("0x")) {
    const selector = input.slice(0, 10).toLowerCase();
    // Bridge selectors (L2L3Bridge, L1 Rollup, L2 Rollup canonical addresses)
    if (["0xa9059cbb", "0x23b872dd"].includes(selector)) {
      kind      = "transfer";
      riskScore = 0.15;
    } else if (selector === "0x3687011a" || selector === "0x9ff0c4e5") {
      // depositTransaction / finalizeWithdrawalTransaction (OP Stack)
      kind      = "bridge";
      riskScore = 0.25;
    } else if (selector === "0x56781388") {
      // castVote (OpenZeppelin Governor) or GhostChainGovernor
      kind      = "governance";
      riskScore = 0.05;
    } else {
      kind      = "contract_call";
      riskScore = 0.2;
    }
  }

  return { hash, layer, kind, gasUsed, riskScore };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getChainStatus(layer?: ChainLayer): ChainStatus[] {
  if (layer) {
    const s = _chainStatus.get(layer);
    return s ? [s] : [];
  }
  return [..._chainStatus.values()];
}

export function getChainHealth(): Record<ChainLayer, boolean> {
  return {
    l1: _chainStatus.get("l1")?.healthy ?? false,
    l2: _chainStatus.get("l2")?.healthy ?? false,
    l3: _chainStatus.get("l3")?.healthy ?? false,
  };
}

export function getBlockchainAIStats() {
  return {
    sampleCount:  _sampleCount,
    intervalMs:   SAMPLE_INTERVAL_MS,
    chains:       getChainStatus(),
    health:       getChainHealth(),
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startBlockchainAI(): void {
  if (_timer) return;
  void sampleAll();
  _timer = setInterval(() => void sampleAll(), SAMPLE_INTERVAL_MS);
  log.info("ghostchain_ai: started", `intervalMs=${SAMPLE_INTERVAL_MS} L1=${L1_RPC} L2=${L2_RPC} L3=${L3_RPC}`);
}

export function stopBlockchainAI(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
  log.info("ghostchain_ai: stopped", "blockchain AI monitor halted");
}
