import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";

import {
  assertInboundRoute,
  assertOutboundRoute,
  normalizeFeeType,
  stableStringify,
  toWeiString
} from "./routing.js";
import {
  getPendingEvents,
  insertRevenueEvent,
  loadSummary,
  markEventsForwarded,
  openLedger,
  upsertBatch
} from "./ledger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || "7682");
const HOST = process.env.HOST || "0.0.0.0";

const L1_CHAIN_ID = Number(process.env.L1_CHAIN_ID || "14000101");
const L2_CHAIN_ID = Number(process.env.L2_CHAIN_ID || "901");
const L3_CHAIN_ID = Number(process.env.L3_CHAIN_ID || "903");

const LEDGER_PATH = process.env.LEDGER_PATH || "/data/l2-revenue-aggregator.sqlite";
const L1_TREASURY_ENGINE_URL = (process.env.L1_TREASURY_ENGINE_URL || "http://treasury-engine:7683").replace(/\/+$/, "");
const L3_SHARED_SECRET = String(process.env.L3_SHARED_SECRET || "").trim();
const AGGREGATOR_ADMIN_TOKEN = String(process.env.AGGREGATOR_ADMIN_TOKEN || "").trim();
const FORWARD_TIMEOUT_MS = Math.max(500, Number(process.env.FORWARD_TIMEOUT_MS || "4500"));
const BATCH_SIZE = Math.max(1, Number(process.env.BATCH_SIZE || "50"));
const BATCH_INTERVAL_MS = Math.max(1000, Number(process.env.BATCH_INTERVAL_MS || "15000"));
const OPERATIONS_FEE_BPS = Math.max(0, Math.min(2000, Number(process.env.OPERATIONS_FEE_BPS || "250")));
const MAX_EVENT_WEI = BigInt(String(process.env.MAX_EVENT_WEI || "1000000000000000000000000"));
const RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.RATE_LIMIT_WINDOW_MS || "60000"));
const RATE_LIMIT_MAX = Math.max(10, Number(process.env.RATE_LIMIT_MAX || "240"));

const db = openLedger({ dbPath: LEDGER_PATH, migrationPath: path.join(__dirname, "..", "migrations", "0001_init.sql") });

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.set("json spaces", 0);
app.set("query parser", "simple");
app.set("strict routing", true);
app.set("case sensitive routing", true);
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
  res.setHeader("Vary", "Accept");
  res.setHeader("Keep-Alive", "timeout=65");
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
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  if (req.headers["access-control-request-private-network"] === "true") { res.setHeader("Access-Control-Allow-Private-Network", "true"); }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, parameterLimit: 100 }));
app.use((req, res, next) => {
  if (["POST","PUT","PATCH"].includes(req.method) && req.headers["content-type"] &&
      !req.is(["application/json","application/x-www-form-urlencoded"])) {
    return res.status(415).json({ ok: false, error: "Unsupported Media Type" });
  }
  next();
});
app.use((req, res, next) => {
  if (req.method !== "OPTIONS" && !req.accepts("application/json")) {
    return res.status(406).json({ ok: false, error: "Not Acceptable" });
  }
  next();
});
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); res.setHeader("Retry-After", "5"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const _tp = req.headers["traceparent"] ?? `00-${crypto.randomUUID().replace(/-/g,"")}-${req.id.replace(/-/g,"").slice(0,16)}-01`;
  res.setHeader("X-Trace-ID", _tp);
  const t0 = process.hrtime.bigint();
  res.on("prefinish", () => res.setHeader("X-Response-Time", `${(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2)}ms`));
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: +(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2), reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


const meter = {
  revenueWei: 0n,
  liquidityFeeWei: 0n,
  bridgeVolumeWei: 0n,
  eventCount: 0,
  batchCount: 0,
  batchFailures: 0,
  pendingEvents: 0
};

const boot = loadSummary(db);
meter.revenueWei = BigInt(boot.totalWei);
meter.liquidityFeeWei = BigInt(boot.liquidityFeeWei);
meter.bridgeVolumeWei = BigInt(boot.bridgeVolumeWei);
meter.eventCount = boot.eventCount;
meter.batchCount = boot.batchCount;
meter.batchFailures = boot.batchFailures;
meter.pendingEvents = boot.pendingCount;

const ipWindow = new Map();
setInterval(() => ipWindow.clear(), RATE_LIMIT_WINDOW_MS).unref();
let batchLock = false;

const log = (level, message, extra = {}) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: "l2-revenue-aggregator",
      message,
      ...extra
    })
  );
};

