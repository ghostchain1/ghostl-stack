/**
 * GhostBrain — Validator Guardian
 *
 * Autonomous recovery agent for degraded GhostChain L1 validators.
 * Drafts governance unjail proposals for human ratification via
 * the signing relay at http://localhost:7910 — never executes
 * on-chain actions unilaterally.
 *
 * Rules enforced per AGENTS.md §7:
 *   - AI may DRAFT proposals, humans must RATIFY them
 *   - Never modify validator quorum without governance
 */

import { request } from "undici";
import {
  getJailedValidators,
  getLowSigningValidators,
} from "./validator_monitor.js";
import { store_event } from "../memory_engine.js";
import { log }         from "../observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const SIGNING_RELAY      = process.env.SIGNING_RELAY_URL      ?? "http://localhost:7910";
const GUARDIAN_INTERVAL  = Number(process.env.GUARDIAN_INTERVAL_MS ?? "60000");
const MIN_SIGNING_TO_ACT = Number(process.env.GUARDIAN_MIN_SIGNING  ?? "0.70"); // act if <70%

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GuardianProposal {
  kind:            "unjail" | "alert_low_signing";
  operatorAddress: string;
  moniker:         string;
  rationale:       string;
  draftedAt:       number;
  status:          "pending_ratification" | "submitted" | "failed";
}

// ── Internal state ─────────────────────────────────────────────────────────────

const _proposals: GuardianProposal[] = [];
/** operatorAddress → last acted at (ms) — cooldown guard */
const _lastActed = new Map<string, number>();
let   _cycleCount = 0;
let   _timer: ReturnType<typeof setInterval> | null = null;

const COOLDOWN_MS = 5 * 60_000; // 5 minutes between proposals per validator

// ── Core loop ─────────────────────────────────────────────────────────────────

async function guardianCycle(): Promise<void> {
  _cycleCount++;
  const now  = Date.now();

  // ── Handle jailed validators ─────────────────────────────────────────────
  const jailed = getJailedValidators();
  for (const v of jailed) {
    const last = _lastActed.get(v.operatorAddress) ?? 0;
    if (now - last < COOLDOWN_MS) continue;

    const proposal: GuardianProposal = {
      kind:            "unjail",
      operatorAddress: v.operatorAddress,
      moniker:         v.moniker,
      rationale:       `Validator ${v.moniker} (${v.operatorAddress}) is jailed. Drafting unjail proposal for human ratification.`,
      draftedAt:       now,
      status:          "pending_ratification",
    };

    await submitProposal(proposal);
    _lastActed.set(v.operatorAddress, now);
  }

  // ── Handle low-signing validators ────────────────────────────────────────
  const lowSigning = getLowSigningValidators(MIN_SIGNING_TO_ACT);
  for (const v of lowSigning) {
    const last = _lastActed.get(v.operatorAddress) ?? 0;
    if (now - last < COOLDOWN_MS) continue;

    const proposal: GuardianProposal = {
      kind:            "alert_low_signing",
      operatorAddress: v.operatorAddress,
      moniker:         v.moniker,
      rationale:       `Validator ${v.moniker} signing rate ${(v.signingRate * 100).toFixed(1)}% — below ${(MIN_SIGNING_TO_ACT * 100).toFixed(0)}% threshold. ${v.missedBlocks} missed blocks.`,
      draftedAt:       now,
      status:          "pending_ratification",
    };

    await submitProposal(proposal);
    _lastActed.set(v.operatorAddress, now);
  }

  if (_cycleCount % 10 === 0) {
    log.debug("validator_guardian: cycle", `cycle=${_cycleCount} proposals=${_proposals.length}`);
  }
}

// ── Proposal submission ───────────────────────────────────────────────────────

async function submitProposal(proposal: GuardianProposal): Promise<void> {
  _proposals.push(proposal);

  try {
    const { statusCode } = await request(`${SIGNING_RELAY}/advisory`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        source:    "validator_guardian",
        kind:      proposal.kind,
        validator: proposal.operatorAddress,
        moniker:   proposal.moniker,
        rationale: proposal.rationale,
        ts:        proposal.draftedAt,
      }),
    });

    if (statusCode >= 200 && statusCode < 300) {
      proposal.status = "submitted";
      log.info("validator_guardian: proposal_submitted", `${proposal.kind} for ${proposal.moniker}`);
    } else {
      proposal.status = "failed";
      log.warn("validator_guardian: relay_error", `HTTP ${statusCode} for ${proposal.moniker}`);
    }
  } catch (err) {
    proposal.status = "failed";
    log.warn("validator_guardian: relay_unreachable", String(err));
  }

  store_event({
    resourceId: proposal.operatorAddress,
    layer:      "validator" as const,
    category:   "governance",
    label:      `guardian_${proposal.kind}`,
    severity:   proposal.kind === "unjail" ? "critical" : "warning",
    payload:    {
      moniker:  proposal.moniker,
      rationale: proposal.rationale,
      status:   proposal.status,
    },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getGuardianProposals(): GuardianProposal[] {
  return [..._proposals];
}

export function getPendingProposals(): GuardianProposal[] {
  return _proposals.filter(p => p.status === "pending_ratification");
}

export function getValidatorGuardianStats() {
  return {
    cycleCount:   _cycleCount,
    intervalMs:   GUARDIAN_INTERVAL,
    totalProposals:   _proposals.length,
    pending:          _proposals.filter(p => p.status === "pending_ratification").length,
    submitted:        _proposals.filter(p => p.status === "submitted").length,
    failed:           _proposals.filter(p => p.status === "failed").length,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startValidatorGuardian(): void {
  if (_timer) return;
  void guardianCycle();
  _timer = setInterval(() => void guardianCycle(), GUARDIAN_INTERVAL);
  log.info("validator_guardian: started", `intervalMs=${GUARDIAN_INTERVAL} relay=${SIGNING_RELAY}`);
}

export function stopValidatorGuardian(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
  log.info("validator_guardian: stopped", "validator guardian halted");
}
