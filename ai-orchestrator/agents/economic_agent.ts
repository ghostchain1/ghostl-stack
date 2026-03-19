/**
 * GhostStack Global AI Orchestrator — Economic Agent
 *
 * Optimises the economic layer of GhostStack: gas pricing, treasury health,
 * reward distribution, and fee flow across all three layers.
 *
 * Responsibilities:
 *   - Monitor L1 / L2 / L3 gas prices (ghost_gasPrice) and flag anomalies.
 *   - Pull treasury health from Treasury Engine (:7683).
 *   - Audit reward distribution via Reward Distributor (:7684).
 *   - Aggregate L2 revenue via L2 Revenue Aggregator (:7682).
 *   - Surface advisory signals to GhostBrain for the Economic AI Engine.
 *
 * Safety boundaries:
 *   - Agent NEVER submits on-chain token transfers or treasury disbursements.
 *   - All proposed parameter changes are advisory — PolicyGuard hard-denies
 *     any ECONOMIC task that requests autonomous execution.
 *   - Gas token is always GST — no ETH/WETH references anywhere.
 *
 * Services consumed:
 *   - L2 Revenue Aggregator  :7682
 *   - Treasury Engine        :7683
 *   - Reward Distributor     :7684
 *   - GhostBrain Core        :7900
 *   - L1 RPC                 :18545 (ghost_gasPrice, ghost_getBalance)
 *
 * Chain: GhostChain L1 (chain_id 14000101). Gas token: GST.
 */

import type {
  Agent,
  AgentHealth,
  AgentName,
  AgentResult,
  Task,
} from "../core/task_router.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const L1_CHAIN_ID   = 14000101 as const;
const L2_CHAIN_ID   = 901       as const;
const L3_CHAIN_ID   = 903       as const;
const AGENT_NAME: AgentName = "economic_agent";

const GHOSTBRAIN_URL         = process.env["GHOSTBRAIN_API_URL"]     ?? "http://localhost:7900";
const L2_REVENUE_AGG_URL     = process.env["L2_REVENUE_AGG_URL"]     ?? "http://localhost:7682";
const TREASURY_ENGINE_URL    = process.env["TREASURY_ENGINE_URL"]    ?? "http://localhost:7683";
const REWARD_DISTRIBUTOR_URL = process.env["REWARD_DISTRIBUTOR_URL"] ?? "http://localhost:7684";
const L1_RPC_URL             = process.env["L1_RPC_URL"]             ?? "http://localhost:18545";
const L2_RPC_URL             = process.env["L2_RPC_URL"]             ?? "http://localhost:7260";
const L3_RPC_URL             = process.env["L3_RPC_URL"]             ?? "http://localhost:7270";

/** Gas price spike: > 500 gwei on L1 triggers a HIGH advisory. */
const GAS_SPIKE_GWEI = 500;

/** Treasury drawdown > 20% in one cycle triggers a CRITICAL advisory. */
const TREASURY_DRAWDOWN_PCT = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GasPriceReading {
  chainId:   number;
  rpcUrl:    string;
  wei:       bigint | null;
  gwei:      number | null;
  spiked:    boolean;
  checkedAt: number;
}

export interface TreasurySnapshot {
  balanceGst:   bigint | null;
  reserveRatio: number | null;
  drawdownPct:  number | null;    // vs previous snapshot
  healthy:      boolean;
  checkedAt:    number;
}

export interface RewardSnapshot {
  pendingRewards:    bigint | null;
  lastDistributedAt: number | null;
  distributorHealth: boolean;
  checkedAt:         number;
}

export interface EconomicAdvisory {
  severity:  "INFO" | "WARN" | "CRITICAL";
  domain:    "gas" | "treasury" | "rewards" | "revenue";
  message:   string;
  data:      Record<string, unknown>;
  issuedAt:  number;
  chain_id:  number;
  gas_token: string;
}

export interface EconomicAgentOptions {
  ghostbrainUrl?:       string;
  l2RevenueAggUrl?:     string;
  treasuryEngineUrl?:   string;
  rewardDistributorUrl?: string;
  l1RpcUrl?:            string;
  l2RpcUrl?:            string;
  l3RpcUrl?:            string;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── EconomicAgent ─────────────────────────────────────────────────────────────

export class EconomicAgent implements Agent {
  readonly name: AgentName = AGENT_NAME;

  private readonly ghostbrainUrl:        string;
  private readonly l2RevenueAggUrl:      string;
  private readonly treasuryEngineUrl:    string;
  private readonly rewardDistributorUrl: string;
  private readonly l1RpcUrl:             string;
  private readonly l2RpcUrl:             string;
  private readonly l3RpcUrl:             string;
  private readonly fetcher:              (url: string, init?: RequestInit) => Promise<Response>;

  private successCount     = 0;
  private errorCount       = 0;
  private lastTaskAt:      number | null = null;
  private lastTreasury:    TreasurySnapshot | null = null;

