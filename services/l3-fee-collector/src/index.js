import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";

import { openLedger, insertFeeEvent, loadSummary } from "./ledger.js";
import {
  assertEvmAddress,
  assertL3ToL2Route,
  normalizeFeeSource,
  stableStringify,
  toWeiString
} from "./routing.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || "7681");
const HOST = process.env.HOST || "0.0.0.0";
const L3_CHAIN_ID = Number(process.env.L3_CHAIN_ID || "903");
const L2_CHAIN_ID = Number(process.env.L2_CHAIN_ID || "901");
const L2_REVENUE_AGGREGATOR_URL = (process.env.L2_REVENUE_AGGREGATOR_URL || "http://l2-revenue-aggregator:7682").replace(/\/+$/, "");
const L2_REVENUE_BRIDGE_ADDRESS = assertEvmAddress(
  process.env.L2_REVENUE_BRIDGE_ADDRESS || "0x0000000000000000000000000000000000000901",
  "l2_revenue_bridge_address"
);
const LEDGER_PATH = process.env.LEDGER_PATH || "/data/l3-fee-ledger.sqlite";
const HMAC_SECRET = String(process.env.L3_FEE_FORWARD_HMAC_SECRET || "").trim();
const ADMIN_TOKEN = String(process.env.L3_FEE_ADMIN_TOKEN || "").trim();
const FORWARD_TIMEOUT_MS = Math.max(500, Number(process.env.L3_FORWARD_TIMEOUT_MS || "3500"));

const db = openLedger({ dbPath: LEDGER_PATH, migrationPath: path.join(__dirname, "..", "migrations", "0001_init.sql") });

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
app.use(express.json({ limit: "512kb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
  next();
});


const meter = {
  revenueWei: 0n,
  events: 0,
  forwardFailures: 0
};

const bootstrap = loadSummary(db);
meter.revenueWei = BigInt(bootstrap.totalWei);
meter.events = bootstrap.eventCount;
meter.forwardFailures = bootstrap.forwardFailures;

const log = (level, message, extra = {}) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: "l3-fee-collector",
      message,
      ...extra
    })
  );
};

const formatWeiAsFloat = (wei) => {
  const value = Number(wei);
  if (!Number.isFinite(value)) return 0;
  return value / 1e18;
};