const formatWei = (wei) => {
  const value = Number(wei);
  if (!Number.isFinite(value)) return 0;
  return value / 1e18;
};

const withRateLimit = (req, res, next) => {
  const key = String(req.ip || req.socket.remoteAddress || "unknown");
  const now = Date.now();
  const row = ipWindow.get(key) || { startedAt: now, count: 0 };
  if (now - row.startedAt > RATE_LIMIT_WINDOW_MS) {
    row.startedAt = now;
    row.count = 0;
  }
  row.count += 1;
  ipWindow.set(key, row);
  res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + RATE_LIMIT_WINDOW_MS) / 1000));
  if (row.count > RATE_LIMIT_MAX) {
    res.setHeader("Retry-After", Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
    res.setHeader("RateLimit-Policy", `limit=${RATE_LIMIT_MAX};w=${Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)}`);
    res.status(429).json({ ok: false, error: "rate_limit_exceeded" });
    return;
  }
  next();
};

const withAdmin = (req, res, next) => {
  if (!AGGREGATOR_ADMIN_TOKEN) return next();
  const token = String(req.header("x-admin-token") || "").trim();
  if (token !== AGGREGATOR_ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
};

const signMatches = (payload, providedSignature) => {
  if (!L3_SHARED_SECRET) return true;
  const expected = crypto.createHmac("sha256", L3_SHARED_SECRET).update(stableStringify(payload)).digest("hex");
  const incoming = String(providedSignature || "").trim().toLowerCase();
  return incoming.length > 0 && incoming === expected.toLowerCase();
};

const assertAmountUnderCap = (amountWei) => {
  const amount = BigInt(amountWei);
  if (amount > MAX_EVENT_WEI) {
    throw new Error("fraud_check_amount_exceeds_cap");
  }
};

const calculateBatchId = (events, destinationChainId) => {
  const hash = crypto.createHash("sha256");
  for (const event of events) {
    hash.update(`${event.eventId}:${event.amountWei}:${event.feeType}|`);
  }
  hash.update(`to:${destinationChainId}`);
  return `batch-${hash.digest("hex")}`;
};

const createBatchPayload = (events) => {
  const grossWei = events.reduce((sum, event) => sum + BigInt(event.amountWei), 0n);
  const opsFeeWei = (grossWei * BigInt(OPERATIONS_FEE_BPS)) / 10_000n;
  const netWei = grossWei - opsFeeWei;
  const destinationChainId = L1_CHAIN_ID;
  assertOutboundRoute(destinationChainId, L1_CHAIN_ID);
  const batchId = calculateBatchId(events, destinationChainId);

  return {
    batchId,
    sourceLayer: "L2",
    sourceChainId: L2_CHAIN_ID,
    targetLayer: "L1",
    targetChainId: destinationChainId,
    createdAt: new Date().toISOString(),
    operationsFeeBps: OPERATIONS_FEE_BPS,
    totals: {
      grossWei: grossWei.toString(),
      netWei: netWei.toString(),
      opsFeeWei: opsFeeWei.toString()
    },
    events: events.map((event) => ({
      eventId: event.eventId,
      sourceLayer: event.sourceLayer,
      sourceChainId: event.sourceChainId,
      feeType: event.feeType,
      amountWei: event.amountWei,
      asset: event.asset,
      createdAt: event.createdAt
    }))
  };
};

const forwardBatchToTreasury = async (payload) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const response = await fetch(`${L1_TREASURY_ENGINE_URL}/v1/treasury/revenue-intake`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-routing-origin": "L2"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: error instanceof Error ? error.message : "forward_failed" }
    };
  } finally {
    clearTimeout(timeout);
  }
};

