/**
 * GhostBrain — Chain Audit Log
 *
 * Records every infrastructure decision (SimOutcome) that GhostBrain evaluates
 * to a durable, append-only audit trail with two transport layers:
 *
 *   1. Local JSONL file  — always enabled; one JSON object per line, rotated
 *      at AUDIT_MAX_FILE_BYTES (default 50 MB). Survives network outages.
 *
 *   2. HTTP webhook      — optional; POST the serialised event to
 *      AUDIT_WEBHOOK_URL if configured. Operators route this to:
 *        - a GhostBrain audit relay microservice
 *        - a ghost_sendRawTransaction proxy that writes calldata to L2
 *        - any compatible log aggregation endpoint
 *
 * Chain routing law honoured: events touch L2 first, never L1 directly.
 * On-chain submission is performed by the webhook target; GhostBrain Core
 * does not hold or manage private keys — it only signs the event payload
 * with a local HMAC for integrity verification at the receiving end.
 *
 * In-memory ring (AUDIT_RING_SIZE, default 500) is available for the
 * /api/v1/simulator/audit/history HTTP route.
 *
 * Exports:
 *   recordAuditEvent(outcome)   — async, non-blocking; fires and forgets
 *   getAuditHistory(limit)      — last N events from ring
 *   auditStats()                — counters
 */

import { createHmac }   from "node:crypto";
import { appendFile }   from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { resolve }      from "node:path";
import { request }      from "undici";
import { inc, set }     from "../observability/metrics_exporter.js";
import type { SimOutcome, SimVerdict } from "../simulator/sim_model.js";

// ── Config ────────────────────────────────────────────────────────────────────

const AUDIT_ENABLED      = process.env.AUDIT_ENABLED           !== "false";
const AUDIT_DIR          = process.env.AUDIT_LOG_DIR           ?? "/tmp/ghostbrain-audit";
const AUDIT_MAX_BYTES    = Number(process.env.AUDIT_MAX_FILE_BYTES ?? String(50 * 1024 * 1024));
const AUDIT_WEBHOOK_URL  = process.env.AUDIT_WEBHOOK_URL;        // optional
const AUDIT_HMAC_SECRET  = process.env.AUDIT_HMAC_SECRET        ?? "ghostbrain-audit-secret";
const AUDIT_RING_SIZE    = Number(process.env.AUDIT_RING_SIZE   ?? "500");
const AUDIT_TIMEOUT_MS   = Number(process.env.AUDIT_TIMEOUT_MS  ?? "3000");

/** L2 chain ID for audit tag (chain routing law: L3 → L2 → L1). */
const L2_CHAIN_ID        = Number(process.env.GHOSTCHAIN_L2_CHAIN_ID ?? "901");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  /** Monotonic sequence number for gap detection. */
  seq:            number;
  ts:             number;    // Unix ms
  chainId:        number;    // L2 chain ID (901)
  verdict:        SimVerdict;
  actionType:     string;
  targetId:       string;
  requestedBy:    string;
  urgency:        string;
  confidence:     number;   // 0–100
  riskCount:      number;
  maxRiskSeverity: string | null;
  verdictReason:  string;
  /** SHA-256 HMAC of the canonical fields — for integrity verification. */
  hmac:           string;
  /** Full SimOutcome, only included when AUDIT_INCLUDE_FULL_OUTCOME=true */
  outcome?:       SimOutcome;
}

// ── State ─────────────────────────────────────────────────────────────────────

let _seq          = 0;
let _totalEmitted = 0;
let _fileErrors   = 0;
let _webhookErrors= 0;
let _webhookOk    = 0;

const _ring: AuditEvent[] = [];
let   _currentFile: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMaxRiskSeverity(outcome: SimOutcome): string | null {
  const order = ["low", "medium", "high", "critical"];
  let max = -1;
  for (const r of outcome.risks) {
    const idx = order.indexOf(r.severity);
    if (idx > max) max = idx;
  }
  return max >= 0 ? order[max]! : null;
}

function buildHmac(event: Omit<AuditEvent, "hmac">): string {
  const canonical = [
    event.seq,
    event.ts,
    event.chainId,
    event.verdict,
    event.actionType,
    event.targetId,
    event.requestedBy,
    event.urgency,
    event.confidence,
    event.riskCount,
    event.verdictReason,
  ].join("|");
  return createHmac("sha256", AUDIT_HMAC_SECRET).update(canonical).digest("hex");
}

function currentLogPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return resolve(AUDIT_DIR, `audit-${date}.jsonl`);
}

