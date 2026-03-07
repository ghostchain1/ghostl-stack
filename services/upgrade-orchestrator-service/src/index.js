import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7660);

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


// In-memory upgrade plan store
const upgrades = new Map(); // id → upgrade

const VALID_STATUSES = ["planned", "in-progress", "completed", "failed", "rolled-back"];

function makeUpgrade(body) {
  return {
    id: crypto.randomUUID(),
    name: body.name || "unnamed-upgrade",
    version: body.version || "unknown",
    components: Array.isArray(body.components) ? body.components : [],
    status: "planned",
    initiatedBy: body.initiatedBy || "system",
    notes: body.notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  };
}

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "upgrade-orchestrator-service", upgrades: upgrades.size })
);

/** List upgrades (filtered by ?status=) */
app.get("/upgrades", (req, res) => {
  let items = [...upgrades.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (req.query.status) items = items.filter((u) => u.status === req.query.status);
  const limit  = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  res.json({ ok: true, total: upgrades.size, upgrades: items.slice(offset, offset + limit) });
});

/** GET /upgrades/stats — counts by status */
app.get("/upgrades/stats", (_req, res) => {
  const all = [...upgrades.values()];
  const byStatus = {};
  for (const u of all) byStatus[u.status] = (byStatus[u.status] || 0) + 1;
  res.json({ ok: true, stats: { total: all.length, byStatus, fetchedAt: new Date().toISOString() } });
});


app.get("/upgrades/:id", (req, res) => {
  const u = upgrades.get(req.params.id);
  if (!u) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, upgrade: u });
});

/** Create a new upgrade plan */
app.post("/upgrades", (req, res) => {
  const { name, version, components } = req.body || {};
  if (!name || !version) return res.status(400).json({ ok: false, error: "name and version required" });
  const u = makeUpgrade(req.body);
  upgrades.set(u.id, u);
  res.status(201).json({ ok: true, upgrade: u });
});

/** Advance an upgrade's status */
app.post("/upgrades/:id/status", (req, res) => {
  const u = upgrades.get(req.params.id);
  if (!u) return res.status(404).json({ ok: false, error: "not_found" });
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  u.status = status;
  u.updatedAt = new Date().toISOString();
  if (status === "in-progress" && !u.startedAt) u.startedAt = u.updatedAt;
  if ((status === "completed" || status === "failed" || status === "rolled-back") && !u.completedAt) {
    u.completedAt = u.updatedAt;
  }
  res.json({ ok: true, upgrade: u });
});

/** Delete an upgrade record */
app.delete("/upgrades/:id", (req, res) => {
  if (!upgrades.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  upgrades.delete(req.params.id);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[upgrade-orchestrator-service] listening on :${PORT}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
