import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7602);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
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
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id })));
  next();
});


// In-memory reward event log
const rewardLog = new Map(); // id → reward event

const promQuery = async (query) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`prom ${r.status}`);
    return await r.json();
  } catch (e) { clearTimeout(t); throw e; }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "rewards-service", count: rewardLog.size }));

/** List reward events filtered by ?validator= or ?epoch= */
app.get("/rewards", async (req, res) => {
  try {
    const [supplyResp, emissionResp] = await Promise.all([
      promQuery("token_supply_total"),
      promQuery("token_emission_rate"),
    ]);
    let items = [...rewardLog.values()].sort((a, b) => b.createdAt - a.createdAt);
    if (req.query.validator) items = items.filter((r) => r.validator === req.query.validator);
    if (req.query.epoch) items = items.filter((r) => String(r.epoch) === req.query.epoch);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    res.json({
      ok: true,
      total: rewardLog.size,
      rewards: items.slice(offset, offset + limit),
      supply: supplyResp?.data?.result?.[0]?.value?.[1] || null,
      emissionRate: emissionResp?.data?.result?.[0]?.value?.[1] || null,
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** Aggregate stats: total distributed, count, per-validator summary */
app.get("/rewards/stats", (req, res) => {
  const items = [...rewardLog.values()];
  const total = items.reduce((acc, r) => acc + Number(r.amount), 0);
  const byValidator = {};
  for (const r of items) {
    byValidator[r.validator] = (byValidator[r.validator] || 0) + Number(r.amount);
  }
  res.json({ ok: true, count: items.length, totalDistributed: total, byValidator });
});

app.get("/rewards/:id", (req, res) => {
  const r = rewardLog.get(req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, reward: r });
});

/** Record a reward distribution event */
app.post("/rewards", (req, res) => {
  const { validator, amount, epoch, reason, txHash } = req.body || {};
  if (!validator || !amount) return res.status(400).json({ ok: false, error: "validator and amount required" });
  const r = {
    id: crypto.randomUUID(),
    validator,
    amount: String(amount),
    epoch: epoch ?? null,
    reason: reason || "block_reward",
    txHash: txHash || null,
    createdAt: Date.now(),
  };
  rewardLog.set(r.id, r);
  res.status(201).json({ ok: true, reward: r });
});

app.delete("/rewards/:id", (req, res) => {
  if (!rewardLog.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  rewardLog.delete(req.params.id);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[rewards-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err) }));
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason) }));
  process.exit(1);
});
process.on("SIGTERM", () => {
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
