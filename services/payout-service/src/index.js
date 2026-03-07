import express from "express";

const PORT = Number(process.env.PORT || 7629);
const REWARD_DISTRIBUTOR_URL = process.env.REWARD_DISTRIBUTOR_URL || "http://localhost:7684";
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.set("json spaces", 0);
app.set("query parser", "simple");
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
  if (count > _RL_MAX) res.setHeader("Retry-After", Math.ceil(_RL_WINDOW / 1000)); return res.status(429).json({ error: "Too many requests" });
  next();
});
app.use(express.json({ limit: "256kb" }));
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


const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, service: "payout-service", msg, ...extra }));

const fetchJSON = async (url, timeout = 5000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
};

const promQuery = async (query) => {
  try {
    const data = await fetchJSON(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
    return data?.data?.result?.[0]?.value?.[1] ?? null;
  } catch {
    return null;
  }
};

/** Map a reward-distributor cycle record into a normalised payout record. */
const cycleToPayoutRecord = (cycle) => ({
  id: cycle.id ?? cycle.cycleId ?? cycle.cycle_id,
  cycleId: cycle.cycleId ?? cycle.cycle_id ?? cycle.id,
  status: cycle.status ?? (cycle.executedAt || cycle.executed_at ? "executed" : "pending"),
  totalAmountWei: cycle.totalAmountWei ?? cycle.total_amount_wei ?? cycle.netYieldWei ?? "0",
  validatorAmountWei: cycle.validatorAmountWei ?? cycle.validator_amount_wei ?? "0",
  ecosystemAmountWei: cycle.ecosystemAmountWei ?? cycle.ecosystem_amount_wei ?? "0",
  reserveAmountWei: cycle.reserveAmountWei ?? cycle.reserve_amount_wei ?? "0",
  l2l3AmountWei: cycle.l2l3AmountWei ?? cycle.l2l3_amount_wei ?? "0",
  epochStart: cycle.epochStart ?? cycle.epoch_start ?? null,
  epochEnd: cycle.epochEnd ?? cycle.epoch_end ?? null,
  executedAt: cycle.executedAt ?? cycle.executed_at ?? null,
  createdAt: cycle.createdAt ?? cycle.created_at ?? new Date().toISOString(),
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "payout-service" }));

app.get("/payouts", async (_req, res) => {
  try {
    const upstream = await fetchJSON(`${REWARD_DISTRIBUTOR_URL}/v1/reward/cycles`);
    const raw = Array.isArray(upstream?.cycles)
      ? upstream.cycles
      : Array.isArray(upstream?.data)
        ? upstream.data
        : [];
    const statusFilter = req.query.status;
    const payouts = raw.map(cycleToPayoutRecord).filter((p) => !statusFilter || p.status === statusFilter);

    const prometheusTotal = await promQuery("sum(ghost_payout_amount_wei_total)");
    const meta = {
      prometheusTotal: prometheusTotal ?? null,
      cycleCount: payouts.length,
      fetchedAt: new Date().toISOString(),
    };
    res.json({ ok: true, payouts, meta });
  } catch (err) {
    log("warn", "reward-distributor unreachable, returning empty payouts", { error: err?.message });
    res.json({ ok: true, payouts: [], meta: { cycleCount: 0, fetchedAt: new Date().toISOString() } });
  }
});

/** GET /payouts/stats — aggregate payout statistics */
app.get("/payouts/stats", async (_req, res) => {
  try {
    const upstream = await fetchJSON(`${REWARD_DISTRIBUTOR_URL}/v1/reward/cycles`).catch(() => null);
    const raw = Array.isArray(upstream?.cycles)
      ? upstream.cycles
      : Array.isArray(upstream?.data)
        ? upstream.data
        : [];
    const payouts = raw.map(cycleToPayoutRecord);
    const executedCount = payouts.filter((p) => p.status === "executed").length;
    const pendingCount = payouts.filter((p) => p.status === "pending").length;
    const totalWei = payouts.reduce((sum, p) => sum + BigInt(p.totalAmountWei || "0"), 0n);
    const avgWei = executedCount > 0 ? (totalWei / BigInt(executedCount)).toString() : "0";
    const [promTotal, promPending] = await Promise.all([
      promQuery("sum(ghost_payout_amount_wei_total)"),
      promQuery("ghost_payout_cycles_pending"),
    ]);
    res.json({
      ok: true,
      stats: {
        executedCount,
        pendingCount,
        totalAmountWei: totalWei.toString(),
        avgCycleAmountWei: avgWei,
        prometheusTotal: promTotal,
        prometheusPending: promPending ? Number(promPending) : null,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});
app.get("/payouts/summary", async (_req, res) => {
  try {
    const [totalPaid, pendingCount] = await Promise.all([
      promQuery("sum(ghost_payout_amount_wei_total)"),
      promQuery("ghost_payout_cycles_pending"),
    ]);
    res.json({
      ok: true,
      summary: {
        totalPaidWei: totalPaid,
        pendingCycles: pendingCount ? Number(pendingCount) : null,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});
app.get("/payouts/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const upstream = await fetchJSON(`${REWARD_DISTRIBUTOR_URL}/v1/reward/cycles/${encodeURIComponent(id)}`);
    const cycle = upstream?.cycle ?? upstream?.data ?? upstream;
    res.json({ ok: true, payout: cycleToPayoutRecord(cycle) });
  } catch (err) {
    log("warn", `cycle ${id} fetch failed`, { error: err?.message });
    res.status(502).json({ ok: false, error: "upstream_unavailable" });
  }
});


app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => log("info", `listening on :${PORT}`, { rewardDistributorUrl: REWARD_DISTRIBUTOR_URL }));
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err) }));
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason) }));
  process.exit(1);
});
process.on("SIGTERM", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
