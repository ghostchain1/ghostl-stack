import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7630);
const DATA_PATH = process.env.VERIFICATION_STORE || path.join(process.cwd(), "data", "verifications.json");

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
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id })));
  next();
});


app.get("/health", (_req, res) => res.json({ ok: true, service: "verification-service" }));

const load = () => {
  if (!fs.existsSync(DATA_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_PATH, "utf8")); } catch { return []; }
};

const save = (items) => {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(items, null, 2));
};

/** List verifications — filter by ?status= or ?chainId= */
app.get("/verifications", (req, res) => {
  let items = load();
  if (req.query.status) items = items.filter((v) => v.status === req.query.status);
  if (req.query.chainId) items = items.filter((v) => String(v.chainId) === req.query.chainId);
  const limit  = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  res.json({ ok: true, total: load().length, verifications: items.slice(offset, offset + limit) });
});

/** GET /verifications/stats — counts by status */
app.get("/verifications/stats", (_req, res) => {
  const items = load();
  const byStatus = {};
  for (const v of items) byStatus[v.status] = (byStatus[v.status] || 0) + 1;
  res.json({ ok: true, stats: { total: items.length, byStatus, fetchedAt: new Date().toISOString() } });
});


app.get("/verifications/:id", (req, res) => {
  const items = load();
  const v = items.find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, verification: v });
});

/** Submit a contract for verification */
app.post("/verifications", (req, res) => {
  const { address, chainId, sourceHash, compilerVersion, constructorArgs } = req.body || {};
  if (!address || !chainId) return res.status(400).json({ ok: false, error: "address and chainId required" });
  const items = load();
  if (items.find((v) => v.address === address && String(v.chainId) === String(chainId))) {
    return res.status(409).json({ ok: false, error: "already_submitted" });
  }
  const entry = {
    id: crypto.randomUUID(),
    address,
    chainId: String(chainId),
    sourceHash: sourceHash || null,
    compilerVersion: compilerVersion || null,
    constructorArgs: constructorArgs || null,
    status: "pending",
    verifiedAt: null,
    createdAt: new Date().toISOString(),
  };
  items.push(entry);
  save(items);
  res.status(201).json({ ok: true, verification: entry });
});

/** Update verification status (e.g. verified / failed) */
app.patch("/verifications/:id", (req, res) => {
  const items = load();
  const idx = items.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "not_found" });
  const { status, message } = req.body || {};
  const VALID = ["pending", "verified", "failed", "partial"];
  if (status && !VALID.includes(status)) {
    return res.status(400).json({ ok: false, error: `status must be one of: ${VALID.join(", ")}` });
  }
  items[idx] = { ...items[idx], ...(status ? { status } : {}), ...(message ? { message } : {}), updatedAt: new Date().toISOString() };
  if (status === "verified") items[idx].verifiedAt = new Date().toISOString();
  save(items);
  res.json({ ok: true, verification: items[idx] });
});

app.delete("/verifications/:id", (req, res) => {
  const items = load();
  const idx = items.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "not_found" });
  items.splice(idx, 1);
  save(items);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[verification-service] listening on :${PORT}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
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
