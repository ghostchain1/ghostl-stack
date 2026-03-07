import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { assertRoutingTransition, layerFromNumeric } from "../../../packages/routing-guard/index.js";

const PORT = Number(process.env.PORT || 7604);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";
const readSecret = (key) => {
  const filePath = process.env[`${key}_FILE`];
  if (filePath) {
    try {
      const value = fs.readFileSync(filePath, "utf8").trim();
      if (value) return value;
    } catch {
      // ignore
    }
  }
  return process.env[key] || "";
};
const AUTH_TOKEN = readSecret("ADMIN_TOKEN");
const INCIDENTS_FILE = process.env.INCIDENTS_FILE || path.join(process.cwd(), "data", "bridge-incidents.json");

const parseCorsAllowlist = () => {
  const raw = process.env.CORS_ALLOW_ORIGINS || "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
};

const isLocalOrigin = (origin) => {
  try {
    const { hostname } = new URL(origin);
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname);
  } catch {
    return false;
  }
};

const corsAllowlist = parseCorsAllowlist();
const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (corsAllowlist.size) return corsAllowlist.has(origin);
  if (process.env.NODE_ENV !== "production") return isLocalOrigin(origin);
  return false;
};

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
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.removeHeader("X-Powered-By");
  next();
});
app.use(
  cors({
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: true
  })
);

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
app.use(express.urlencoded({ extended: false, parameterLimit: 100 }));
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id })));
  next();
});


const promQuery = async (query) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`prom status ${resp.status}`);
    return await resp.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

const requireAdmin = (req, res, next) => {
  if (!AUTH_TOKEN) {
    res.status(500).json({ ok: false, error: "admin_token_not_configured" });
    return;
  }
  const token = req.header("x-admin-token");
  if (token !== AUTH_TOKEN) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  next();
};

const ensureDir = (filePath) => fs.mkdirSync(path.dirname(filePath), { recursive: true });

const loadIncidents = () => {
  try {
    const raw = fs.readFileSync(INCIDENTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    ensureDir(INCIDENTS_FILE);
    fs.writeFileSync(INCIDENTS_FILE, JSON.stringify([]));
    return [];
  }
};

const saveIncidents = (items) => {
  ensureDir(INCIDENTS_FILE);
  fs.writeFileSync(INCIDENTS_FILE, JSON.stringify(items, null, 2));
};

let bridgeState = {
  status: "live",
  feeBps: 0
};

let incidents = loadIncidents();

app.get("/health", (_req, res) => res.json({ ok: true, service: "bridge-service" }));

app.get("/bridges", async (_req, res) => {
  try {
    const pendingResp = await promQuery("ghost_relayer_pending_finalizations");
    const finalizedResp = await promQuery("ghost_relayer_finalize_success_total");
    const pending = pendingResp?.data?.result?.[0]?.value?.[1] || "0";
    const finalized = finalizedResp?.data?.result?.[0]?.value?.[1] || "0";
    res.json({
      ok: true,
      bridges: [
        { id: "l2-l3", srcChain: "l2", dstChain: "l3", status: "live", pending, finalized },
        { id: "l3-l2", srcChain: "l3", dstChain: "l2", status: "live", pending, finalized }
      ]
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post("/bridges/pause", requireAdmin, (_req, res) => {
  bridgeState.status = "paused";
  res.json({ ok: true, status: bridgeState.status });
});

app.post("/bridges/resume", requireAdmin, (_req, res) => {
  bridgeState.status = "live";
  res.json({ ok: true, status: bridgeState.status });
});

app.get("/bridges/fees", requireAdmin, (_req, res) => {
  res.json({ ok: true, feeBps: bridgeState.feeBps });
});

app.post("/bridges/fees", requireAdmin, (req, res) => {
  const bps = Number(req.body?.feeBps);
  if (Number.isNaN(bps) || bps < 0 || bps > 10_000) {
    res.status(400).json({ ok: false, error: "invalid_fee_bps" });
    return;
  }
  bridgeState.feeBps = bps;
  res.json({ ok: true, feeBps: bridgeState.feeBps });
});

app.post("/bridges/route/validate", requireAdmin, (req, res) => {
  try {
    const sourceLayer = layerFromNumeric(req.body?.sourceLayer);
    const targetLayer = layerFromNumeric(req.body?.targetLayer);
    const result = assertRoutingTransition(sourceLayer, targetLayer, { intent: "bridge_api_validate" });
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get("/bridges/incidents", requireAdmin, (_req, res) => {
  res.json({ ok: true, incidents });
});

app.post("/bridges/incidents", requireAdmin, (req, res) => {
  const { type, severity, message, metadata } = req.body || {};
  if (!type || !severity || !message) {
    res.status(400).json({ ok: false, error: "type, severity, and message required" });
    return;
  }
  const entry = {
    id: `inc-${Date.now()}`,
    type,
    severity,
    message,
    metadata: metadata || {},
    createdAt: new Date().toISOString()
  };
  incidents.push(entry);
  saveIncidents(incidents);
  console.log(`[bridge-service] incident logged`, entry);
  res.status(201).json({ ok: true, incident: entry });
});

/** GET /bridges/stats — bridge state and incident summary */
app.get("/bridges/stats", (_req, res) => {
  const bySeverity = incidents.reduce((acc, inc) => { acc[inc.severity] = (acc[inc.severity] || 0) + 1; return acc; }, {});
  res.json({ ok: true, stats: { status: bridgeState.status, feeBps: bridgeState.feeBps, incidents: incidents.length, bySeverity, fetchedAt: new Date().toISOString() } });
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[bridge-service] listening on :${PORT}, PROM=${PROM_URL}`);
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