  constructor(opts: EconomicAgentOptions = {}) {
    this.ghostbrainUrl        = opts.ghostbrainUrl        ?? GHOSTBRAIN_URL;
    this.l2RevenueAggUrl      = opts.l2RevenueAggUrl      ?? L2_REVENUE_AGG_URL;
    this.treasuryEngineUrl    = opts.treasuryEngineUrl    ?? TREASURY_ENGINE_URL;
    this.rewardDistributorUrl = opts.rewardDistributorUrl ?? REWARD_DISTRIBUTOR_URL;
    this.l1RpcUrl             = opts.l1RpcUrl             ?? L1_RPC_URL;
    this.l2RpcUrl             = opts.l2RpcUrl             ?? L2_RPC_URL;
    this.l3RpcUrl             = opts.l3RpcUrl             ?? L3_RPC_URL;
    this.fetcher              = opts.fetcher              ?? ((u, i) => fetch(u, i));
  }

  // ── Agent interface ────────────────────────────────────────────────────────

  async handle(task: Task): Promise<AgentResult> {
    this.lastTaskAt = nowSec();
    try {
      const output = await this._dispatch(task);
      this.successCount += 1;
      return this._result(task, true, output);
    } catch (err: unknown) {
      this.errorCount += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[EconomicAgent] Task ${task.id} failed:`, message);
      return this._result(task, false, { error: message });
    }
  }

  health(): AgentHealth {
    return {
      name:         AGENT_NAME,
      healthy:      this.errorCount < 5,
      lastTaskAt:   this.lastTaskAt,
      errorCount:   this.errorCount,
      successCount: this.successCount,
    };
  }

  // ── Task dispatch ──────────────────────────────────────────────────────────

  private async _dispatch(task: Task): Promise<Record<string, unknown>> {
    const action = task.payload["action"];
    switch (action) {
      case "snapshot_economics":  return this._snapshotEconomics(task);
      case "check_gas":           return this._checkGas(task);
      case "check_treasury":      return this._checkTreasury(task);
      case "check_rewards":       return this._checkRewards(task);
      case "aggregate_revenue":   return this._aggregateRevenue(task);
      default:                    return this._generic(task);
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  /** Full economic snapshot: gas + treasury + rewards + revenue. */
  private async _snapshotEconomics(task: Task): Promise<Record<string, unknown>> {
    const [gasSummary, treasury, rewards, revenue] = await Promise.allSettled([
      this._checkGas(task),
      this._checkTreasury(task),
      this._checkRewards(task),
      this._aggregateRevenue(task),
    ]);

    const snapshot = {
      gas:      gasSummary.status   === "fulfilled" ? gasSummary.value   : null,
      treasury: treasury.status     === "fulfilled" ? treasury.value     : null,
      rewards:  rewards.status      === "fulfilled" ? rewards.value      : null,
      revenue:  revenue.status      === "fulfilled" ? revenue.value      : null,
      snapshotAt: nowSec(),
      chain_id:   L1_CHAIN_ID,
      gas_token:  "GST",
    };

    void this._report("economic/snapshot", snapshot);
    return snapshot;
  }

  /** Poll ghost_gasPrice from all three layers. */
  private async _checkGas(task: Task): Promise<Record<string, unknown>> {
    const readings = await Promise.allSettled([
      this._getGasPrice(L1_CHAIN_ID, this.l1RpcUrl),
      this._getGasPrice(L2_CHAIN_ID, this.l2RpcUrl),
      this._getGasPrice(L3_CHAIN_ID, this.l3RpcUrl),
    ]);

    const prices: GasPriceReading[] = readings.map((r) =>
      r.status === "fulfilled" ? r.value : {
        chainId: 0, rpcUrl: "", wei: null, gwei: null, spiked: false, checkedAt: nowSec(),
      },
    );

    const spiked = prices.filter((p) => p.spiked);
    for (const p of spiked) {
      void this._sendAdvisory({
        severity:  "HIGH" === "HIGH" ? "WARN" : "INFO",  // WARN for spike
        domain:    "gas",
        message:   `Gas spike on chain ${p.chainId}: ${p.gwei?.toFixed(0)} gwei (threshold: ${GAS_SPIKE_GWEI} gwei)`,
        data:      { chainId: p.chainId, gwei: p.gwei },
        issuedAt:  nowSec(),
        chain_id:  L1_CHAIN_ID,
        gas_token: "GST",
      });
    }

    void this._report("economic/gas-prices", { prices, task_id: task.id });
    return { prices: prices.map((p) => ({ chainId: p.chainId, gwei: p.gwei, spiked: p.spiked })) };
  }

  /** Check treasury health via Treasury Engine. */
  private async _checkTreasury(task: Task): Promise<Record<string, unknown>> {
    let snapshot: TreasurySnapshot | null = null;
    try {
      const res = await this.fetcher(`${this.treasuryEngineUrl}/status`, {});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        balance_gst?: string;
        reserve_ratio?: number;
        healthy?: boolean;
      };

      const raw = BigInt(data.balance_gst ?? "0");
      const prev = this.lastTreasury?.balanceGst ?? raw;
      const drawdown = prev > 0n
        ? Number((prev - raw) * 100n / prev)
        : 0;

      snapshot = {
        balanceGst:   raw,
        reserveRatio: data.reserve_ratio ?? null,
        drawdownPct:  drawdown,
        healthy:      data.healthy ?? true,
        checkedAt:    nowSec(),
      };
      this.lastTreasury = snapshot;

      if (drawdown > TREASURY_DRAWDOWN_PCT) {
        void this._sendAdvisory({
          severity:  "CRITICAL",
          domain:    "treasury",
          message:   `Treasury drawdown ${drawdown.toFixed(1)}% exceeds threshold (${TREASURY_DRAWDOWN_PCT}%)`,
          data:      { drawdownPct: drawdown, balanceGst: data.balance_gst },
          issuedAt:  nowSec(),
          chain_id:  L1_CHAIN_ID,
          gas_token: "GST",
        });
      }
    } catch (err: unknown) {
      console.error("[EconomicAgent] Treasury Engine unreachable:", (err as Error).message);
    }

    void this._report("economic/treasury", { snapshot, task_id: task.id });
    return { snapshot };
  }

  /** Audit reward distribution pipeline. */
  private async _checkRewards(task: Task): Promise<Record<string, unknown>> {
    let snapshot: RewardSnapshot | null = null;
    try {
      const res = await this.fetcher(`${this.rewardDistributorUrl}/status`, {});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        pending_rewards?: string;
        last_distributed_at?: number;
        healthy?: boolean;
      };

      snapshot = {
        pendingRewards:    BigInt(data.pending_rewards ?? "0"),
        lastDistributedAt: data.last_distributed_at ?? null,
        distributorHealth: data.healthy ?? true,
        checkedAt:         nowSec(),
      };

      if (!snapshot.distributorHealth) {
        void this._sendAdvisory({
          severity:  "WARN",
          domain:    "rewards",
          message:   "Reward Distributor reports unhealthy state",
          data:      { pendingRewards: data.pending_rewards },
          issuedAt:  nowSec(),
          chain_id:  L1_CHAIN_ID,
          gas_token: "GST",
        });
      }
    } catch (err: unknown) {
      console.error("[EconomicAgent] Reward Distributor unreachable:", (err as Error).message);
    }

    void this._report("economic/rewards", { snapshot, task_id: task.id });
    return { snapshot };
  }

  /** Aggregate revenue via L2 Revenue Aggregator. */
  private async _aggregateRevenue(task: Task): Promise<Record<string, unknown>> {
    let data: Record<string, unknown> = {};
    try {
      const res = await this.fetcher(
        `${this.l2RevenueAggUrl}/aggregate?chain_id=${L2_CHAIN_ID}&gas_token=GST`,
        {},
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = (await res.json()) as Record<string, unknown>;
    } catch (err: unknown) {
      console.error("[EconomicAgent] L2 Revenue Aggregator unreachable:", (err as Error).message);
    }

    void this._report("economic/revenue", { ...data, task_id: task.id });
    return data;
  }

  private async _generic(task: Task): Promise<Record<string, unknown>> {
    void this._report("economic/generic-task", { task_id: task.id, payload: task.payload });
    console.log(`[EconomicAgent] Generic task ${task.id}`);
    return { handled: true };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async _getGasPrice(chainId: number, rpcUrl: string): Promise<GasPriceReading> {
    const base: Omit<GasPriceReading, "wei" | "gwei" | "spiked"> = {
      chainId, rpcUrl, checkedAt: nowSec(),
    };
    try {
      const res = await this.fetcher(rpcUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ jsonrpc: "2.0", method: "ghost_gasPrice", params: [], id: 1 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { result?: string };
      if (!json.result) throw new Error("no result");
      const wei  = BigInt(json.result);
      const gwei = Number(wei) / 1e9;
      return { ...base, wei, gwei, spiked: gwei > GAS_SPIKE_GWEI };
    } catch {
      return { ...base, wei: null, gwei: null, spiked: false };
    }
  }

  private async _sendAdvisory(advisory: EconomicAdvisory): Promise<void> {
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/economic/advisory`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(advisory),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[EconomicAgent] Advisory send failed:", err.message);
    }
  }

  private async _report(endpoint: string, data: Record<string, unknown>): Promise<void> {
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/${endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...data, chain_id: L1_CHAIN_ID, gas_token: "GST" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[EconomicAgent] GhostBrain report failed:", err.message);
    }
  }

  private _result(
    task:    Task,
    success: boolean,
    output:  Record<string, unknown>,
  ): AgentResult {
    return {
      taskId:    task.id,
      agentName: AGENT_NAME,
      success,
      output,
      handledAt: nowSec(),
      chain_id:  L1_CHAIN_ID,
      gas_token: "GST",
    };
  }
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