const flushPendingBatches = async () => {
  if (batchLock) return { ok: false, reason: "batch_lock" };
  batchLock = true;
  try {
    const pending = getPendingEvents(db, BATCH_SIZE);
    meter.pendingEvents = pending.length;
    if (pending.length === 0) {
      return { ok: true, flushed: 0 };
    }

    const payload = createBatchPayload(pending);
    const forward = await forwardBatchToTreasury(payload);
    const createdAt = new Date().toISOString();

    upsertBatch(db, {
      batchId: payload.batchId,
      createdAt,
      eventCount: pending.length,
      grossWei: payload.totals.grossWei,
      netWei: payload.totals.netWei,
      destinationChainId: payload.targetChainId,
      forwardStatus: forward.ok ? "forwarded" : "forward_failed",
      forwardHttpStatus: forward.status,
      forwardError: forward.ok ? null : String(forward.body?.error || "forward_failed"),
      payload
    });

    if (!forward.ok) {
      meter.batchFailures += 1;
      log("error", "batch_forward_failed", {
        batchId: payload.batchId,
        status: forward.status,
        error: forward.body?.error || "unknown"
      });
      return { ok: false, flushed: 0, batchId: payload.batchId, error: forward.body?.error || "forward_failed" };
    }

    markEventsForwarded(
      db,
      pending.map((event) => event.eventId),
      createdAt,
      payload.batchId
    );

    meter.batchCount += 1;
    meter.pendingEvents = Math.max(0, meter.pendingEvents - pending.length);

    log("info", "batch_forwarded", {
      batchId: payload.batchId,
      eventCount: pending.length,
      grossWei: payload.totals.grossWei,
      netWei: payload.totals.netWei
    });

    return { ok: true, flushed: pending.length, batchId: payload.batchId };
  } finally {
    batchLock = false;
  }
};

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "l2-revenue-aggregator",
    routingLaw: {
      accepts: ["L3->L2", "L2->L1"],
      noL2ExternalSettlement: true,
      noL3ToL1Bypass: true
    },
    pendingEvents: meter.pendingEvents,
    metrics: {
      eventCount: meter.eventCount,
      batchCount: meter.batchCount,
      batchFailures: meter.batchFailures
    }
  });
});

app.get("/metrics", (_req, res) => {
  res.type("text/plain").send(
    [
      "# HELP l2_revenue_total Total revenue observed at L2 aggregator",
      "# TYPE l2_revenue_total counter",
      `l2_revenue_total ${formatWei(meter.revenueWei)}`,
      "# HELP l2_liquidity_fees Total LP fees observed at L2",
      "# TYPE l2_liquidity_fees counter",
      `l2_liquidity_fees ${formatWei(meter.liquidityFeeWei)}`,
      "# HELP l2_bridge_volume Total bridge fee volume observed at L2",
      "# TYPE l2_bridge_volume counter",
      `l2_bridge_volume ${formatWei(meter.bridgeVolumeWei)}`,
      "# HELP l2_revenue_batches_total Total deterministic revenue batches attempted",
      "# TYPE l2_revenue_batches_total counter",
      `l2_revenue_batches_total ${meter.batchCount + meter.batchFailures}`,
      "# HELP l2_revenue_batch_failures_total Total batch forwarding failures",
      "# TYPE l2_revenue_batch_failures_total counter",
      `l2_revenue_batch_failures_total ${meter.batchFailures}`,
      "# HELP l2_revenue_pending_events Number of pending revenue events",
      "# TYPE l2_revenue_pending_events gauge",
      `l2_revenue_pending_events ${meter.pendingEvents}`
    ].join("\n")
  );
});

app.get("/v1/revenue/l2", (_req, res) => {
  const summary = loadSummary(db, 50);
  meter.pendingEvents = summary.pendingCount;
  res.json({ ok: true, ...summary });
});

