import express from "express";

const PORT     = Number(process.env.PORT || 7618);
const PROM_URL = process.env.PROMETHEUS_URL || "http://localhost:9090";
const VAULT_URL = process.env.VAULT_ADDR || "http://localhost:8200";

const app = express();
app.set("trust proxy", 1);
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


async function promQuery(q) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch(
      `${PROM_URL}/api/v1/query?query=${encodeURIComponent(q)}`,
      { signal: controller.signal }
    );
    const j = await r.json();
    return j?.data?.result ?? [];
  } catch { return []; } finally { clearTimeout(timer); }
}

function scalar(results) {
  const v = results?.[0]?.value?.[1];
  return v != null ? parseFloat(v) : null;
}

/** Fetch Vault sys/health for sealed status and standby */
async function fetchVaultHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch(`${VAULT_URL}/v1/sys/health?standbyok=true`, { signal: controller.signal });
    return await r.json();
  } catch { return null; } finally { clearTimeout(timer); }
}

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "secrets-health-service" })
);

/** GET /secrets — comprehensive Vault/secrets metrics */
app.get("/secrets", async (_req, res) => {
  const start = Date.now();
  const [vaultHealth, sealedRes, leaseRes, keyRes, reqCountRes, reqLatRes, errorRateRes] = await Promise.all([
    fetchVaultHealth(),
    promQuery("vault_sealed"),
    promQuery("vault_core_active_lease_count"),
    promQuery("vault_core_key_count"),
    promQuery("rate(vault_core_request_count[5m])"),
    promQuery("vault_barrier_request_duration_seconds"),
    promQuery("rate(vault_core_request_errors_total[5m])"),
  ]);

  const latencyMs = Date.now() - start;
  const sealed    = scalar(sealedRes) === 1;
  const leaseCount = scalar(leaseRes);
  const keyCount   = scalar(keyRes);
  const reqRate    = scalar(reqCountRes);
  const latency    = scalar(reqLatRes);
  const errorRate  = scalar(errorRateRes);

  res.json({
    ok: true,
    sealed,
    status: sealed ? "sealed" : "unsealed",
    vaultInitialized: vaultHealth?.initialized ?? null,
    vaultStandby:     vaultHealth?.standby ?? null,
    metrics: {
      activeLeaseCount: leaseCount,
      keyCount,
      requestRatePerSec: reqRate,
      avgRequestLatencyMs: latency != null ? latency * 1000 : null,
      errorRatePerSec: errorRate,
    },
    probeLatencyMs: latencyMs,
    ts: new Date().toISOString(),
  });
});

/** GET /secrets/stats — aggregated stats for dashboards */
app.get("/secrets/stats", async (_req, res) => {
  const [sealedRes, leaseRes, keyRes, reqCountRes] = await Promise.all([
    promQuery("vault_sealed"),
    promQuery("vault_core_active_lease_count"),
    promQuery("vault_core_key_count"),
    promQuery("increase(vault_core_request_count[1h])"),
  ]);
  res.json({
    ok: true,
    sealed: scalar(sealedRes) === 1,
    activeLeaseCount: scalar(leaseRes),
    keyCount: scalar(keyRes),
    requestsLastHour: scalar(reqCountRes),
    ts: new Date().toISOString(),
  });
});

/** GET /secrets/health — simplified health check (sealed vs unsealed) */
app.get("/secrets/health", async (_req, res) => {
  const vaultHealth = await fetchVaultHealth();
  const sealedRes   = await promQuery("vault_sealed");
  const sealed = scalar(sealedRes) === 1 || vaultHealth?.sealed === true;
  res.status(sealed ? 503 : 200).json({
    ok: !sealed,
    sealed,
    initialized: vaultHealth?.initialized ?? null,
    version: vaultHealth?.version ?? null,
    ts: new Date().toISOString(),
  });
});

/** POST /secrets/rotate-trigger — signal that a rotation should occur (logs intent) */
app.post("/secrets/rotate-trigger", (req, res) => {
  const { keyPath, reason } = req.body || {};
  if (!keyPath) return res.status(400).json({ ok: false, error: "keyPath required" });
  console.log(`[secrets-health] rotate-trigger: keyPath=${keyPath} reason=${reason || "manual"} at ${new Date().toISOString()}`);
  res.json({ ok: true, queued: true, keyPath, ts: new Date().toISOString() });
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[secrets-health-service] listening on :${PORT}`);
});
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
