/**
 * @file devops-service/src/index.js
 * @description GhostChain DevOps lifecycle service.
 *
 * Tracks software releases, protocol forks, and upgrade plans for GhostChain
 * nodes. Provides node-level restart/upgrade control plane hooks.
 *
 * Env vars:
 *   PORT              (default 7623)
 *   NODE_REGISTRY_URL Optional: URL to a node inventory service for live nodes
 *   CHAIN_TAG         Optional: moniker for this deployment (e.g. "devnet")
 */

import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7623);
const NODE_REGISTRY_URL = process.env.NODE_REGISTRY_URL || "";
const CHAIN_TAG = process.env.CHAIN_TAG || "ghostchain";

const app = express();
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.removeHeader("X-Powered-By");
  next();
});
const _CORS_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && _CORS_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const _RL_WINDOW = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const _RL_MAX    = Number(process.env.RATE_LIMIT_MAX ?? 1000);
const _rlStore   = new Map();
setInterval(() => _rlStore.clear(), _RL_WINDOW).unref();
app.use((req, res, next) => {
  const key = req.ip ?? "unknown";
  const count = (_rlStore.get(key) ?? 0) + 1;
  _rlStore.set(key, count);
  res.setHeader("X-RateLimit-Limit", _RL_MAX);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, _RL_MAX - count));
  if (count > _RL_MAX) return res.status(429).json({ error: "Too many requests" });
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
  next();
});


// ─── In-memory store (bootstrapped from env / future: persisted to disk) ─────

/**
 * @typedef {{ id:string, tag:string, notes:string, publishedAt:string, components:string[] }} Release
 * @typedef {{ id:string, name:string, activationEpoch:number|null, status:string, description:string }} Fork
 * @typedef {{ id:string, nodeId:string, fromVersion:string, toVersion:string, status:string, scheduledAt:string|null, completedAt:string|null }} Upgrade
 */

/** @type {Release[]} */
const releases = [
  {
    id: "rel-genesis",
    tag: "v1.0.0",
    notes: "Genesis release — GhostChain L1/L2/L3 stack",
    publishedAt: "2026-01-15T00:00:00.000Z",
    components: ["ghostd", "ghostx-api", "bridge-service", "ghostbrain-core"]
  }
];

/** @type {Fork[]} */
const forks = [
  {
    id: "fork-genesis",
    name: "genesis",
    activationEpoch: 0,
    status: "active",
    description: "Initial protocol fork — GhostChain v1 consensus rules"
  }
];

/** @type {Upgrade[]} */
const upgrades = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const randomId = (prefix = "id") => `${prefix}-${crypto.randomBytes(6).toString("hex")}`;

/** Fetch live nodes from inventory service (if configured). */
async function fetchNodes() {
  if (!NODE_REGISTRY_URL) return [];
  try {
    const res = await fetch(`${NODE_REGISTRY_URL}/nodes`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body.nodes) ? body.nodes : [];
  } catch {
    return [];
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "devops-service",
    chain: CHAIN_TAG,
    releases: releases.length,
    forks: forks.length,
    upgrades: upgrades.length,
  });
});

// ── Releases ─────────────────────────────────────────────────────────────────

app.get("/releases", (_req, res) => {
  // Newest first
  const sorted = [...releases].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  res.json({ ok: true, releases: sorted });
});

app.post("/releases", (req, res) => {
  const { tag, notes, components } = req.body || {};
  if (!tag) {
    res.status(400).json({ ok: false, error: "tag required" });
    return;
  }
  const release = {
    id: randomId("rel"),
    tag: String(tag),
    notes: String(notes || ""),
    publishedAt: new Date().toISOString(),
    components: Array.isArray(components) ? components.map(String) : [],
  };
  releases.push(release);
  res.status(201).json({ ok: true, release });
});

app.get("/releases/:id", (req, res) => {
  const release = releases.find((r) => r.id === req.params.id);
  if (!release) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }
  res.json({ ok: true, release });
});

// ── Forks ─────────────────────────────────────────────────────────────────────

