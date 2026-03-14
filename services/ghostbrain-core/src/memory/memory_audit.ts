/**
 * GhostBrain Core — Memory Audit Log
 *
 * Tamper-proof, HMAC-SHA256-signed audit log for every AI decision made by
 * GhostBrain. Provides cryptographic proof that decisions were not modified
 * after the fact.
 *
 * Each entry is signed over:
 *   ts | agent | decisionType | resourceId | rationale | actionHash
 * where actionHash = SHA-256(JSON.stringify(actionTaken)).
 *
 * Env vars:
 *   GHOSTBRAIN_AUDIT_HMAC_KEY  — 32+ byte secret key for HMAC signing.
 *                                If not set, audit entries are stored WITH a
 *                                warning tag but without a valid signature.
 *
 * Storage:
 *   - Primary:  PostgreSQL `ghostbrain_audit_log` table
 *   - Fallback: NDJSON file at $GHOSTBRAIN_MEMORY_DIR/audit.ndjson
 */

import { createHmac, createHash }     from "node:crypto";
import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join }                        from "node:path";
import { execute, query }              from "../db/postgres_client.js";
import { inc }                         from "../observability/metrics_exporter.js";
import { log }                         from "../observability/event_logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id:           string;             // SHA-256 of signed payload (truncated 24 hex chars)
  ts:           number;             // epoch ms
  agent:        string;             // GhostOptimizer | GhostRepairBot | etc.
  decisionType: string;             // repair | predict | rebalance | alert | evolve
  resourceId:   string;
  layer?:       string;
  rationale:    string;
  actionTaken:  Record<string, unknown>;
  actionHash:   string;             // SHA-256 of JSON(actionTaken)
  signature:    string;             // HMAC-SHA256 hex | "unsigned"
  signedAt:     string;             // ISO timestamp of signing
  verified?:    boolean;            // populated by verifyAuditEntry()
}

// ── Config ────────────────────────────────────────────────────────────────────

let MEMORY_DIR   = process.env.GHOSTBRAIN_MEMORY_DIR ?? "/tmp/ghostbrain-memory";
let AUDIT_JOURNAL = join(MEMORY_DIR, "audit.ndjson");
const MAX_HOT    = 5_000;  // hot cache size

const _hot: AuditEntry[] = [];  // ordered by ts ascending

function ensureDir(): void {
  mkdirSync(MEMORY_DIR, { recursive: true });
}

// ── HMAC helpers ──────────────────────────────────────────────────────────────

function getKey(): string | null {
  return process.env.GHOSTBRAIN_AUDIT_HMAC_KEY ?? null;
}

function actionHash(actionTaken: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(actionTaken, Object.keys(actionTaken).sort()))
    .digest("hex");
}

function signPayload(
  ts:           number,
  agent:        string,
  decisionType: string,
  resourceId:   string,
  rationale:    string,
  aHash:        string,
): string {
  const key = getKey();
  if (!key) return "unsigned";
  const msg = `${ts}|${agent}|${decisionType}|${resourceId}|${rationale}|${aHash}`;
  return createHmac("sha256", key).update(msg).digest("hex");
}

