/**
 * GhostChain Sovereign Interchain Bridge — Bridge Validator
 *
 * Each bridge validator node runs this module to:
 *   1. Receive bridge messages from the relayer.
 *   2. Obtain a `VerificationResult` from the State Oracle.
 *   3. Check fraud-detector clearance.
 *   4. Sign the message hash if all checks pass.
 *   5. Broadcast the approval to the on-chain `GhostBridge.approveInbound()`.
 *   6. Forward the approval record to GhostBrain for audit.
 *
 * Quorum model:
 *   The on-chain GhostBridge contract tracks quorum.  This off-chain module
 *   manages per-message approval state and ensures each validator signs at
 *   most once per message (deduplication by msgId + validatorAddress).
 *
 * Advisory-only:
 *   This module DOES submit on-chain approvals via the signing relay
 *   (POST /relay/bridge/approve).  The relay handles private-key management
 *   and nonce sequencing; this module constructs the advisory payload only.
 *
 * SECURITY:
 *   - Strict input validation on every message before signing.
 *   - Rate-limiting: max N approvals per window to prevent runaway signing.
 *   - Approval dedup map is bounded (MAX_RECORDS).
 *   - GhostChain settlement-authority rule enforced: at least one side of
 *     every message must be a GhostChain layer.
 *
 * Gas token: GST.
 */

import type { BridgeMessage } from "../relayer/bridge_relayer.js";
import type { VerificationResult } from "../oracle/state_oracle.js";

// ── Constants ────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101;
const L2_CHAIN_ID = 901;
const L3_CHAIN_ID = 903;
const GHOST_CHAIN_IDS = new Set([L1_CHAIN_ID, L2_CHAIN_ID, L3_CHAIN_ID]);

const MAX_RECORDS        = 10_000;
const RATE_WINDOW_SEC    = 60;
const MAX_APPROVALS_PER_WINDOW = 200;

// ── Types ────────────────────────────────────────────────────────────────────

export type ValidationVerdict = "approved" | "rejected" | "deferred";

export interface ValidationRecord {
  msgId:          string;
  validator:      string;    // validator address/identity
  verdict:        ValidationVerdict;
  reason:         string;
  timestamp:      number;
  amountGst:      bigint;
  srcChainId:     number;
  dstChainId:     number;
}

// ── BridgeValidator ──────────────────────────────────────────────────────────

export interface BridgeValidatorOptions {
  ghostbrainUrl?:   string;
  relayUrl?:        string;
  validatorAddress?: string;
  /** Minimum amountGst to validate (dust filter, default 1000n). */
  minAmountGst?: bigint;
  /** Maximum amountGst per single message (circuit breaker, default 1e24n). */
  maxAmountGst?: bigint;
}

export class BridgeValidator {
  private readonly ghostbrainUrl:    string;
  private readonly relayUrl:         string;
  private readonly validatorAddress: string;
  private readonly minAmountGst:     bigint;
  private readonly maxAmountGst:     bigint;

  /** Processed message IDs (dedup). */
  private readonly processed = new Set<string>();
  /** Recent approval records for audit. */
  private readonly records: ValidationRecord[] = [];
  /** Rate-limit: timestamps of recent approvals. */
  private readonly recentApprovals: number[] = [];

