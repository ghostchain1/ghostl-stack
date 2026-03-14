/**
 * GhostChain AI Validator Network — Validator Network Coordinator
 *
 * The top-level orchestrator that wires together all AI validator
 * subsystems and drives the observe→analyze→predict→adjust loop.
 *
 * Subsystems coordinated:
 *   ValidatorMonitor   — health tracking & alerting
 *   BlockAnalyzer      — per-block statistical analysis
 *   ForkPredictor      — block-time variance → fork risk
 *   LatencyPredictor   — per-validator latency spike prediction
 *   AttackDetector     — gas spam, double-sign, eclipse, sybil detection
 *   AnomalyDetector    — multi-variate network anomaly scoring
 *   ValidatorBalancer  — load-based delegation rebalancing proposals
 *   StakeOptimizer     — HHI / Nakamoto / region-fraction optimization
 *
 *  Data flow:
 *   External feeds (RPC pollers, telemetry agents)
 *     → ValidatorNetwork.ingest*()
 *     → per-subsystem analysis
 *     → GhostBrain Core (:7900) via each subsystem's forwardXxx()
 *
 * Chain routing law: L1 (14000101) · L2 (901) · L3 (903).  Gas token: GST.
 *
 * SECURITY:
 *   - All ingested data is type-checked before routing.
 *   - The network coordinator holds NO private keys.
 *   - Advisory signals only — governance ratification required for on-chain
 *     actions.
 */

import {
  ValidatorMonitor,
  type ValidatorRecord,
  type ChainId,
  CHAIN_IDS,
} from "../monitor/validator_monitor.js";
import { BlockAnalyzer, type GhostBlock }         from "../monitor/block_analyzer.js";
import { ForkPredictor, type BlockTimeSample }    from "../prediction/fork_predictor.js";
import { LatencyPredictor, type LatencySample }   from "../prediction/latency_predictor.js";
import { AttackDetector }                          from "../security/attack_detector.js";
import { AnomalyDetector, type NetworkMetrics }   from "../security/anomaly_detector.js";
import { ValidatorBalancer, type ValidatorLoad }  from "../balancing/validator_balancer.js";
import { StakeOptimizer }                          from "../balancing/stake_optimizer.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ValidatorNetworkOptions {
  ghostbrainUrl?:   string;
  /** Interval between automatic monitor + balance cycles (milliseconds). */
  cycleIntervalMs?: number;
}

export interface NetworkStatus {
  timestamp:         number;
  validatorSummary:  Record<string, number>;
  chainIds:          ChainId[];
  cycleCount:        number;
  initialized:       boolean;
}

// ── ValidatorNetwork ───────────────────────────────────────────────────────

export class ValidatorNetwork {
  // ── Subsystems ───────────────────────────────────────────────────────────

  readonly monitor:           ValidatorMonitor;
  readonly blockAnalyzer:     BlockAnalyzer;
  readonly forkPredictor:     ForkPredictor;
  readonly latencyPredictor:  LatencyPredictor;
  readonly attackDetector:    AttackDetector;
  readonly anomalyDetector:   AnomalyDetector;
  readonly validatorBalancer: ValidatorBalancer;
  readonly stakeOptimizer:    StakeOptimizer;

  // ── State ─────────────────────────────────────────────────────────────────

  private readonly chainIds    = new Set<ChainId>();
  private readonly loads       = new Map<string, ValidatorLoad>();
  private cycleCount           = 0;
  private cycleTimer:          NodeJS.Timeout | null = null;
  private readonly cycleIntervalMs: number;

  constructor(opts: ValidatorNetworkOptions = {}) {
    const gb = opts.ghostbrainUrl ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.cycleIntervalMs = opts.cycleIntervalMs ?? 30_000;

    const gbOpts = { ghostbrainUrl: gb };
    this.monitor           = new ValidatorMonitor(gbOpts);
    this.blockAnalyzer     = new BlockAnalyzer(gbOpts);
    this.forkPredictor     = new ForkPredictor(gbOpts);
    this.latencyPredictor  = new LatencyPredictor(gbOpts);
    this.attackDetector    = new AttackDetector(gbOpts);
    this.anomalyDetector   = new AnomalyDetector(gbOpts);
    this.validatorBalancer = new ValidatorBalancer(gbOpts);
    this.stakeOptimizer    = new StakeOptimizer(gbOpts);
  }

