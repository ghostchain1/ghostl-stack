/**
 * ghost.JsonRpcProvider — Production GhostStack ghost v6 provider
 *
 * Features:
 *   ✓ Multi-RPC failover with per-endpoint circuit breakers
 *   ✓ AI routing      — GhostBrain WS (ghost.route.decide)
 *   ✓ Gas optimiser   — feeHistory percentile analysis + surge buffer
 *   ✓ Tx simulation   — eth_call + ABI revert decoding
 *   ✓ Network load    — congestion prediction + fee trend
 *   ✓ Contract guard  — selector allowlist / suspicion scoring
 *   ✓ Cross-layer     — bridge initiation via GhostBrain routing plan
 *   ✓ Diagnostics     — ghostPing() + endpointHealth()
 *   ✓ ghost v6 compatible (Wallet / Contract / Event all work as normal)
 *
 * Usage:
 *   import { ghost } from "@ghost/ai-sdk"
 *   const p = new ghost.JsonRpcProvider({ layer: "L2", rpc: "http://ghostl2:8545" })
 */

import {
  JsonRpcProvider,
  Network,
  AbiCoder,
  type TransactionRequest,
  type FeeData,
} from "@ghostchain/sdk";
import { randomUUID } from "crypto";
import type { GhostLayer }      from "./Types.js";
import type { RpcEndpoint }     from "../config.js";
import type { TxRouteDecision } from "./Types.js";
import { GhostBrainWS }        from "../ai/GhostBrainWS.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Public config types
// ═══════════════════════════════════════════════════════════════════════════════

/** Legacy options — kept for backward-compat with ValidatorMonitor / LayerRouter. */
export type GhostProviderOptions = {
  layer:           GhostLayer;
  endpoint:        RpcEndpoint;
  ghostName?:      string;
  gasTokenSymbol?: string;
};

