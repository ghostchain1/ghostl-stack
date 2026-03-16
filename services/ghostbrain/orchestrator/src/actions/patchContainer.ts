/**
 * actions/patchContainer.ts — Pull the latest image for a container + recreate.
 *
 * "Patching" in this context means:
 *   1. Pull the latest version of the container's image via Docker HTTP API
 *   2. Stop the current container
 *   3. Restart it (Docker restarts with the same config, picking up the new image)
 *
 * SECURITY:
 *   - Container name validated before any Docker API call
 *   - Image name and tag validated before pull (allowlist pattern)
 *   - Uses Docker HTTP API (undici), never exec/shell
 *   - Callers must hold a valid HMAC token (enforced in server.ts)
 */

import { request } from "undici";
import { DOCKER_SOCKET, THRESHOLDS } from "../config.js";
import { inspectContainer, restartContainer } from "../orchestrator/containerManager.js";
import type { ActionResult } from "../types.js";

// ── Validation ────────────────────────────────────────────────────────────────

/** Allow only safe image references: registry/name:tag or name:tag. */
const IMAGE_RE = /^[a-z0-9][a-z0-9.\-_/]{0,255}(:[a-zA-Z0-9.\-_]{1,128})?$/;

function assertValidImage(image: string): void {
  if (!IMAGE_RE.test(image)) {
    throw new Error(`Invalid image reference: "${image}"`);
  }
}

// ── Docker image pull ─────────────────────────────────────────────────────────

function resolveSocketPath(s: string): { origin: string; socketPath?: string } {
  if (s.startsWith("unix://")) return { origin: "http://localhost", socketPath: s.replace("unix://", "") };
  return { origin: s };
}

async function pullImage(image: string): Promise<{ ok: boolean; message: string }> {
  assertValidImage(image);

  const { origin, socketPath } = resolveSocketPath(DOCKER_SOCKET);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 60_000); // image pull can be slow

  try {
    const { statusCode } = await request(
      `${origin}/images/create?fromImage=${encodeURIComponent(image)}`,
      {
        method: "POST",
        // @ts-expect-error undici socketPath support
        socketPath,
        signal: ac.signal,
      },
    );
    return {
      ok:      statusCode >= 200 && statusCode < 300,
      message: statusCode >= 200 && statusCode < 300 ? `Pulled "${image}"` : `Pull failed (HTTP ${statusCode})`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ── Exported action ───────────────────────────────────────────────────────────

/**
 * Pull the latest image for `containerName` and restart the container.
 *
 * @param containerName  Docker container name (validated before use)
 */
export async function patchContainer(containerName: string): Promise<ActionResult> {
  const start = Date.now();

  // 1. Inspect to get current image
  const info = await inspectContainer(containerName);
  if (!info) {
    return {
      ok:         false,
      message:    `Container "${containerName}" not found`,
      durationMs: Date.now() - start,
      timestamp:  Date.now(),
    };
  }

  const image: string = (info as { Config?: { Image?: string } }).Config?.Image ?? "";
  if (!image) {
    return {
      ok:         false,
      message:    `Could not determine image for container "${containerName}"`,
      durationMs: Date.now() - start,
      timestamp:  Date.now(),
    };
  }

  // 2. Pull latest image
  const pull = await pullImage(image);
  if (!pull.ok) {
    return {
      ok:         false,
      message:    `Image pull failed: ${pull.message}`,
      durationMs: Date.now() - start,
      timestamp:  Date.now(),
    };
  }

  // 3. Restart container (picks up new image)
  const restart = await restartContainer(containerName);

  return {
    ok:         restart.ok,
    message:    restart.ok
      ? `Patched "${containerName}": pulled "${image}" and restarted`
      : `Pulled image but restart failed: ${restart.message}`,
    durationMs: Date.now() - start,
    timestamp:  Date.now(),
  };
}
