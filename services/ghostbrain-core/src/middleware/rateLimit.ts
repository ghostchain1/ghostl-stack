/**
 * GhostBrain Core — Rate-limit middleware
 *
 * Sliding-window in-memory rate limiter implemented as a Fastify plugin.
 *
 * Limits:
 *  - Per-agent (X-Agent-Id): 100 requests / 60 s
 *  - Global:                 500 requests / 60 s
 *
 * Returns 429 Too Many Requests with Retry-After and X-RateLimit-* headers
 * when either bucket is exhausted.
 *
 * Applied only to /api routes (skips /healthz, /status probes).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

// ── Configuration (overridable via env) ───────────────────────────────────────

const WINDOW_MS         = Number(process.env.RATE_LIMIT_WINDOW_MS   ?? 60_000);  // 60 s
const PER_AGENT_LIMIT   = Number(process.env.RATE_LIMIT_PER_AGENT   ?? 100);
const GLOBAL_LIMIT      = Number(process.env.RATE_LIMIT_GLOBAL      ?? 500);

// ── Sliding-window bucket ─────────────────────────────────────────────────────

interface Bucket {
  count:      number;
  windowStart: number;
}

const agentBuckets = new Map<string, Bucket>();
let   globalBucket: Bucket = { count: 0, windowStart: Date.now() };

/** Advance or reset a bucket for the current window. Returns the updated count. */
function tick(bucket: Bucket): number {
  const now = Date.now();
  if (now - bucket.windowStart >= WINDOW_MS) {
    bucket.count       = 1;
    bucket.windowStart = now;
  } else {
    bucket.count++;
  }
  return bucket.count;
}

/** Remaining seconds until the current window expires. */
function retryAfter(bucket: Bucket): number {
  const elapsed = Date.now() - bucket.windowStart;
  return Math.ceil((WINDOW_MS - elapsed) / 1_000);
}

/**
 * Evict stale buckets periodically to prevent unbounded map growth.
 * Runs every 5 minutes; safe to call frequently because it is O(n) with a
 * low constant (only cold agents accumulate — active ones are always fresh).
 */
function evictStale(): void {
  const cutoff = Date.now() - WINDOW_MS * 2;
  for (const [id, b] of agentBuckets) {
    if (b.windowStart < cutoff) agentBuckets.delete(id);
  }
}
setInterval(evictStale, 5 * 60_000).unref();

// ── Fastify plugin ─────────────────────────────────────────────────────────────

function getOrCreate(agentId: string): Bucket {
  let b = agentBuckets.get(agentId);
  if (!b) {
    b = { count: 0, windowStart: Date.now() };
    agentBuckets.set(agentId, b);
  }
  return b;
}

function sendTooManyRequests(
  reply: FastifyReply,
  retryAfterSec: number,
  scope: "agent" | "global",
  limit: number,
): void {
  reply
    .code(429)
    .headers({
      "retry-after":          String(retryAfterSec),
      "x-ratelimit-limit":    String(limit),
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset":    String(Math.ceil(Date.now() / 1_000) + retryAfterSec),
    })
    .send({
      error:   "rate_limit_exceeded",
      scope,
      message: `Too many requests — retry after ${retryAfterSec}s`,
    });
}

export async function rateLimitPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    // Only rate-limit /api/* routes
    if (!req.url.startsWith("/api")) return;

    // ── Global bucket ──────────────────────────────────────────────────────
    const globalCount = tick(globalBucket);
    if (globalCount > GLOBAL_LIMIT) {
      const ra = retryAfter(globalBucket);
      return sendTooManyRequests(reply, ra, "global", GLOBAL_LIMIT);
    }

    // ── Per-agent bucket ───────────────────────────────────────────────────
    const agentId = (req.headers["x-agent-id"] as string | undefined) ?? "anonymous";
    const agentBucket = getOrCreate(agentId);
    const agentCount  = tick(agentBucket);

    if (agentCount > PER_AGENT_LIMIT) {
      const ra = retryAfter(agentBucket);
      return sendTooManyRequests(reply, ra, "agent", PER_AGENT_LIMIT);
    }

    // Forward rate-limit stats as response headers (added after handler runs)
    reply.header("x-ratelimit-limit",     String(PER_AGENT_LIMIT));
    reply.header("x-ratelimit-remaining", String(Math.max(0, PER_AGENT_LIMIT - agentCount)));
  });
}