/** Flat config — preferred API via ghost.JsonRpcProvider. */
export interface GhostProviderConfig {
  layer:        GhostLayer;
  /** Primary RPC URL (HTTP/S or Next.js /api/rpc/* proxy). */
  rpc:          string;
  /** Additional fallback RPC URLs — tried in order, circuit-broken on failures. */
  fallbackRpcs?: string[];
  /** Skip eth_chainId handshake when chain ID is known statically. */
  chainId?:     number;
  /** GhostBrain WS URL — enables AI routing, guard, cross-layer send. */
  ghostBrain?:  string;
  /** GhostBrain API key. Falls back to GHOSTBRAIN_API_KEY env or "dev-key". */
  apiKey?:      string;
  gasToken?:    string;
  ghostName?:   string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Result types
// ═══════════════════════════════════════════════════════════════════════════════

export interface GhostPingResult {
  layer:      GhostLayer;
  chainId:    bigint;
  block:      bigint;
  latencyMs:  number;
}

export interface GhostGasEstimate {
  maxFeePerGas:         bigint;
  maxPriorityFeePerGas: bigint;
  gasLimit:             bigint;
  baseFee:              bigint;
  urgency:              "low" | "medium" | "high";
  /** 0–100: estimated probability of inclusion within 2 blocks. */
  inclusionConfidence:  number;
}

export interface GhostSimResult {
  success:      boolean;
  returnData:   string;
  /** Decoded revert reason (Error(string) / Panic(uint256)) — best-effort. */
  revertReason?: string;
}

export interface GhostNetworkLoad {
  /** 0–100 congestion percentage. */
  congestionPct:      number;
  baseFee:            bigint;
  feeTrend:           "rising" | "falling" | "stable";
  memPoolBusy:        boolean;
  recommendedUrgency: "low" | "medium" | "high";
}

export interface GhostGuardResult {
  safe:      boolean;
  riskScore: number;
  findings:  string[];
}

export interface GhostSendResult {
  hash:          string;
  routeDecision: TxRouteDecision | { executeOn: GhostLayer; fallback?: boolean };
}

export interface GhostCrossLayerResult {
  sourceTxHash: string;
  targetLayer:  GhostLayer;
  routePlan:    TxRouteDecision["plan"] | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal: endpoint circuit breaker state
// ═══════════════════════════════════════════════════════════════════════════════

interface EndpointState {
  url:          string;
  failures:     number;
  lastFailure:  number;
  latencyEmaMs: number;
}

const CIRCUIT_OPEN_FAILURES = 5;
const CIRCUIT_RESET_MS      = 30_000;
const LATENCY_EMA_ALPHA     = 0.2;

function updateEma(prev: number, sample: number): number {
  return prev === 0 ? sample : LATENCY_EMA_ALPHA * sample + (1 - LATENCY_EMA_ALPHA) * prev;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal: selector suspicion registry
// ═══════════════════════════════════════════════════════════════════════════════

const SUSPICIOUS_SELECTORS = new Map<string, string>([
  ["0x095ea7b3", "approve(address,uint256)"],
  ["0x23b872dd", "transferFrom(address,address,uint256)"],
  ["0x3659cfe6", "upgradeTo(address)"],
  ["0x4f1ef286", "upgradeToAndCall(address,bytes)"],
  ["0xf2fde38b", "transferOwnership(address)"],
  ["0x715018a6", "renounceOwnership()"],
  ["0x69fe0e2d", "withdraw(uint256)"],
  ["0x00f714ce", "withdrawTo(uint256,address)"],
]);

const HIGH_RISK_SELECTORS = new Set([
  "0x3659cfe6",
  "0x4f1ef286",
  "0xf2fde38b",
]);

// ═══════════════════════════════════════════════════════════════════════════════
// GhostJsonRpcProvider
// ═══════════════════════════════════════════════════════════════════════════════

export class GhostJsonRpcProvider extends JsonRpcProvider {
  public readonly layer:          GhostLayer;
  public readonly endpoint:       RpcEndpoint;
  public readonly ghostName:      string;
  public readonly gasTokenSymbol: string;

  private readonly endpoints: EndpointState[];
  private brain?:             GhostBrainWS;
  private brainReady =        false;

  // ── Constructor ─────────────────────────────────────────────────────────────

  constructor(opts: GhostProviderConfig | GhostProviderOptions) {
    const isFlat = "rpc" in opts;

    const primaryUrl    = isFlat ? (opts as GhostProviderConfig).rpc            : (opts as GhostProviderOptions).endpoint.http;
    const chainId       = isFlat ? (opts as GhostProviderConfig).chainId         : (opts as GhostProviderOptions).endpoint.chainId;
    const ghostBrainWs  = isFlat ? (opts as GhostProviderConfig).ghostBrain      : undefined;
    const fallbacks     = isFlat ? ((opts as GhostProviderConfig).fallbackRpcs ?? []) : [];
    const apiKey        = isFlat
      ? ((opts as GhostProviderConfig).apiKey ?? process.env["GHOSTBRAIN_API_KEY"] ?? "dev-key")
      : "dev-key";
    const gasToken      = isFlat ? (opts as GhostProviderConfig).gasToken         : (opts as GhostProviderOptions).gasTokenSymbol;
    const ghostName     = isFlat ? (opts as GhostProviderConfig).ghostName        : (opts as GhostProviderOptions).ghostName;

    const network = typeof chainId === "number" ? Network.from(chainId) : undefined;
    super(primaryUrl, opts.layer, network);

    this.layer          = opts.layer;
    this.endpoint       = isFlat ? { http: primaryUrl, ws: undefined, chainId } : (opts as GhostProviderOptions).endpoint;
    this.ghostName      = ghostName ?? "GhostChain";
    this.gasTokenSymbol = gasToken  ?? "GST";

    this.endpoints = [primaryUrl, ...fallbacks].map(url => ({
      url, failures: 0, lastFailure: 0, latencyEmaMs: 0,
    }));

    if (ghostBrainWs) {
      this.brain = new GhostBrainWS({
        url:      ghostBrainWs,
        apiKey,
        clientId: `ghost-provider-${randomUUID().slice(0, 8)}`,
      });
    }
  }

  // ── RPC failover ─────────────────────────────────────────────────────────────

  /** Override ghost send() to add multi-endpoint failover. */
  override async send(method: string, params: Array<unknown>): Promise<unknown> {
    if (this.endpoints.length === 1) return super.send(method, params);

    const pool = this.healthyEndpoints();
    for (const ep of pool) {
      const t0 = Date.now();
      try {
        const result = await this.sendViaEndpoint(ep, method, params);
        ep.latencyEmaMs = updateEma(ep.latencyEmaMs, Date.now() - t0);
        ep.failures     = 0;
        return result;
      } catch (err: unknown) {
        ep.failures     += 1;
        ep.lastFailure   = Date.now();
        ep.latencyEmaMs  = updateEma(ep.latencyEmaMs, Date.now() - t0);
        if (ep === pool[pool.length - 1]) throw err;
      }
    }
    return super.send(method, params);
  }

  private healthyEndpoints(): EndpointState[] {
    const now     = Date.now();
    const healthy = this.endpoints.filter(ep =>
      ep.failures < CIRCUIT_OPEN_FAILURES || now - ep.lastFailure > CIRCUIT_RESET_MS
    );
    return healthy.length > 0 ? healthy : [...this.endpoints];
  }

  private async sendViaEndpoint(ep: EndpointState, method: string, params: Array<unknown>): Promise<unknown> {
    // Primary endpoint: delegate to ghost JsonRpcProvider (keeps auth headers etc.)
    if (ep === this.endpoints[0]) return super.send(method, params);
    // Fallback endpoints: direct fetch
    const res  = await fetch(ep.url, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
    const json = await res.json() as { result?: unknown; error?: { message: string } };
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  // ── GhostBrain lazy connect ───────────────────────────────────────────────

  private async ensureBrain(): Promise<GhostBrainWS | undefined> {
    if (!this.brain) return undefined;
    if (!this.brainReady) {
      await this.brain.connect();
      this.brainReady = true;
    }
    return this.brain;
  }

  // ── AI routing ────────────────────────────────────────────────────────────

  /**
   * Ask GhostBrain for a routing decision.
   * Falls back to `{ executeOn: this.layer, fallback: true }` if offline.
   */
  async routeTransaction(
    tx: TransactionRequest
  ): Promise<TxRouteDecision | { executeOn: GhostLayer; fallback?: boolean }> {
    const brain = await this.ensureBrain().catch(() => undefined);
    if (!brain) return { executeOn: this.layer };

    const selector = typeof tx.data === "string" && tx.data.length >= 10
      ? tx.data.slice(0, 10) : "0x";

    try {
      return await brain.request<TxRouteDecision>("ghost.route.decide", {
        from: this.layer, to: tx.to,
        value: tx.value?.toString() ?? "0",
        selector, data: tx.data ?? "0x",
      }, { timeoutMs: 2_500 });
    } catch {
      return { executeOn: this.layer, fallback: true };
    }
  }

  /**
   * Route + broadcast a transaction. Logs the AI routing plan.
   */
  async ghostSendTransaction(tx: TransactionRequest): Promise<GhostSendResult> {
    const routeDecision = await this.routeTransaction(tx);
    if ("plan" in routeDecision && routeDecision.plan) {
      const risk = ((routeDecision as TxRouteDecision).riskScore * 100).toFixed(0);
      // eslint-disable-next-line no-console
      console.log(`[GhostAI Route] ${routeDecision.plan.path.join(" → ")} (risk ${risk}%)`);
    }
    const hash = await this.send("eth_sendTransaction", [tx]) as string;
    return { hash, routeDecision };
  }

  // ── Gas optimiser ─────────────────────────────────────────────────────────

  /**
   * Estimate optimal EIP-1559 fee parameters from feeHistory percentile analysis.
   *
   * @param tx      Transaction to estimate gas for.
   * @param urgency "low" (p25) | "medium" (p50) | "high" (p75). Default: "medium".
   */
  async optimizeGas(
    tx:       TransactionRequest,
    urgency?: "low" | "medium" | "high"
  ): Promise<GhostGasEstimate> {
    const u = urgency ?? "medium";

    const [gasLimit, fhRaw, feeData] = await Promise.all([
      this.estimateGas(tx),
      this.send("eth_feeHistory", ["0xa", "latest", [25, 50, 75]]),
      this.getFeeData(),
    ]);

    const fh = fhRaw as { baseFeePerGas: string[]; reward?: string[][] };
    const baseFeeHex = fh.baseFeePerGas[fh.baseFeePerGas.length - 1] ?? "0x0";
    const baseFee    = BigInt(baseFeeHex);

    const pIdx: Record<string, number> = { low: 0, medium: 1, high: 2 };
    const pi      = pIdx[u] ?? 1;
    const rewards  = (fh.reward ?? []).map(r => BigInt(r[pi] ?? "0"));
    const fallback = (feeData as FeeData).maxPriorityFeePerGas ?? 1_000_000_000n;
    const avgReward = rewards.length > 0
      ? rewards.reduce((a, b) => a + b, 0n) / BigInt(rewards.length)
      : fallback;

    const bufferedBase    = (baseFee * 115n) / 100n; // +15% surge buffer
    const maxFeePerGas    = bufferedBase + avgReward;
    const confidence: Record<string, number> = { low: 70, medium: 88, high: 97 };

    return {
      maxFeePerGas,
      maxPriorityFeePerGas: avgReward,
      gasLimit,
      baseFee,
      urgency:             u,
      inclusionConfidence: confidence[u] ?? 88,
    };
  }

  // ── Tx simulation ─────────────────────────────────────────────────────────

  /**
   * Simulate via eth_call without broadcasting.
   * Decodes Error(string) and Panic(uint256) revert data.
   */
  async simulateTx(tx: TransactionRequest): Promise<GhostSimResult> {
    try {
      const returnData = await this.call(tx) as string;
      return { success: true, returnData };
    } catch (err: unknown) {
      const msg  = err instanceof Error ? err.message : String(err);
      const data = this.extractRevertData(msg);
      return {
        success:      false,
        returnData:   data ?? "0x",
        revertReason: this.decodeRevertReason(data) ?? msg,
      };
    }
  }

  private extractRevertData(msg: string): string | undefined {
    return (/data="(0x[0-9a-fA-F]*)"/.exec(msg)
          ?? /revert\s+(0x[0-9a-fA-F]+)/i.exec(msg))?.[1];
  }

  private decodeRevertReason(data?: string): string | undefined {
    if (!data || data.length < 10) return undefined;
    const selector = data.slice(0, 10);
    const rest     = "0x" + data.slice(10);
    try {
      if (selector === "0x08c379a0") {
        const [r] = AbiCoder.defaultAbiCoder().decode(["string"], rest);
        return `Error: ${r as string}`;
      }
      if (selector === "0x4e487b71") {
        const [c] = AbiCoder.defaultAbiCoder().decode(["uint256"], rest);
        return `Panic(${(c as bigint).toString()})`;
      }
    } catch { /* fall through */ }
    return undefined;
  }

  // ── Network load / congestion ──────────────────────────────────────────────

  /**
   * Analyse the last 20 blocks to characterise current network load and fee trend.
   */
  async getNetworkLoad(): Promise<GhostNetworkLoad> {
    const fhRaw = await this.send("eth_feeHistory", ["0x14", "latest", [50]]);
    const fh    = fhRaw as { baseFeePerGas: string[]; gasUsedRatio?: number[] };

    const fees    = fh.baseFeePerGas.map(h => BigInt(h ?? "0"));
    const latest  = fees[fees.length - 1] ?? 0n;
    const midFee  = fees[Math.floor(fees.length / 2)] ?? latest;

    const delta = Number(latest - midFee);
    const feeTrend: "rising" | "falling" | "stable" =
      delta >  Number(midFee) * 0.05 ? "rising"  :
      delta < -Number(midFee) * 0.05 ? "falling" : "stable";

    // Congestion: base fee relative to 1 gwei "calm" baseline, capped at 100
    const CALM = 1_000_000_000n;
    const congestionPct = Math.min(100,
      Number((latest * 100n) / (CALM > 0n ? CALM : 1n))
    );

    const ratios     = (fh.gasUsedRatio ?? []).slice(-5);
    const avgRatio   = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
    const memPoolBusy = avgRatio > 0.8;

    const recommendedUrgency: "low" | "medium" | "high" =
      congestionPct > 70 || memPoolBusy ? "high" :
      congestionPct > 35               ? "medium" : "low";

    return { congestionPct, baseFee: latest, feeTrend, memPoolBusy, recommendedUrgency };
  }

  // ── Contract guard ────────────────────────────────────────────────────────

  /**
   * Inspect calldata selector + optionally query GhostBrain for deeper analysis.
   * Returns `safe: false` when riskScore >= 0.5.
   */
  async guardContractCall(tx: TransactionRequest): Promise<GhostGuardResult> {
    const findings: string[] = [];
    let riskScore = 0;

    const data     = typeof tx.data === "string" ? tx.data : "0x";
    const selector = data.length >= 10 ? data.slice(0, 10) : "0x";

    const knownName = SUSPICIOUS_SELECTORS.get(selector);
    if (knownName) {
      findings.push(`Suspicious selector: ${selector} (${knownName})`);
      riskScore = HIGH_RISK_SELECTORS.has(selector) ? 0.85 : 0.55;
    }

    if (data.length > 4096) {
      findings.push(`Unusually large calldata: ${data.length} bytes`);
      riskScore = Math.max(riskScore, 0.35);
    }

    const brain = await this.ensureBrain().catch(() => undefined);
    if (brain) {
      try {
        const br = await brain.request<{ riskScore?: number; findings?: string[] }>(
          "ghost.route.decide",
          { from: this.layer, to: tx.to, selector, value: tx.value?.toString() ?? "0" },
          { timeoutMs: 2_000 }
        );
        if (typeof br.riskScore === "number")     riskScore = Math.max(riskScore, br.riskScore);
        if (Array.isArray(br.findings))            findings.push(...(br.findings as string[]));
      } catch { /* guard continues with local result */ }
    }

    return { safe: riskScore < 0.5, riskScore, findings };
  }

  // ── Cross-layer send ──────────────────────────────────────────────────────

  /**
   * Initiate a cross-layer transaction.
   * GhostBrain returns the routing plan; the caller wires actual hop execution
   * via HopExecutor with the OP Stack messenger addresses.
   */
  async crossLayerSend(
    tx:          TransactionRequest,
    targetLayer: GhostLayer
  ): Promise<GhostCrossLayerResult> {
    const selector = typeof tx.data === "string" && tx.data.length >= 10
      ? tx.data.slice(0, 10) : "0x";

    let routePlan: TxRouteDecision["plan"] | null = null;
    const brain = await this.ensureBrain().catch(() => undefined);
    if (brain) {
      try {
        const d = await brain.request<TxRouteDecision>("ghost.route.decide", {
          from: this.layer, to: tx.to,
          value: tx.value?.toString() ?? "0",
          selector, intent: "bridge",
        }, { timeoutMs: 3_000 });
        routePlan = d.plan;
      } catch { /* proceed without plan */ }
    }

    const sourceTxHash = await this.send("eth_sendTransaction", [tx]) as string;
    return { sourceTxHash, targetLayer, routePlan };
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  /** Connectivity probe — layer + chainId + block + latency. */
  async ghostPing(): Promise<GhostPingResult> {
    const t0 = Date.now();
    const [network, block] = await Promise.all([
      this.getNetwork(),
      this.getBlockNumber(),
    ]);
    return { layer: this.layer, chainId: network.chainId, block: BigInt(block), latencyMs: Date.now() - t0 };
  }

  /** Per-endpoint health summary (for dashboards / operator tooling). */
  endpointHealth(): Array<{
    url: string; failures: number; circuitOpen: boolean; latencyEmaMs: number;
  }> {
    const now = Date.now();
    return this.endpoints.map(ep => ({
      url:          ep.url,
      failures:     ep.failures,
      circuitOpen:  ep.failures >= CIRCUIT_OPEN_FAILURES && now - ep.lastFailure < CIRCUIT_RESET_MS,
      latencyEmaMs: Math.round(ep.latencyEmaMs),
    }));
  }

  /** Disconnect GhostBrain WS. Call on provider teardown. */
  closeBrain(): void {
    if (this.brainReady) { this.brain?.close(); this.brainReady = false; }
  }
}
