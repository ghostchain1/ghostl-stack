import express from "express";
import os from "node:os";

const PORT = Number(process.env.PORT || 7702);
const AGENT_ROLE = process.env.AGENT_ROLE || "agent";
const AGENT_ID = process.env.AGENT_ID || `${AGENT_ROLE}-${os.hostname()}`;
const AGENT_REGISTRY_URL = process.env.AGENT_REGISTRY_URL || "";
const EVIDENCE_URL = process.env.EVIDENCE_URL || "";
const GOVERNANCE_POLICY_REQUIRED = String(process.env.GOVERNANCE_POLICY_REQUIRED || "true").toLowerCase() === "true";
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 10000);
const WATCHDOG_TARGETS = (process.env.WATCHDOG_TARGETS || "").split(",").map((t) => t.trim()).filter(Boolean);
const WATCHDOG_INTERVAL_MS = Number(process.env.WATCHDOG_INTERVAL_MS || 15000);

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.set("json spaces", 0);
app.set("query parser", "simple");
app.set("strict routing", true);
app.disable("x-powered-by");
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
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");
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
    res.setHeader("Access-Control-Max-Age", "86400");
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
  res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + _RL_WINDOW) / 1000));
  if (count > _RL_MAX) { res.setHeader("Retry-After", Math.ceil(_RL_WINDOW / 1000)); res.setHeader("RateLimit-Policy", `limit=${_RL_MAX};w=${Math.ceil(_RL_WINDOW / 1000)}`); return res.status(429).json({ error: "Too many requests" }); }
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, parameterLimit: 100 }));
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); res.setHeader("Retry-After", "5"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("prefinish", () => res.setHeader("X-Response-Time", `${Date.now() - t0}ms`));
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


const postJson = async (url, body) => {
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });
};

const logEvidence = async (entry) => {
  if (!EVIDENCE_URL) return;
  try {
    await postJson(`${EVIDENCE_URL}/logs`, entry);
  } catch {
    // swallow evidence errors to avoid blocking agent
  }
};

const policyCheck = async (action) => {
  if (!GOVERNANCE_POLICY_REQUIRED || !AGENT_REGISTRY_URL) return true;
  try {
    const resp = await fetch(`${AGENT_REGISTRY_URL}/policy/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: AGENT_ROLE, action }),
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return Boolean(data.allowed);
  } catch {
    return false;
  }
};

const heartbeat = async (status = "ok", info = {}) => {
  if (!AGENT_REGISTRY_URL) return;
  try {
    await postJson(`${AGENT_REGISTRY_URL}/agents/heartbeat`, {
      agentId: AGENT_ID,
      role: AGENT_ROLE,
      status,
      info
    });
  } catch {
    // ignore heartbeat failures
  }
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, role: AGENT_ROLE, agentId: AGENT_ID });
});

/** GET /status — agent identity and runtime configuration */
app.get("/status", (_req, res) => {
  res.json({
    ok: true,
    agentId: AGENT_ID,
    role: AGENT_ROLE,
    registryUrl: AGENT_REGISTRY_URL || null,
    evidenceUrl: EVIDENCE_URL || null,
    policyRequired: GOVERNANCE_POLICY_REQUIRED,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    watchdog: { enabled: AGENT_ROLE === "watchdog", targets: WATCHDOG_TARGETS, intervalMs: WATCHDOG_INTERVAL_MS },
    ts: new Date().toISOString(),
  });
});

/** GET /stats — agent identity and watchdog summary */
app.get("/stats", (_req, res) => {
  res.json({ ok: true, stats: { agentId: AGENT_ID, role: AGENT_ROLE, policyRequired: GOVERNANCE_POLICY_REQUIRED, heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS, watchdog: { enabled: AGENT_ROLE === "watchdog", targets: WATCHDOG_TARGETS.length, intervalMs: WATCHDOG_INTERVAL_MS }, fetchedAt: new Date().toISOString() } });
});

app.post("/task", async (req, res) => {
  const action = req.body?.action || "unknown";
  const payload = req.body?.payload || {};
  const allowed = await policyCheck(action);
  if (!allowed) {
    await logEvidence({
      ts: new Date().toISOString(),
      agentId: AGENT_ID,
      role: AGENT_ROLE,
      action,
      status: "rejected"
    });
    res.status(403).json({ ok: false, error: "policy_blocked" });
    return;
  }

  await logEvidence({
    ts: new Date().toISOString(),
    agentId: AGENT_ID,
    role: AGENT_ROLE,
    action,
    status: "accepted",
    payload
  });

  res.json({ ok: true, action, agentId: AGENT_ID });
});

const startWatchdog = () => {
  if (AGENT_ROLE !== "watchdog" || WATCHDOG_TARGETS.length === 0) return;
  setInterval(async () => {
    for (const target of WATCHDOG_TARGETS) {
      try {
        const resp = await fetch(target, { signal: AbortSignal.timeout(4000) });
        if (!resp.ok) {
          await logEvidence({
            ts: new Date().toISOString(),
            agentId: AGENT_ID,
            role: AGENT_ROLE,
            action: "watchdog.healthcheck",
            status: "degraded",
            target,
            code: resp.status
          });
        }
      } catch (err) {
        await logEvidence({
          ts: new Date().toISOString(),
          agentId: AGENT_ID,
          role: AGENT_ROLE,
          action: "watchdog.healthcheck",
          status: "down",
          target,
          error: err?.message || String(err)
        });
      }
    }
  }, WATCHDOG_INTERVAL_MS);
};

setInterval(() => {
  heartbeat();
}, HEARTBEAT_INTERVAL_MS);

startWatchdog();

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[agent-node] role=${AGENT_ROLE} id=${AGENT_ID} listening on :${PORT}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown" }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err) }));
  process.exitCode = 1; process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason) }));
  process.exitCode = 1; process.exit(1);
});
process.on("SIGTERM", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGQUIT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
