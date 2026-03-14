/**
 * GhostBrain Cluster — Inter-node HMAC Authentication
 *
 * All cluster messages (gossip + heartbeat) are signed with HMAC-SHA256 so
 * that only peers that share CLUSTER_AUTH_SECRET can participate in the
 * cluster ring.  This prevents an attacker on the same network from:
 *   • Injecting fake peer entries to pollute the peer registry
 *   • Replaying stolen heartbeats to influence leader election
 *   • Splitting the cluster by announcing a fraudulent leader
 *
 * Algorithm : HMAC-SHA256("${ts}:${nodeId}")
 * Headers   : X-Cluster-Timestamp  (Unix ms as string)
 *             X-Cluster-Signature  (lowercase hex)
 *
 * Secret    : CLUSTER_AUTH_SECRET env var.
 *
 * Fail-closed in production: if the secret is set, missing/invalid headers
 * always return 401.  In non-production with no secret the check is skipped
 * (dev convenience) and a one-time warning is emitted.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const CLUSTER_AUTH_SECRET = process.env.CLUSTER_AUTH_SECRET ?? "";
/** Replay-prevention window.  30 s is generous for LAN but small enough to limit exposure. */
const SKEW_MS = 30_000;

let _warnedMissingSecret = false;

// ── Signing ───────────────────────────────────────────────────────────────────

function sign(ts: number, nodeId: string): string {
  return createHmac("sha256", CLUSTER_AUTH_SECRET)
    .update(`${ts}:${nodeId}`)
    .digest("hex");
}

// ── Outbound ──────────────────────────────────────────────────────────────────

/**
 * Build HMAC headers to attach to outgoing cluster HTTP requests.
 * Returns an empty object when no secret is configured (dev only).
 */
export function clusterHmacHeaders(nodeId: string): Record<string, string> {
  if (!CLUSTER_AUTH_SECRET) return {};
  const ts  = Date.now();
  const sig = sign(ts, nodeId);
  return {
    "x-cluster-timestamp": String(ts),
    "x-cluster-signature": sig,
  };
}

// ── Inbound verification ──────────────────────────────────────────────────────

export interface HmacVerifyResult {
  ok:      boolean;
  reason?: string;
}

/**
 * Verify HMAC on an inbound cluster gossip or heartbeat message.
 *
 * @param nodeId    - Sender node ID taken from the already-validated message body.
 * @param sigHeader - Value of X-Cluster-Signature request header (undefined if absent).
 * @param tsHeader  - Value of X-Cluster-Timestamp request header (undefined if absent).
 */
export function verifyClusterHmac(
  nodeId:    string,
  sigHeader: string | undefined,
  tsHeader:  string | undefined,
): HmacVerifyResult {
  // ── Secret absent ──────────────────────────────────────────────────────────
  if (!CLUSTER_AUTH_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "CLUSTER_AUTH_SECRET not configured — refusing cluster message in production" };
    }
    if (!_warnedMissingSecret) {
      _warnedMissingSecret = true;
      console.warn(
        "[cluster-hmac] CLUSTER_AUTH_SECRET is unset — inter-node authentication disabled (dev mode only)",
      );
    }
    return { ok: true }; // open in dev
  }

  // ── Headers absent ────────────────────────────────────────────────────────
  if (!sigHeader || !tsHeader) {
    return { ok: false, reason: "missing_hmac_headers" };
  }

  // ── Timestamp skew ────────────────────────────────────────────────────────
  const ts = parseInt(tsHeader, 10);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > SKEW_MS) {
    return { ok: false, reason: "timestamp_skew_exceeded" };
  }

  // ── Signature comparison (timing-safe) ────────────────────────────────────
  const expected    = sign(ts, nodeId);
  const expectedBuf = Buffer.from(expected, "hex");

  let gotBuf: Buffer;
  try {
    gotBuf = Buffer.from(sigHeader, "hex");
  } catch {
    return { ok: false, reason: "sig_not_hex" };
  }

  if (expectedBuf.length !== gotBuf.length) {
    return { ok: false, reason: "sig_length_mismatch" };
  }

  return timingSafeEqual(expectedBuf, gotBuf)
    ? { ok: true }
    : { ok: false, reason: "sig_mismatch" };
}
