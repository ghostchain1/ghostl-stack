import express from "express";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.PORT || 7628);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";
const APPROVAL_TOKEN = process.env.EXECUTION_APPROVAL_TOKEN || "";
const APPROVAL_FILE = process.env.TREASURY_STATE_FILE || path.join(process.cwd(), "data", "treasury-proposals.json");
const OBSERVABILITY_FILE = process.env.TREASURY_OBSERVABILITY_FILE || path.join(process.cwd(), "data", "treasury-observability.json");

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

app.get("/health", (_req, res) => res.json({ ok: true, service: "treasury-service" }));

app.get("/treasury", async (_req, res) => {
  try {
    const balResp = await promQuery("treasury_balance_total");
    const bal = balResp?.data?.result?.[0]?.value?.[1] || "0";
    res.json({ ok: true, balance: bal, txs: [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

const loadObservability = () => {
  try {
    const raw = fs.readFileSync(OBSERVABILITY_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      healthScore: 0.5,
      runwayDays: 0,
      riskPosture: "unknown",
      policyCompliance: false,
      proposalHistory: [],
      rebalancingHistory: [],
      federationTreaties: []
    };
  }
};

app.get("/treasury/overview", (_req, res) => {
  const data = loadObservability();
  res.json({ ok: true, ...data });
});

app.get("/treasury/proposals", (_req, res) => {
  const data = loadObservability();
  res.json({ ok: true, proposals: data.proposalHistory || [] });
});

app.get("/treasury/rebalances", (_req, res) => {
  const data = loadObservability();
  res.json({ ok: true, rebalances: data.rebalancingHistory || [] });
});

app.get("/treasury/federation", (_req, res) => {
  const data = loadObservability();
  res.json({ ok: true, treaties: data.federationTreaties || [] });
});

app.get("/metrics", (_req, res) => {
  const data = loadObservability();
  const health = Number(data.healthScore || 0);
  const runway = Number(data.runwayDays || 0);
  const risk = typeof data.riskScore === "number" ? data.riskScore : 0;
  const compliance = data.policyCompliance ? 1 : 0;
  res.type("text/plain");
  res.send(
    [
      `treasury_health_score ${health}`,
      `treasury_runway_days ${runway}`,
      `treasury_risk_score ${risk}`,
      `treasury_policy_compliance ${compliance}`
    ].join("\n")
  );
});

const loadApprovals = () => {
  try {
    const raw = fs.readFileSync(APPROVAL_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

app.post("/treasury/withdraw", (req, res) => {
  if (!APPROVAL_TOKEN) {
    res.status(500).json({ ok: false, error: "approval token not configured" });
    return;
  }
  if (req.header("x-execution-token") !== APPROVAL_TOKEN) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  const { proposalId, amount, to } = req.body || {};
  if (!proposalId || !amount || !to) {
    res.status(400).json({ ok: false, error: "proposalId, amount, to required" });
    return;
  }
  const approvals = loadApprovals();
  const proposal = approvals.find((p) => p.id === proposalId);
  if (!proposal) {
    res.status(404).json({ ok: false, error: "proposal_not_found" });
    return;
  }
  if ((proposal.approvals || []).length < 2) {
    res.status(400).json({ ok: false, error: "insufficient_approvals" });
    return;
  }
  res.json({ ok: true, queued: { proposalId, amount, to, approvals: proposal.approvals.length } });
});

/** GET /treasury/stats — aggregate balance, risk, runway from Prometheus + observability file */
app.get("/treasury/stats", async (_req, res) => {
  try {
    const [balResp, riskResp] = await Promise.all([
      promQuery("treasury_balance_total"),
      promQuery("treasury_risk_score"),
    ]);
    const obs = loadObservability();
    res.json({
      ok: true,
      stats: {
        balanceTotal: balResp?.data?.result?.[0]?.value?.[1] || "0",
        riskScore: riskResp?.data?.result?.[0]?.value?.[1] ?? String(obs.riskScore ?? 0),
        runwayDays: obs.runwayDays ?? 0,
        healthScore: obs.healthScore ?? 0,
        policyCompliance: obs.policyCompliance ?? false,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});


app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[treasury-service] listening on :${PORT}, PROM=${PROM_URL}`);
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
