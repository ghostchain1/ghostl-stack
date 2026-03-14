/**
 * GhostBrain Self-Evolution Engine — Rollback Engine
 *
 * Reverts a staged evolution attempt by:
 *   1. Removing the isolated staging directory for the task (via PatchBuilder).
 *   2. Notifying the signing relay so the pending proposal (if any) is voided.
 *
 * The rollback engine does NOT touch any production source file.
 * It only cleans up artefacts inside the staging/sandbox directories and
 * sends a cancellation notice to the relay.
 *
 * SECURITY INVARIANTS
 * -------------------
 * 1. taskId is validated as UUID before use in paths or relay payload.
 * 2. SIGNING_RELAY_URL is taken from environment — never user-supplied.
 * 3. fetch() uses AbortController timeout.
 * 4. No filesystem paths outside the staging base are touched.
 */

import type { RollbackResult } from "../types.js";
import { PatchBuilder } from "../generator/patch_builder.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RELAY_URL = (
  process.env["SIGNING_RELAY_URL"] ?? "http://localhost:7910"
).replace(/\/$/, "");

const NOTIFY_TIMEOUT_MS = parseInt(
  process.env["EVOLUTION_ROLLBACK_TIMEOUT_MS"] ?? "8000", 10,
);

/** UUID v4 pattern — only accepted shape for task IDs. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// RollbackEngine
// ---------------------------------------------------------------------------

export class RollbackEngine {
  private readonly patchBuilder: PatchBuilder;

  constructor(patchBuilder?: PatchBuilder) {
    this.patchBuilder = patchBuilder ?? new PatchBuilder();
  }

  /**
   * Roll back a staged task.
   *
   * @param taskId         Task to roll back (must be a valid UUID).
   * @param relayPendingId Optional relay pending ID to void.  If empty,
   *                       relay notification is skipped.
   * @param reason         Human-readable reason for rollback (e.g. test failure).
   */
  async rollback(
    taskId:         string,
    relayPendingId: string,
    reason:         string,
  ): Promise<RollbackResult> {
    const now = Date.now();

    if (!UUID_RE.test(taskId)) {
      return {
        taskId,
        stagingCleaned:  false,
        relayNotified:   false,
        error:           `invalid taskId format: "${taskId}"`,
        rolledBackAt:    now,
      };
    }

    // Step 1: clean the staging directory.
    let stagingCleaned = false;
    let cleanError: string | undefined;
    try {
      await this.patchBuilder.clean(taskId);
      stagingCleaned = true;
    } catch (err) {
      cleanError = err instanceof Error ? err.message : String(err);
    }

    // Step 2: notify the signing relay (fire-and-forget if no pendingId).
    let relayNotified = false;
    let notifyError: string | undefined;

    if (relayPendingId.length > 0) {
      const ctl = new AbortController();
      const tid = setTimeout(() => ctl.abort(), NOTIFY_TIMEOUT_MS);
      try {
        const res = await fetch(`${RELAY_URL}/relay/evolution/cancel`, {
          method:  "POST",
          signal:  ctl.signal,
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            pending_id: relayPendingId,
            task_id:    taskId,
            reason:     reason.slice(0, 500), // cap length — no unbounded relay payloads
          }),
        });
        clearTimeout(tid);
        relayNotified = res.ok;
        if (!res.ok) {
          notifyError = `relay returned HTTP ${res.status}`;
        }
      } catch (err) {
        clearTimeout(tid);
        notifyError = err instanceof Error ? err.message : String(err);
      }
    }

    const combinedError =
      [cleanError, notifyError].filter(Boolean).join("; ") || undefined;

    return {
      taskId,
      stagingCleaned,
      relayNotified,
      error:        combinedError,
      rolledBackAt: now,
    };
  }
}