const withAdmin = (req, res, next) => {
  if (!ADMIN_TOKEN) return next();
  const token = String(req.header("x-admin-token") || "").trim();
  if (token !== ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
};

const signPayload = (payload) => {
  if (!HMAC_SECRET) return "";
  return crypto.createHmac("sha256", HMAC_SECRET).update(stableStringify(payload)).digest("hex");
};

const forwardToL2Aggregator = async (payload) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  const signature = signPayload(payload);
  try {
    const response = await fetch(`${L2_REVENUE_AGGREGATOR_URL}/v1/revenue/l3-ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-l3-signature": signature,
        "x-routing-origin": "L3"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      body,
      signature
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: error instanceof Error ? error.message : "forward_failed" },
      signature
    };
  } finally {
    clearTimeout(timeout);
  }
};

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "l3-fee-collector",
    routingLaw: {
      from: "L3",
      to: "L2",
      noBypassToL1: true
    },
    totals: {
      revenueWei: meter.revenueWei.toString(),
      events: meter.events,
      forwardFailures: meter.forwardFailures
    }
  });
});

app.get("/metrics", (_req, res) => {
  const revenue = formatWeiAsFloat(meter.revenueWei);
  res.type("text/plain");
  res.send(
    [
      "# HELP l3_revenue_total Total L3 fee revenue forwarded toward L2",
      "# TYPE l3_revenue_total counter",
      `l3_revenue_total ${revenue}`,
      "# HELP l3_fee_events_count Total number of L3 fee events collected",
      "# TYPE l3_fee_events_count counter",
      `l3_fee_events_count ${meter.events}`,
      "# HELP l3_fee_forward_failures_total Number of L3 fee events that failed forwarding",
      "# TYPE l3_fee_forward_failures_total counter",
      `l3_fee_forward_failures_total ${meter.forwardFailures}`
    ].join("\n")
  );
});

app.get("/v1/revenue/l3", (_req, res) => {
  const summary = loadSummary(db, 50);
  res.json({ ok: true, ...summary, l2RevenueBridgeAddress: L2_REVENUE_BRIDGE_ADDRESS });
});

app.post("/v1/revenue/fees", withAdmin, async (req, res) => {
  const eventId = String(req.body?.eventId || `l3fee-${randomUUID()}`);
  try {
    const sourceType = normalizeFeeSource(req.body?.sourceType || req.body?.source || "");
    const amountWei = toWeiString(req.body?.amountWei || req.body?.amount || "0");
    const asset = String(req.body?.asset || "GST").trim().toUpperCase();
    const destinationLayer = String(req.body?.destinationLayer || "L2").toUpperCase();
    const destinationChainId = Number(req.body?.destinationChainId || L2_CHAIN_ID);
    const destinationBridgeAddress = String(req.body?.destinationBridgeAddress || L2_REVENUE_BRIDGE_ADDRESS);

    assertL3ToL2Route({
      destinationLayer,
      destinationChainId,
      destinationBridgeAddress,
      expectedL2ChainId: L2_CHAIN_ID,
      expectedBridgeAddress: L2_REVENUE_BRIDGE_ADDRESS
    });

    const payload = {
      eventId,
      sourceLayer: "L3",
      sourceChainId: L3_CHAIN_ID,
      targetLayer: "L2",
      targetChainId: L2_CHAIN_ID,
      sourceType,
      amountWei,
      asset,
      destinationBridgeAddress: L2_REVENUE_BRIDGE_ADDRESS,
      occurredAt: String(req.body?.occurredAt || new Date().toISOString()),
      metadata: {
        txHash: req.body?.txHash || null,
        wallet: req.body?.wallet || null,
        module: req.body?.module || null,
        tags: Array.isArray(req.body?.tags) ? req.body.tags : []
      }
    };

    const forward = await forwardToL2Aggregator(payload);
    const createdAt = new Date().toISOString();
    const forwardStatus = forward.ok ? "forwarded" : "forward_failed";

    insertFeeEvent(db, {
      eventId,
      createdAt,
      sourceType,
      amountWei,
      asset,
      destinationLayer,
      destinationChainId,
      destinationBridgeAddress: L2_REVENUE_BRIDGE_ADDRESS,
      forwardStatus,
      forwardHttpStatus: forward.status,
      forwardError: forward.ok ? null : String(forward.body?.error || "forward_failed"),
      payload
    });

    meter.revenueWei += BigInt(amountWei);
    meter.events += 1;
    if (!forward.ok) {
      meter.forwardFailures += 1;
      log("error", "fee_event_forward_failed", { eventId, status: forward.status, error: forward.body?.error || "unknown" });
      res.status(502).json({ ok: false, error: "l2_forward_failed", eventId, forward });
      return;
    }

    log("info", "fee_event_forwarded", { eventId, sourceType, amountWei, destination: L2_REVENUE_AGGREGATOR_URL });
    res.status(202).json({ ok: true, eventId, forward });
  } catch (error) {
    log("warn", "fee_event_rejected", { eventId, error: error instanceof Error ? error.message : String(error) });
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "invalid_request", eventId });
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, HOST, () => {
  log("info", "service_started", {
    port: PORT,
    host: HOST,
    l3ChainId: L3_CHAIN_ID,
    l2ChainId: L2_CHAIN_ID,
    l2RevenueAggregatorUrl: L2_REVENUE_AGGREGATOR_URL,
    l2RevenueBridgeAddress: L2_REVENUE_BRIDGE_ADDRESS,
    ledgerPath: LEDGER_PATH
  });
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