const ingest = (sourceLayerExpected) => {
  return (req, res) => {
    const eventId = String(req.body?.eventId || `l2rev-${randomUUID()}`);
    try {
      const feeType = normalizeFeeType(req.body?.feeType || req.body?.sourceType || "");
      const amountWei = toWeiString(req.body?.amountWei || req.body?.amount || "0");
      assertAmountUnderCap(amountWei);

      const payload = {
        eventId,
        sourceLayer: String(req.body?.sourceLayer || sourceLayerExpected).toUpperCase(),
        sourceChainId: Number(req.body?.sourceChainId || (sourceLayerExpected === "L3" ? L3_CHAIN_ID : L2_CHAIN_ID)),
        targetLayer: String(req.body?.targetLayer || (sourceLayerExpected === "L3" ? "L2" : "L1")).toUpperCase(),
        targetChainId: Number(req.body?.targetChainId || (sourceLayerExpected === "L3" ? L2_CHAIN_ID : L1_CHAIN_ID)),
        feeType,
        amountWei,
        asset: String(req.body?.asset || "GST").trim().toUpperCase(),
        occurredAt: String(req.body?.occurredAt || new Date().toISOString()),
        metadata: req.body?.metadata || {}
      };

      const route = assertInboundRoute(payload, { l1: L1_CHAIN_ID, l2: L2_CHAIN_ID, l3: L3_CHAIN_ID });
      if (sourceLayerExpected === "L3") {
        const signature = req.header("x-l3-signature");
        if (!signMatches(payload, signature)) {
          throw new Error("fraud_check_invalid_l3_signature");
        }
      }

      insertRevenueEvent(db, {
        eventId,
        createdAt: new Date().toISOString(),
        sourceLayer: route.sourceLayer,
        sourceChainId: route.sourceChainId,
        targetLayer: route.targetLayer,
        targetChainId: route.targetChainId,
        feeType,
        amountWei,
        asset: payload.asset,
        authenticity: sourceLayerExpected === "L3" ? "signed" : "l2_internal",
        fraudFlag: null,
        payload
      });

      const amount = BigInt(amountWei);
      meter.revenueWei += amount;
      meter.eventCount += 1;
      meter.pendingEvents += 1;
      if (feeType === "lp") meter.liquidityFeeWei += amount;
      if (feeType === "bridge") meter.bridgeVolumeWei += amount;

      log("info", "revenue_event_accepted", {
        eventId,
        sourceLayer: route.sourceLayer,
        feeType,
        amountWei,
        targetLayer: route.targetLayer
      });

      res.status(202).json({ ok: true, eventId, pendingEvents: meter.pendingEvents });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ingest_failed";
      log("warn", "revenue_event_rejected", { eventId, error: message, sourceLayerExpected });
      if (message.includes("UNIQUE constraint failed")) {
        res.status(409).json({ ok: false, error: "duplicate_event_id", eventId });
        return;
      }
      res.status(400).json({ ok: false, error: message, eventId });
    }
  };
};

app.post("/v1/revenue/l3-ingest", withRateLimit, ingest("L3"));
app.post("/v1/revenue/l2-ingest", withRateLimit, ingest("L2"));

app.post("/v1/revenue/flush", withAdmin, async (_req, res) => {
  const result = await flushPendingBatches();
  if (!result.ok) {
    res.status(502).json({ ok: false, ...result });
    return;
  }
  res.json({ ok: true, ...result });
});

setInterval(() => {
  flushPendingBatches().catch((error) => {
    log("error", "batch_flush_unhandled_error", { error: error instanceof Error ? error.message : String(error) });
  });
}, BATCH_INTERVAL_MS).unref();

app.use((_req, res) => { res.setHeader("Cache-Control", "no-store"); return res.status(404).json({ ok: false, error: "not_found" }); });

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  if (err.status === 413 || err.statusCode === 413) return res.status(413).json({ ok: false, error: "Payload too large" });
  if (err.status === 431 || err.statusCode === 431) return res.status(431).json({ ok: false, error: "Request header fields too large" });
  if (err.status === 408 || err.statusCode === 408) return res.status(408).json({ ok: false, error: "Request timeout" });
  if (err.status === 405 || err.statusCode === 405) return res.status(405).json({ ok: false, error: "Method not allowed" });
  const status = err.status ?? err.statusCode ?? 500;
  const _isProd = process.env.NODE_ENV === "production";
  res.setHeader("Cache-Control", "no-store");
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledError", status, error: err?.message ?? String(err), stack: _isProd ? undefined : err?.stack }));
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, HOST, () => {
  log("info", "service_started", {
    port: PORT,
    host: HOST,
    batchIntervalMs: BATCH_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    destination: L1_TREASURY_ENGINE_URL
  });
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
server.on("connection", (socket) => socket.setNoDelay(true));
server.on("error", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "serverError", error: err?.message ?? String(err), code: err?.code }));
  if (err.code === "EADDRINUSE" || err.code === "EACCES") { process.exitCode = 1; process.exit(1); }
});
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown" }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("exit", (code) => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "exit", code })); });
process.on("SIGPIPE", () => { /* ignore: client disconnected mid-response */ });
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err), stack: err?.stack }));
  process.exitCode = 1; process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason), stack: reason?.stack }));
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