  constructor(opts: BridgeValidatorOptions = {}) {
    this.ghostbrainUrl    = opts.ghostbrainUrl    ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.relayUrl         = opts.relayUrl         ?? (process.env["SIGNING_RELAY_URL"]   ?? "http://localhost:7910");
    this.validatorAddress = opts.validatorAddress ?? (process.env["VALIDATOR_ADDRESS"]   ?? "0x0000000000000000000000000000000000000000");
    this.minAmountGst     = opts.minAmountGst     ?? 1_000n;
    this.maxAmountGst     = opts.maxAmountGst     ?? 1_000_000_000_000_000_000_000_000n; // 1e24
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Validate an inbound bridge message.
   * @param msg     The bridge message from the relayer.
   * @param oracle  The state oracle verification result for this message.
   * @param fraudClear  Whether the fraud detector cleared this message.
   * @returns ValidationRecord with the verdict.
   */
  async validate(
    msg:        BridgeMessage,
    oracle:     VerificationResult,
    fraudClear: boolean,
  ): Promise<ValidationRecord> {
    const nowSec = Math.floor(Date.now() / 1000);
    const rec = this.assess(msg, oracle, fraudClear, nowSec);
    this.store(rec);

    if (rec.verdict === "approved") {
      this.recordApproval(nowSec);
      // Submit advisory approval to relay.
      this.submitApproval(msg).catch((err: Error) =>
        console.error("[BridgeValidator] relay submit error:", err.message),
      );
    }

    this.forward(rec).catch((err: Error) =>
      console.error("[BridgeValidator] GhostBrain forward error:", err.message),
    );

    return rec;
  }

  recentRecords(n = 50): ValidationRecord[] {
    return this.records.slice(-n);
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private assess(
    msg:        BridgeMessage,
    oracle:     VerificationResult,
    fraudClear: boolean,
    nowSec:     number,
  ): ValidationRecord {
    const base = {
      msgId:      msg.msgId,
      validator:  this.validatorAddress,
      timestamp:  nowSec,
      amountGst:  msg.amountGst,
      srcChainId: msg.srcChainId,
      dstChainId: msg.dstChainId,
    };

    // Dedup check.
    if (this.processed.has(msg.msgId))
      return { ...base, verdict: "rejected", reason: "already processed" };

    // Settlement authority: at least one side must be GhostChain.
    if (!GHOST_CHAIN_IDS.has(msg.srcChainId) && !GHOST_CHAIN_IDS.has(msg.dstChainId))
      return { ...base, verdict: "rejected", reason: "no GhostChain layer in message path" };

    // Amount bounds.
    if (msg.amountGst < this.minAmountGst)
      return { ...base, verdict: "rejected", reason: "amount below dust threshold" };
    if (msg.amountGst > this.maxAmountGst)
      return { ...base, verdict: "rejected", reason: "amount exceeds circuit breaker ceiling" };

    // State oracle proof check.
    if (!oracle.valid)
      return { ...base, verdict: "rejected", reason: `oracle: ${oracle.reason}` };

    // Fraud detector.
    if (!fraudClear)
      return { ...base, verdict: "deferred", reason: "fraud detector hold" };

    // Rate limit.
    if (!this.underRateLimit(nowSec))
      return { ...base, verdict: "deferred", reason: "approval rate limit exceeded" };

    return { ...base, verdict: "approved", reason: "all checks passed" };
  }

  private underRateLimit(nowSec: number): boolean {
    const cutoff = nowSec - RATE_WINDOW_SEC;
    // Prune old entries.
    while (this.recentApprovals.length > 0 && (this.recentApprovals[0] ?? 0) < cutoff) {
      this.recentApprovals.shift();
    }
    return this.recentApprovals.length < MAX_APPROVALS_PER_WINDOW;
  }

  private recordApproval(nowSec: number): void {
    this.recentApprovals.push(nowSec);
  }

  private store(rec: ValidationRecord): void {
    if (!this.processed.has(rec.msgId) && rec.verdict !== "deferred") {
      this.processed.add(rec.msgId);
    }
    this.records.push(rec);
    if (this.records.length > MAX_RECORDS) this.records.shift();
  }

  private async submitApproval(msg: BridgeMessage): Promise<void> {
    const resp = await fetch(`${this.relayUrl}/relay/bridge/approve`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        chain_id:   L1_CHAIN_ID,
        gas_token:  "GST",
        from:       "ghostbrain-interchain-bridge",
        validator:  this.validatorAddress,
        msgId:      msg.msgId,
        srcChainId: msg.srcChainId,
        dstChainId: msg.dstChainId,
        amountGst:  msg.amountGst.toString(),
        nonce:      msg.nonce,
        timestamp:  Math.floor(Date.now() / 1000),
      }),
    });
    if (!resp.ok) throw new Error(`relay responded ${resp.status}`);
  }

  private async forward(rec: ValidationRecord): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/bridge/validation-record`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        chain_id:   L1_CHAIN_ID,
        gas_token:  "GST",
        ...rec,
        amountGst:  rec.amountGst.toString(),
      }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}