  // ── Validator registration ────────────────────────────────────────────────

  add(v: ValidatorRecord): void {
    this.monitor.register(v);
    this.chainIds.add(v.chainId);
  }

  update(address: string, patch: Partial<ValidatorRecord>): void {
    this.monitor.update(address, patch);
  }

  list(): ValidatorRecord[] {
    return this.monitor.all();
  }

  getValidator(address: string): ValidatorRecord | undefined {
    return this.monitor.get(address);
  }

  // ── Load telemetry ingestion ──────────────────────────────────────────────

  updateLoad(load: ValidatorLoad): void {
    this.loads.set(load.address, load);
  }

  // ── Event ingestion ───────────────────────────────────────────────────────

  /** Ingest a finalized block — drives BlockAnalyzer, ForkPredictor, AttackDetector. */
  async ingestBlock(block: GhostBlock): Promise<void> {
    await Promise.allSettled([
      this.blockAnalyzer.analyze(block),
      this.forkPredictor.ingest(
        { chainId: block.chainId, height: block.height, timestamp: block.timestamp },
      ),
      this.attackDetector.detectBlock(block),
    ]);
  }

  /** Ingest a per-validator latency observation. */
  async ingestLatency(sample: LatencySample): Promise<void> {
    await this.latencyPredictor.observe(sample);
  }

  /** Ingest a network-wide metric snapshot — drives AnomalyDetector. */
  async ingestMetrics(metrics: NetworkMetrics): Promise<void> {
    await this.anomalyDetector.observe(metrics);
  }

  /** Signal an eclipse attack to the AttackDetector. */
  async signalEclipse(chainId: ChainId, affectedValidators: string[]): Promise<void> {
    await this.attackDetector.detectEclipse(chainId, affectedValidators);
  }

  /** Record a new validator registration for sybil detection. */
  async recordRegistration(chainId: ChainId): Promise<void> {
    await this.attackDetector.recordValidatorRegistration(chainId);
  }

  // ── Cycle ─────────────────────────────────────────────────────────────────

  /**
   * Run one observe→analyze→predict→adjust cycle manually.
   * Also called automatically when start() is used.
   */
  async runCycle(): Promise<void> {
    this.cycleCount++;

    const validators = this.monitor.all();

    // 1. Health monitor — emits alerts to GhostBrain.
    await this.monitor.check();

    // 2. Load balancing — only when we have load metrics.
    const loadSnapshot = validators
      .map((v: ValidatorRecord) => this.loads.get(v.address))
      .filter((l: ValidatorLoad | undefined): l is ValidatorLoad => l !== undefined);

    if (loadSnapshot.length > 0) {
      await this.validatorBalancer.rebalance(loadSnapshot, validators);
    }

    // 3. Stake optimization — per chain.
    for (const chainId of this.chainIds) {
      const chainValidators = validators.filter((v: ValidatorRecord) => v.chainId === chainId);
      if (chainValidators.length > 0) {
        await this.stakeOptimizer.optimize({
          chainId,
          timestamp: Math.floor(Date.now() / 1000),
          validators: chainValidators,
        });
      }
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Start the automatic cycle timer. */
  start(): void {
    if (this.cycleTimer !== null) return;
    this.cycleTimer = setInterval(() => {
      this.runCycle().catch((err: Error) =>
        console.error("[ValidatorNetwork] Cycle error:", err.message),
      );
    }, this.cycleIntervalMs);
    // Run an initial cycle immediately.
    this.runCycle().catch((err: Error) =>
      console.error("[ValidatorNetwork] Initial cycle error:", err.message),
    );
  }

  /** Stop the automatic cycle timer. */
  stop(): void {
    if (this.cycleTimer !== null) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  status(): NetworkStatus {
    return {
      timestamp:        Math.floor(Date.now() / 1000),
      validatorSummary: this.monitor.summary(),
      chainIds:         [...this.chainIds],
      cycleCount:       this.cycleCount,
      initialized:      this.monitor.all().length > 0,
    };
  }

  // ── Chain constants exposed for consumers ─────────────────────────────────

  static readonly CHAIN_IDS = CHAIN_IDS;
}
