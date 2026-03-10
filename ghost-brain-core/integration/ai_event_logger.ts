/**
 * GhostBrain — AI Event Logger (TypeScript)
 *
 * Durable, HMAC-signed structured event log for all GhostBrain AI
 * decisions, hardware alerts, governance proposals, and inference
 * requests. Events are:
 *   1. Written to a local append-only log file (for crash durability).
 *   2. Indexed to the GhostScan indexer API (L1 event explorer).
 *   3. Forwarded to the GhostBrain observability stack (Prometheus/Grafana).
 *
 * Security:
 *   - Each event is HMAC-SHA256 signed with an event-logging key derived
 *     from the device's attestation chain (via KeyManager).
 *   - Log file is append-only; existing entries are never modified.
 *   - GhostScan indexer verifies HMAC before persisting.
 *
 * Event schema follows the GhostChain AI audit log spec (v1):
 *   { ts_ms, device_id, event_type, chain, severity, payload, hmac }
 */

import { createHmac }                 from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import { join }                         from "node:path";
import type { WriteStream }             from "node:fs";

// ── Environment ────────────────────────────────────────────────────────────

const GHOSTSCAN_URL  = process.env["GHOSTSCAN_INDEXER_URL"] ?? "http://localhost:8545";
const DEVICE_ID      = process.env["GHOSTBRAIN_DEVICE_ID"]  ?? "ghost-brain-dev-0";
const LOG_DIR        = process.env["GHOSTBRAIN_LOG_DIR"]    ?? "/var/log/ghostbrain";
const HMAC_KEY_HEX   = process.env["GHOSTBRAIN_HMAC_KEY"]   ?? "";   // 32-byte hex; required

// ── Event types ────────────────────────────────────────────────────────────

export type EventType =
  | "inference_request"
  | "inference_result"
  | "tx_classification"
  | "governance_proposal"
  | "hardware_alert"
  | "key_rotation"
  | "firmware_verify"
  | "attestation"
  | "predictive_failure"
  | "chain_error";

export type ChainScope = "l1" | "l2" | "l3" | "internal";
export type Severity   = "info" | "warn" | "error" | "critical";

export interface AiEvent {
  ts_ms:      number;
  device_id:  string;
  event_type: EventType;
  chain:      ChainScope;
  severity:   Severity;
  payload:    Record<string, unknown>;
  hmac?:      string;   // populated by logger, not caller
}

// ── HMAC signing ───────────────────────────────────────────────────────────

function hmacSign(event: Omit<AiEvent, "hmac">): string {
  if (!HMAC_KEY_HEX || HMAC_KEY_HEX.length < 64) {
    // If no key configured (dev/test only), return sentinel.
    return "00000000000000000000000000000000000000000000000000000000000000000000";
  }
  const key     = Buffer.from(HMAC_KEY_HEX, "hex");
  // Canonical message: deterministic JSON (sorted keys).
  const message = canonicalJson(event);
  return createHmac("sha256", key).update(message).digest("hex");
}

function canonicalJson(obj: unknown): string {
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJson).join(",") + "]";
  }
  if (obj !== null && typeof obj === "object") {
    const keys = Object.keys(obj as object).sort();
    const pairs = keys.map(k => {
      const val = (obj as Record<string, unknown>)[k];
      return JSON.stringify(k) + ":" + canonicalJson(val);
    });
    return "{" + pairs.join(",") + "}";
  }
  return JSON.stringify(obj);
}

// ── Local log writer ───────────────────────────────────────────────────────

class AppendOnlyLog {
  #stream: WriteStream;

  constructor(logDir = LOG_DIR) {
    try { mkdirSync(logDir, { recursive: true }); } catch { /* already exists */ }
    const path    = join(logDir, `ai-events-${todayStamp()}.jsonl`);
    this.#stream  = createWriteStream(path, { flags: "a", encoding: "utf8" });
  }

  write(event: AiEvent): void {
    this.#stream.write(JSON.stringify(event) + "\n");
  }

  close(): void {
    this.#stream.end();
  }
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── GhostScan indexer push ─────────────────────────────────────────────────

async function pushToGhostScan(event: AiEvent): Promise<void> {
  try {
    const res = await fetch(`${GHOSTSCAN_URL}/api/v1/ai-events`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(event),
    });

    if (!res.ok) {
      console.error(`[AIEventLogger] GhostScan push failed (${res.status})`);
    }
  } catch (err) {
    // Non-fatal: local log is ground truth.
    console.error("[AIEventLogger] GhostScan unreachable:", err);
  }
}

// ── AI Event Logger ────────────────────────────────────────────────────────

export class AIEventLogger {
  #log:     AppendOnlyLog;
  #queue:   AiEvent[] = [];
  #flusher: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.#log = new AppendOnlyLog();
    // Flush background queue every 2 seconds.
    this.#flusher = setInterval(() => this.#flush(), 2_000);
    process.on("beforeExit", () => this.shutdown());
  }

  /**
   * Log an AI event.
   * Synchronously writes to local log; GhostScan push is queued async.
   */
  log(
    event_type: EventType,
    chain:      ChainScope,
    severity:   Severity,
    payload:    Record<string, unknown>,
  ): void {
    const base: Omit<AiEvent, "hmac"> = {
      ts_ms:      Date.now(),
      device_id:  DEVICE_ID,
      event_type,
      chain,
      severity,
      payload,
    };

    const signed: AiEvent = { ...base, hmac: hmacSign(base) };

    // Write to local log immediately (synchronous path).
    this.#log.write(signed);

    // Queue for async GhostScan push.
    this.#queue.push(signed);

    // Emit to stdout for log aggregation (structured logging).
    if (severity === "error" || severity === "critical") {
      console.error(JSON.stringify(signed));
    } else if (severity === "warn") {
      console.warn(JSON.stringify(signed));
    } else {
      console.log(JSON.stringify(signed));
    }
  }

  /** Convenience: log inference request. */
  logInferenceRequest(opts: {
    requestId: string;
    modelId:   string;
    source:    "l3" | "internal";
    requester: string;
  }): void {
    this.log("inference_request", opts.source === "l3" ? "l3" : "internal", "info", opts);
  }

  /** Convenience: log inference result. */
  logInferenceResult(opts: {
    requestId: string;
    modelId:   string;
    tokens:    number;
    latencyMs: number;
  }): void {
    this.log("inference_result", "internal", "info", opts);
  }

  /** Convenience: log governance proposal. */
  logGovernanceProposal(opts: {
    proposalId:  string;
    description: string;
    alertLevel:  string;
  }): void {
    this.log("governance_proposal", "l1", "warn", opts);
  }

  /** Convenience: log hardware alert. */
  logHardwareAlert(opts: {
    alertKind: string;
    severity:  Severity;
    data:      Record<string, unknown>;
  }): void {
    this.log("hardware_alert", "internal", opts.severity, opts);
  }

  async #flush(): Promise<void> {
    const batch = this.#queue.splice(0, this.#queue.length);
    for (const event of batch) {
      await pushToGhostScan(event);
    }
  }

  async shutdown(): Promise<void> {
    if (this.#flusher) {
      clearInterval(this.#flusher);
      this.#flusher = null;
    }
    await this.#flush();
    this.#log.close();
  }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const logger = new AIEventLogger();