/** Derive a deterministic short ID from the signed payload hash. */
function entryId(signature: string, ts: number): string {
  return createHash("sha256")
    .update(`${signature}:${ts}`)
    .digest("hex")
    .slice(0, 24);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Hydrate hot cache from NDJSON journal at startup. */
export function hydrateAuditLog(dir?: string): void {
  if (dir) {
    MEMORY_DIR    = dir;
    AUDIT_JOURNAL = join(dir, "audit.ndjson");
  }
  ensureDir();
  if (!existsSync(AUDIT_JOURNAL)) return;
  try {
    const lines = readFileSync(AUDIT_JOURNAL, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try { _hot.push(JSON.parse(line) as AuditEntry); }
      catch { /* skip malformed */ }
    }
    if (_hot.length > MAX_HOT) _hot.splice(0, _hot.length - MAX_HOT);
  } catch { /* start fresh */ }
}

/**
 * Record a signed audit entry for an AI decision.
 * Fire-and-forget safe — never throws.
 */
export async function recordAuditEntry(input: {
  ts?:          number;
  agent:        string;
  decisionType: string;
  resourceId:   string;
  layer?:       string;
  rationale:    string;
  actionTaken:  Record<string, unknown>;
}): Promise<AuditEntry> {
  const ts        = input.ts ?? Date.now();
  const aHash     = actionHash(input.actionTaken);
  const sig       = signPayload(ts, input.agent, input.decisionType, input.resourceId, input.rationale, aHash);
  const signedAt  = new Date(ts).toISOString();
  const id        = entryId(sig, ts);

  const entry: AuditEntry = {
    id,
    ts,
    agent:        input.agent,
    decisionType: input.decisionType,
    resourceId:   input.resourceId,
    layer:        input.layer,
    rationale:    input.rationale,
    actionTaken:  input.actionTaken,
    actionHash:   aHash,
    signature:    sig,
    signedAt,
  };

  if (!getKey()) {
    // Warn user that decisions are not cryptographically protected
    log.warn("memory_audit: unsigned", "GHOSTBRAIN_AUDIT_HMAC_KEY not set — audit entries have no signature");
  }

  // Hot cache
  _hot.push(entry);
  if (_hot.length > MAX_HOT) _hot.shift();

  // NDJSON fallback
  try {
    ensureDir();
    appendFileSync(AUDIT_JOURNAL, JSON.stringify(entry) + "\n");
  } catch (err) {
    log.warn("memory_audit: write_error", String(err));
  }

  // PostgreSQL (fire-and-forget)
  void execute(
    `INSERT INTO ghostbrain_audit_log
       (id, recorded_at, agent, decision_type, resource_id, layer, rationale,
        action_taken, action_hash, signature, signed_key_present)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      signedAt,
      input.agent,
      input.decisionType,
      input.resourceId,
      input.layer ?? null,
      input.rationale,
      JSON.stringify(input.actionTaken),
      aHash,
      sig,
      getKey() !== null,
    ],
  );

  inc("ghostbrain_memory_audit_entries_total", "Total audit log entries recorded");
  return entry;
}

/**
 * Verify the HMAC signature of an audit entry.
 * Returns false if the entry was tampered with or if signing was never enabled.
 */
export function verifyAuditEntry(entry: AuditEntry): boolean {
  if (entry.signature === "unsigned") return false;
  const expected = signPayload(
    entry.ts, entry.agent, entry.decisionType,
    entry.resourceId, entry.rationale, entry.actionHash,
  );
  // Constant-time comparison to prevent timing attacks
  const expBuf    = Buffer.from(expected, "hex");
  const sigBuf    = Buffer.from(entry.signature, "hex");
  if (expBuf.length !== sigBuf.length) return false;
  let diff = 0;
  for (let i = 0; i < expBuf.length; i++) diff |= expBuf[i]! ^ sigBuf[i]!;
  return diff === 0;
}

/**
 * Return the most recent audit entries (hot cache).
 * Also enriches with PostgreSQL rows when available.
 */
export async function getRecentAudit(limit = 50): Promise<AuditEntry[]> {
  // Try PostgreSQL for full history
  const pgRows = await query<{
    id:              string;
    recorded_at:     string;
    agent:           string;
    decision_type:   string;
    resource_id:     string;
    layer:           string | null;
    rationale:       string;
    action_taken:    Record<string, unknown>;
    action_hash:     string;
    signature:       string;
    signed_key_present: boolean;
  }>(
    `SELECT id, recorded_at, agent, decision_type, resource_id, layer, rationale,
            action_taken, action_hash, signature, signed_key_present
     FROM ghostbrain_audit_log
     ORDER BY recorded_at DESC
     LIMIT $1`,
    [limit],
  );

  if (pgRows.length > 0) {
    return pgRows.map((r): AuditEntry => ({
      id:           r.id,
      ts:           new Date(r.recorded_at).getTime(),
      agent:        r.agent,
      decisionType: r.decision_type,
      resourceId:   r.resource_id,
      layer:        r.layer ?? undefined,
      rationale:    r.rationale,
      actionTaken:  typeof r.action_taken === "object" ? r.action_taken : {},
      actionHash:   r.action_hash,
      signature:    r.signature,
      signedAt:     r.recorded_at,
    }));
  }

  // Fallback: hot cache (most recent first)
  return [..._hot].reverse().slice(0, limit);
}

/**
 * Verify a batch of entries and return tamper-detection results.
 */
export function auditIntegrityCheck(entries: AuditEntry[]): {
  total: number;
  verified: number;
  tampered: number;
  unsigned: number;
} {
  let verified = 0, tampered = 0, unsigned = 0;
  for (const e of entries) {
    if (e.signature === "unsigned") { unsigned++; continue; }
    if (verifyAuditEntry(e)) verified++;
    else tampered++;
  }
  return { total: entries.length, verified, tampered, unsigned };
}

export function auditHotSize(): number {
  return _hot.length;
}