async function rotateIfNeeded(path: string): Promise<void> {
  try {
    if (existsSync(path) && statSync(path).size > AUDIT_MAX_BYTES) {
      // Rotate: rename current file with timestamp suffix
      const { rename } = await import("node:fs/promises");
      await rename(path, path.replace(".jsonl", `.${Date.now()}.jsonl`));
    }
  } catch { /* non-fatal */ }
}

async function writeToFile(event: AuditEvent): Promise<void> {
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(AUDIT_DIR, { recursive: true });
    const path = currentLogPath();
    await rotateIfNeeded(path);
    _currentFile = path;
    await appendFile(path, JSON.stringify(event) + "\n", "utf8");
  } catch (err) {
    _fileErrors++;
    inc("ghostbrain_audit_file_errors_total", "Audit JSONL write errors", 1);
  }
}

async function postToWebhook(event: AuditEvent): Promise<void> {
  if (!AUDIT_WEBHOOK_URL) return;
  try {
    const body = JSON.stringify({
      ...event,
      // Include routing hint for the webhook target
      _meta: {
        service:   "ghostbrain-core",
        l2ChainId: L2_CHAIN_ID,
        // Chain routing law: L3 → L2 → L1 — webhook should route to L2
        targetChain: "l2",
      },
    });
    const res = await request(AUDIT_WEBHOOK_URL, {
      method:      "POST",
      headers:     {
        "content-type": "application/json",
        "x-ghostbrain-hmac": event.hmac,
        "x-ghostbrain-seq":  String(event.seq),
      },
      body,
      bodyTimeout:   AUDIT_TIMEOUT_MS,
      headersTimeout: AUDIT_TIMEOUT_MS,
    });
    if (res.statusCode >= 200 && res.statusCode < 300) {
      _webhookOk++;
      inc("ghostbrain_audit_webhook_ok_total", "Audit webhook successful deliveries");
    } else {
      _webhookErrors++;
      inc("ghostbrain_audit_webhook_errors_total", "Audit webhook delivery errors");
    }
    // Drain body to avoid socket leak
    await res.body.dump();
  } catch {
    _webhookErrors++;
    inc("ghostbrain_audit_webhook_errors_total", "Audit webhook delivery errors");
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a SimOutcome to the audit log.
 * Fire-and-forget — callers should NOT await this in hot paths.
 */
export function recordAuditEvent(outcome: SimOutcome): void {
  if (!AUDIT_ENABLED) return;

  const incFull = process.env.AUDIT_INCLUDE_FULL_OUTCOME === "true";
  const event: AuditEvent = {
    seq:             ++_seq,
    ts:              Date.now(),
    chainId:         L2_CHAIN_ID,
    verdict:         outcome.verdict,
    actionType:      outcome.action.type,
    targetId:        outcome.action.targetId,
    requestedBy:     outcome.action.requestedBy,
    urgency:         outcome.action.urgency,
    confidence:      outcome.confidence,
    riskCount:       outcome.risks.length,
    maxRiskSeverity: getMaxRiskSeverity(outcome),
    verdictReason:   outcome.verdictReason,
    hmac:            "",
    ...(incFull ? { outcome } : {}),
  };
  event.hmac = buildHmac(event);

  // In-memory ring
  _ring.push(event);
  if (_ring.length > AUDIT_RING_SIZE) _ring.shift();

  _totalEmitted++;
  inc("ghostbrain_audit_events_total", "Total audit events recorded", 1, { verdict: outcome.verdict });
  set("ghostbrain_audit_seq",          "Current audit sequence number", _seq);
  set("ghostbrain_audit_ring_size",    "Audit in-memory ring size",     _ring.length);

  // Background I/O — do not block caller
  void Promise.allSettled([
    writeToFile(event),
    postToWebhook(event),
  ]);
}

/** Return the last N audit events from the in-memory ring (most recent last). */
export function getAuditHistory(limit = 100): AuditEvent[] {
  return _ring.slice(-Math.min(limit, AUDIT_RING_SIZE));
}

export function auditStats() {
  return {
    enabled:       AUDIT_ENABLED,
    totalEmitted:  _totalEmitted,
    seq:           _seq,
    ringSize:      _ring.length,
    fileErrors:    _fileErrors,
    webhookOk:     _webhookOk,
    webhookErrors: _webhookErrors,
    currentFile:   _currentFile,
    webhookConfigured: !!AUDIT_WEBHOOK_URL,
    l2ChainId:     L2_CHAIN_ID,
  };
}
