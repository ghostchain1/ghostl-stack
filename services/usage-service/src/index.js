/**
 * @file usage-service/src/index.js
 * @description GhostChain API usage tracking and analytics service.
 *
 * Collects and aggregates API usage metrics: request counts, endpoint hit rates,
 * actor-level quotas, and rolling window statistics. Optionally reads from
 * Prometheus for live metrics.
 *
 * Env vars:
 *   PORT         (default 7651)
 *   PROM_URL     Optional Prometheus base URL (default http://localhost:9090)
 *   QUOTA_LIMIT  Default per-actor daily request quota (default 10000)
 */

import express from "express";

const PORT = Number(process.env.PORT || 7651);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";
const QUOTA_LIMIT = Number(process.env.QUOTA_LIMIT || 10000);

const app = express();
app.use(express.json());

// ─── In-process counters (resets on restart; production would use Redis/DB) ──

/** @type {Map<string, { requests: number, errors: number, lastSeen: string }>} */
const actorStats = new Map();

/** @type {Map<string, number>} */
const endpointCounts = new Map();

let totalRequests = 0;
let totalErrors = 0;
const startedAt = new Date().toISOString();

// ─── Prometheus helper ────────────────────────────────────────────────────────

const promQuery = async (query) => {
  const res = await fetch(
    `${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`,
    { signal: AbortSignal.timeout(4000) }
  );
  if (!res.ok) throw new Error(`prom http ${res.status}`);
  return res.json();
};

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "usage-service",
    uptime: process.uptime(),
    startedAt,
  });
});

/**
 * GET /usage
 * Returns aggregate usage statistics. Merges in-process counters with live
 * Prometheus data when available.
 */
app.get("/usage", async (_req, res) => {
  let promTotalReqs = null;
  let promRps = null;
  try {
    const [totalRes, rpsRes] = await Promise.all([
      promQuery("ghost_api_requests_total"),
      promQuery("rate(ghost_api_requests_total[1m])"),
    ]);
    promTotalReqs = totalRes?.data?.result?.[0]?.value?.[1] ?? null;
    promRps = rpsRes?.data?.result?.[0]?.value?.[1] ?? null;
  } catch {
    // Prometheus not available — use in-process counters
  }

  res.json({
    ok: true,
    usage: {
      totalRequests: promTotalReqs !== null ? Number(promTotalReqs) : totalRequests,
      totalErrors,
      requestsPerMinute: promRps !== null ? Number(promRps).toFixed(2) : null,
      actors: actorStats.size,
      endpoints: endpointCounts.size,
      quotaLimit: QUOTA_LIMIT,
      window: "rolling-1h",
      startedAt,
    },
  });
});

/**
 * GET /usage/actors
 * Per-actor usage breakdown.
 */
app.get("/usage/actors", (_req, res) => {
  const actors = Array.from(actorStats.entries()).map(([id, stats]) => ({
    id,
    ...stats,
    quotaUsed: stats.requests,
    quotaLimit: QUOTA_LIMIT,
    quotaRemaining: Math.max(0, QUOTA_LIMIT - stats.requests),
  }));
  res.json({ ok: true, actors });
});

/**
 * GET /usage/endpoints
 * Per-endpoint request counts.
 */
app.get("/usage/endpoints", (_req, res) => {
  const endpoints = Array.from(endpointCounts.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count);
  res.json({ ok: true, endpoints });
});

/**
 * POST /usage/record
 * Record a usage event (called by API gateway or middleware).
 * Body: { actorId?, endpoint?, error?: boolean }
 */
app.post("/usage/record", (req, res) => {
  const { actorId = "anonymous", endpoint = "unknown", error = false } = req.body || {};
  totalRequests++;
  if (error) totalErrors++;

  // Actor stats
  const actor = actorStats.get(actorId) || { requests: 0, errors: 0, lastSeen: "" };
  actor.requests++;
  if (error) actor.errors++;
  actor.lastSeen = new Date().toISOString();
  actorStats.set(actorId, actor);

  // Endpoint counts
  endpointCounts.set(endpoint, (endpointCounts.get(endpoint) || 0) + 1);

  res.json({ ok: true, recorded: true });
});

/**
 * GET /quota/:actorId
 * Check quota status for a specific actor.
 */
app.get("/quota/:actorId", (req, res) => {
  const stats = actorStats.get(req.params.actorId);
  const used = stats?.requests || 0;
  const remaining = Math.max(0, QUOTA_LIMIT - used);
  const exceeded = used >= QUOTA_LIMIT;
  res.json({
    ok: true,
    actorId: req.params.actorId,
    quotaLimit: QUOTA_LIMIT,
    quotaUsed: used,
    quotaRemaining: remaining,
    exceeded,
  });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[usage-service] Listening on port ${PORT}`);
  console.log(`[usage-service] PROM=${PROM_URL} QUOTA_LIMIT=${QUOTA_LIMIT}`);
});