app.get("/forks", (_req, res) => {
  res.json({ ok: true, forks });
});

app.post("/forks", (req, res) => {
  const { name, activationEpoch, description } = req.body || {};
  if (!name) {
    res.status(400).json({ ok: false, error: "name required" });
    return;
  }
  const fork = {
    id: randomId("fork"),
    name: String(name),
    activationEpoch: activationEpoch != null ? Number(activationEpoch) : null,
    status: "pending",
    description: String(description || ""),
  };
  forks.push(fork);
  res.status(201).json({ ok: true, fork });
});

// ── Upgrades ──────────────────────────────────────────────────────────────────

app.get("/upgrades", (_req, res) => {
  res.json({ ok: true, upgrades });
});

app.post("/upgrades", (req, res) => {
  const { nodeId, fromVersion, toVersion, scheduledAt } = req.body || {};
  if (!nodeId || !toVersion) {
    res.status(400).json({ ok: false, error: "nodeId and toVersion required" });
    return;
  }
  const upgrade = {
    id: randomId("upg"),
    nodeId: String(nodeId),
    fromVersion: String(fromVersion || "unknown"),
    toVersion: String(toVersion),
    status: "scheduled",
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    completedAt: null,
  };
  upgrades.push(upgrade);
  res.status(201).json({ ok: true, upgrade });
});

// ── Node control ──────────────────────────────────────────────────────────────

app.get("/nodes", async (_req, res) => {
  const nodes = await fetchNodes();
  res.json({ ok: true, nodes });
});

app.post("/nodes/:id/restart", async (req, res) => {
  const { id } = req.params;
  // If NODE_REGISTRY_URL provided, forward restart signal
  if (NODE_REGISTRY_URL) {
    try {
      const upstream = await fetch(`${NODE_REGISTRY_URL}/nodes/${encodeURIComponent(id)}/restart`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body || {}),
        signal: AbortSignal.timeout(5000),
      });
      const body = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json(body);
      return;
    } catch (e) {
      res.status(502).json({ ok: false, error: /** @type {Error} */ (e).message });
      return;
    }
  }
  // No upstream inventory — acknowledge the request and record an upgrade event
  console.log(`[devops-service] restart requested for node ${id}`);
  res.json({ ok: true, nodeId: id, action: "restart", status: "acknowledged", ts: new Date().toISOString() });
});

app.post("/nodes/:id/upgrade", async (req, res) => {
  const { id } = req.params;
  if (NODE_REGISTRY_URL) {
    try {
      const upstream = await fetch(`${NODE_REGISTRY_URL}/nodes/${encodeURIComponent(id)}/upgrade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body || {}),
        signal: AbortSignal.timeout(5000),
      });
      const body = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json(body);
      return;
    } catch (e) {
      res.status(502).json({ ok: false, error: /** @type {Error} */ (e).message });
      return;
    }
  }
  const { toVersion } = req.body || {};
  const upgrade = {
    id: randomId("upg"),
    nodeId: id,
    fromVersion: "unknown",
    toVersion: String(toVersion || "latest"),
    status: "initiated",
    scheduledAt: new Date().toISOString(),
    completedAt: null,
  };
  upgrades.push(upgrade);
  console.log(`[devops-service] upgrade initiated for node ${id} → ${upgrade.toVersion}`);
  res.json({ ok: true, nodeId: id, action: "upgrade", upgrade });
});

/** GET /stats — aggregate counts across releases, forks and upgrades */
app.get("/stats", (_req, res) => {
  const upgradesByStatus = {};
  for (const u of upgrades) upgradesByStatus[u.status] = (upgradesByStatus[u.status] || 0) + 1;
  res.json({ ok: true, stats: { releases: releases.length, forks: forks.length, upgrades: upgrades.length, upgradesByStatus, chainTag: CHAIN_TAG, fetchedAt: new Date().toISOString() } });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[devops-service] Listening on port ${PORT} chain=${CHAIN_TAG}`);
  if (NODE_REGISTRY_URL) console.log(`[devops-service] Node registry: ${NODE_REGISTRY_URL}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
