/**
 * GhostChain Sovereign Interchain Bridge — Fraud Detector
 *
 * Applies multiple independent fraud patterns to each inbound bridge message
 * before the validator signs.  A single pattern match is sufficient to
 * place the message on hold (clearance = false).
 *
 * Patterns detected:
 *   REPLAY        — msgId seen before (dedup).
 *   AMOUNT_SPIKE  — amount > N × rolling-average (statistical outlier).
 *   RATE_FLOOD    — more than MAX_MSGS_PER_WINDOW messages in a short window
 *                   from the same sender.
 *   ZERO_ADDRESS  — sender or recipient is the zero address.
 *   CHAIN_BYPASS  — neither srcChainId nor dstChainId is a GhostChain layer
 *                   (would bypass settlement).
 *   DUST_SPAM     — amount below minimum (honeypot or noise flooding).
 *   SEQUENCE_GAP  — nonce jumps unexpectedly (suggests missing message).
 *
 * All detections are advisory: returned as `FraudAssessment`.
 * The calling validator decides whether to approve, defer, or reject.
 * This module never calls GhostBridge on-chain functions directly.
 *
 * SECURITY:
 *   - Rolling buffers bounded (MAX_HISTORY).
 *   - Amount history uses `bigint` arithmetic (no floating-point for GST).
 *   - Sender-rate map is bounded to MAX_SENDERS to prevent memory-exhaustion
 *     under sender-address flooding attacks.
 */

import type { BridgeMessage } from "../relayer/bridge_relayer.js";

// ── Constants ────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101;
const GHOST_CHAIN_IDS = new Set([14000101, 901, 903]);

const MAX_HISTORY         = 1000;
const MAX_SENDERS         = 5000;
const MAX_MSGS_PER_WINDOW = 50;      // per sender per RATE_WINDOW_SEC
const RATE_WINDOW_SEC     = 60;
const SPIKE_MULTIPLIER    = 10;      // amount > SPIKE_MULTIPLIER × avg → spike
const MIN_AMOUNT_GST      = 1_000n;  // dust threshold
const WARMUP_SAMPLES      = 20;

// ── Types ────────────────────────────────────────────────────────────────────

export type FraudPattern =
  | "REPLAY"
  | "AMOUNT_SPIKE"
  | "RATE_FLOOD"
  | "ZERO_ADDRESS"
  | "CHAIN_BYPASS"
  | "DUST_SPAM"
  | "SEQUENCE_GAP";

export interface FraudAssessment {
  msgId:          string;
  clear:          boolean;           // true → validator may proceed
  patterns:       FraudPattern[];    // detected violation(s), empty if clear
  amountGst:      bigint;
  rollingAvgGst:  bigint;
  riskScore:      number;            // 0 (clean) … 1 (certain fraud)
  timestamp:      number;
}

// ── FraudDetector ─────────────────────────────────────────────────────────────

export interface FraudDetectorOptions {
  ghostbrainUrl?: string;
  /** Spike multiplier override. */
  spikeMultiplier?: number;
  /** Minimum amount considered non-dust. */
  minAmountGst?: bigint;
  /** Max messages per sender per rate window. */
  maxMsgsPerWindow?: number;
}

export class FraudDetector {
  private readonly ghostbrainUrl:   string;
  private readonly spikeMultiplier: number;
  private readonly minAmountGst:    bigint;
  private readonly maxMsgsPerWindow: number;

  /** Historical amounts (bigint) for rolling average. */
  private readonly amountHistory: bigint[] = [];
  /** Already-seen msgIds. */
  private readonly seenMsgIds = new Set<string>();
  /** Per-sender message timestamps for rate limiting. */
  private readonly senderRates = new Map<string, number[]>();
  /** Last known nonce per (srcChain, dstChain). */
  private readonly lastNonce = new Map<string, number>();

  /** Recent assessments for audit. */
  private readonly assessments: FraudAssessment[] = [];

