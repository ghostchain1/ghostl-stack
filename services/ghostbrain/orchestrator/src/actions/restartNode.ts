/**
 * actions/restartNode.ts — Restart a GhostChain node container.
 *
 * SECURITY:
 *   - Container name validated against allowlist before any Docker API call
 *   - Uses Docker HTTP API (containerManager), never exec/shell
 *   - Per-node cooldown prevents restart storms
 *   - Callers must hold a valid HMAC token (enforced in server.ts middleware)
 */

import { restartContainer } from "../orchestrator/containerManager.js";
import { THRESHOLDS } from "../config.js";
import type { ActionResult } from "../types.js";

// ── Cooldown tracking ─────────────────────────────────────────────────────────

const _lastRestart = new Map<string, number>();

function isOnCooldown(containerName: string): boolean {
  const last = _lastRestart.get(containerName);
  if (!last) return false;
  return Date.now() - last < THRESHOLDS.restartCooldownMs;
}

// ── Exported action ───────────────────────────────────────────────────────────

/**
 * Restart a node container by name.
 *
 * @param containerName  Exact Docker container name (e.g. "ghostchain-l1" or "ghost-exec-l2")
 * @returns ActionResult indicating success or failure
 */
export async function restartNode(containerName: string): Promise<ActionResult> {
  const start = Date.now();

  if (isOnCooldown(containerName)) {
    const elapsed = Math.round((Date.now() - (_lastRestart.get(containerName) ?? 0)) / 1_000);
    return {
      ok:         false,
      message:    `Container "${containerName}" is on restart cooldown (${elapsed}s elapsed, wait ${Math.round(THRESHOLDS.restartCooldownMs / 1_000)}s)`,
      durationMs: Date.now() - start,
      timestamp:  Date.now(),
    };
  }

  const { ok, message } = await restartContainer(containerName);

  if (ok) {
    _lastRestart.set(containerName, Date.now());
  }

  return {
    ok,
    message,
    durationMs: Date.now() - start,
    timestamp:  Date.now(),
  };
}
