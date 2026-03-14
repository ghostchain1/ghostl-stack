/**
 * GhostBrain Core — HMAC middleware
 *
 * Mirrors the auth scheme used by ghostbrain-gsa/src/security/auth.js so both
 * services can verify each other's outbound calls.
 *
 * Algorithm : HMAC-SHA256 over "${timestamp}:${rawBody}"
 * Headers   : X-HMAC-Timestamp  (Unix ms)
 *             X-HMAC-Signature  (hex)
 * Secret    : CONTROL_PLANE_HMAC_SECRET env var
 *
 * Fail-closed: if the secret is set and the request lacks valid headers → 401.
 * Open-dev:   if NODE_ENV !== 'production' AND secret is not set → pass through.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

const CONTROL_PLANE_SECRET = process.env.CONTROL_PLANE_HMAC_SECRET ?? "";
const SKEW_MS = 5 * 60 * 1_000; // 5-minute replay window

// ── Utilities ─────────────────────────────────────────────────────────────────

export function sign(body: string, ts: number): string {
  if (!CONTROL_PLANE_SECRET) return "";
  return createHmac("sha256", CONTROL_PLANE_SECRET)
    .update(`${ts}:${body}`)
    .digest("hex");
}

/**
 * Build outbound HMAC headers for calls FROM ghostbrain-core TO ghostbrain-gsa.
 */
export function outboundHmacHeaders(body = ""): Record<string, string> {
  const ts = Date.now();
  const sig = sign(body, ts);
  return {
    "content-type":     "application/json",
    "x-hmac-timestamp": String(ts),
    "x-hmac-signature": sig,
    "x-agent-id":       "ghostbrain-core",
  };
}

/**
 * Verify inbound HMAC from ghostbrain-gsa (or any trusted caller).
 */
export function verifyHmac(
  body: string,
  sigHeader: string,
  tsHeader: string,
): { ok: boolean; reason?: string } {
  if (!CONTROL_PLANE_SECRET) return { ok: false, reason: "no_secret_configured" };
  if (!sigHeader || !tsHeader) return { ok: false, reason: "missing_hmac_headers" };

  const ts = parseInt(tsHeader, 10);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > SKEW_MS) {
    return { ok: false, reason: "timestamp_skew_exceeded" };
  }

  const expected = sign(body, ts);
  try {
    const ok = timingSafeEqual(
      Buffer.from(sigHeader.toLowerCase(), "hex"),
      Buffer.from(expected.toLowerCase(), "hex"),
    );
    return ok ? { ok: true } : { ok: false, reason: "signature_mismatch" };
  } catch {
    return { ok: false, reason: "signature_mismatch" };
  }
}

// ── Fastify plugin — register as preHandler hook ──────────────────────────────

/**
 * Register HMAC auth as a Fastify preHandler on /api routes.
 *
 * Skips: /healthz, /status (public read-only probes)
 * Skips: when CONTROL_PLANE_HMAC_SECRET is unset + NODE_ENV !== production
 */
export async function hmacAuthPlugin(app: FastifyInstance): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";

  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split("?")[0];

    // Public endpoints — always skip
    if (path === "/healthz" || path === "/status" || path === "/api/v1/rpc/metrics") return;

    // If no secret configured:
    if (!CONTROL_PLANE_SECRET) {
      if (isProduction) {
        return reply.code(401).send({ ok: false, error: "auth_required" });
      }
      // Dev / test mode — allow unauthenticated
      return;
    }

    // Accept Bearer token (matches control plane secret)
    const auth = req.headers["authorization"] ?? "";
    if (auth.startsWith("Bearer ")) {
      const token = auth.slice(7);
      try {
        const ok = timingSafeEqual(
          Buffer.from(token),
          Buffer.from(CONTROL_PLANE_SECRET),
        );
        if (ok) return;
      } catch { /* fall through to HMAC */ }
    }

    // Accept HMAC
    const rawBody =
      typeof req.body === "string"
        ? req.body
        : req.body != null
          ? JSON.stringify(req.body)
          : "";

    const sig = (req.headers["x-hmac-signature"] as string) ?? "";
    const ts  = (req.headers["x-hmac-timestamp"]  as string) ?? "";
    const result = verifyHmac(rawBody, sig, ts);

    if (!result.ok) {
      return reply.code(401).send({ ok: false, error: result.reason });
    }
  });
}