  constructor(opts: FraudDetectorOptions = {}) {
    this.ghostbrainUrl    = opts.ghostbrainUrl    ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.spikeMultiplier  = opts.spikeMultiplier  ?? SPIKE_MULTIPLIER;
    this.minAmountGst     = opts.minAmountGst     ?? MIN_AMOUNT_GST;
    this.maxMsgsPerWindow = opts.maxMsgsPerWindow ?? MAX_MSGS_PER_WINDOW;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  assess(msg: BridgeMessage, nowSec: number = Math.floor(Date.now() / 1000)): FraudAssessment {
    const patterns = this.runPatterns(msg, nowSec);
    const clear    = patterns.length === 0;

    const rollingAvgGst = this.rollingAvg();
    const riskScore     = this.computeRisk(patterns, msg.amountGst, rollingAvgGst);

    const assessment: FraudAssessment = {
      msgId:         msg.msgId,
      clear,
      patterns,
      amountGst:     msg.amountGst,
      rollingAvgGst,
      riskScore,
      timestamp:     nowSec,
    };

    this.ingest(msg, nowSec);
    this.store(assessment);

    if (!clear) {
      this.forward(assessment).catch((err: Error) =>
        console.error("[FraudDetector] GhostBrain forward error:", err.message),
      );
    }

    return assessment;
  }

  recentAssessments(n = 50): FraudAssessment[] {
    return this.assessments.slice(-n);
  }

  // ── Pattern checks ──────────────────────────────────────────────────────────

  private runPatterns(msg: BridgeMessage, nowSec: number): FraudPattern[] {
    const detected: FraudPattern[] = [];

    if (this.isReplay(msg))            detected.push("REPLAY");
    if (this.isZeroAddress(msg))       detected.push("ZERO_ADDRESS");
    if (this.isDust(msg))              detected.push("DUST_SPAM");
    if (this.isChainBypass(msg))       detected.push("CHAIN_BYPASS");
    if (this.isAmountSpike(msg))       detected.push("AMOUNT_SPIKE");
    if (this.isRateFlood(msg, nowSec)) detected.push("RATE_FLOOD");
    if (this.isSequenceGap(msg))       detected.push("SEQUENCE_GAP");

    return detected;
  }

  private isReplay(msg: BridgeMessage): boolean {
    return this.seenMsgIds.has(msg.msgId);
  }

  private isZeroAddress(msg: BridgeMessage): boolean {
    const zero = "0x0000000000000000000000000000000000000000";
    return msg.sender.toLowerCase() === zero || msg.recipient.toLowerCase() === zero;
  }

  private isDust(msg: BridgeMessage): boolean {
    return msg.amountGst < this.minAmountGst;
  }

  private isChainBypass(msg: BridgeMessage): boolean {
    return !GHOST_CHAIN_IDS.has(msg.srcChainId) && !GHOST_CHAIN_IDS.has(msg.dstChainId);
  }

  private isAmountSpike(msg: BridgeMessage): boolean {
    if (this.amountHistory.length < WARMUP_SAMPLES) return false;
    const avg = this.rollingAvg();
    if (avg === 0n) return false;
    return msg.amountGst > avg * BigInt(this.spikeMultiplier);
  }

  private isRateFlood(msg: BridgeMessage, nowSec: number): boolean {
    const times = this.getSenderTimes(msg.sender, nowSec);
    return times.length >= this.maxMsgsPerWindow;
  }

  private isSequenceGap(msg: BridgeMessage): boolean {
    const key  = `${msg.srcChainId}:${msg.dstChainId}`;
    const last = this.lastNonce.get(key);
    if (last === undefined) return false;
    // Allow same nonce (duplicate) or strictly next nonce.
    // A gap of more than 1 is suspicious.
    return msg.nonce > last + 1;
  }

  // ── Ingestion (after assessment) ────────────────────────────────────────────

  private ingest(msg: BridgeMessage, nowSec: number): void {
    // Update seen set.
    this.seenMsgIds.add(msg.msgId);

    // Update amount history.
    this.amountHistory.push(msg.amountGst);
    if (this.amountHistory.length > MAX_HISTORY) this.amountHistory.shift();

    // Update sender rate.
    const times = this.getSenderTimes(msg.sender, nowSec);
    times.push(nowSec);

    // Update nonce tracking.
    const key = `${msg.srcChainId}:${msg.dstChainId}`;
    const last = this.lastNonce.get(key);
    if (last === undefined || msg.nonce > last) {
      this.lastNonce.set(key, msg.nonce);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private getSenderTimes(sender: string, nowSec: number): number[] {
    if (!this.senderRates.has(sender)) {
      if (this.senderRates.size >= MAX_SENDERS) {
        // Evict the oldest sender to prevent map exhaustion.
        const firstKey = this.senderRates.keys().next().value;
        if (firstKey !== undefined) this.senderRates.delete(firstKey);
      }
      this.senderRates.set(sender, []);
    }
    const times  = this.senderRates.get(sender)!;
    const cutoff = nowSec - RATE_WINDOW_SEC;
    while (times.length > 0 && (times[0] ?? 0) < cutoff) times.shift();
    return times;
  }

  private rollingAvg(): bigint {
    if (this.amountHistory.length === 0) return 0n;
    const sum = this.amountHistory.reduce((a, b) => a + b, 0n);
    return sum / BigInt(this.amountHistory.length);
  }

  private computeRisk(patterns: FraudPattern[], amount: bigint, avg: bigint): number {
    if (patterns.length === 0) return 0;
    const patternScore = Math.min(patterns.length / 3, 1.0);  // 3+ patterns = max
    const spikeScore   = avg > 0n
      ? Math.min(Number(amount) / (Number(avg) * this.spikeMultiplier), 1.0)
      : 0;
    return Math.min(0.7 * patternScore + 0.3 * spikeScore, 1.0);
  }

  private store(assessment: FraudAssessment): void {
    this.assessments.push(assessment);
    if (this.assessments.length > MAX_HISTORY) this.assessments.shift();
  }

  private async forward(assessment: FraudAssessment): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/bridge/fraud-alert`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        chain_id:      L1_CHAIN_ID,
        gas_token:     "GST",
        msgId:         assessment.msgId,
        patterns:      assessment.patterns,
        amountGst:     assessment.amountGst.toString(),
        rollingAvgGst: assessment.rollingAvgGst.toString(),
        riskScore:     assessment.riskScore,
        timestamp:     assessment.timestamp,
      }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}
