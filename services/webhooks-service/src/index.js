/**
 * @file webhooks-service/src/index.js
 * @description GhostChain outbound webhook delivery service.
 *
 * Manages webhook endpoint registrations and outbound delivery of signed
 * event payloads to registered subscriber URLs. Delivery attempts are logged
 * with HMAC-SHA256 signatures for receiver verification.
 *
 * Security: outbound requests are signed with WEBHOOK_SECRET using
 * HMAC-SHA256 over "timestamp.body" — receivers must verify this signature.
 *
 * Env vars:
 *   PORT            (default 7652)
 *   WEBHOOK_SECRET  HMAC signing secret for outbound deliveries
 *   MAX_RETRIES     Max delivery retry attempts per event (default 3)
 *   RETRY_DELAY_MS  Base retry delay in milliseconds (default 1000)
 */

import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7652);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 1000);

const app = express();
app.use(express.json());

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ id:string, url:string, events:string[], secret:string, active:boolean, createdAt:string }} WebhookEndpoint
 * @typedef {{ id:string, endpointId:string, event:string, status:'success'|'failed'|'pending', attempts:number, lastAttemptAt:string|null, responseStatus:number|null, deliveredAt:string|null }} Delivery
 */

/** @type {WebhookEndpoint[]} */
const endpoints = [];

/** @type {Delivery[]} */
const deliveries = [];

const randomId = (p = "wh") => `${p}-${crypto.randomBytes(6).toString("hex")}`;

// ─── Signing ─────────────────────────────────────────────────────────────────

/**
 * Sign a delivery payload for receiver verification.
 * Signature format: HMAC-SHA256("timestamp.body", secret)
 * @param {string} body  — JSON-stringified payload
 * @param {string} ts    — Unix ms timestamp string
 * @param {string} secret — per-endpoint or global secret
 * @returns {string} hex digest
 */
function signPayload(body, ts, secret) {
  if (!secret) return "";
  return crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${body}`)
    .digest("hex");
}

// ─── Delivery engine ──────────────────────────────────────────────────────────

/**
 * Attempt to deliver an event to an endpoint URL with retries.
 * @param {WebhookEndpoint} endpoint
 * @param {string} event
 * @param {unknown} payload
 */
async function deliver(endpoint, event, payload) {
  const deliveryId = randomId("del");
  /** @type {Delivery} */
  const delivery = {
    id: deliveryId,
    endpointId: endpoint.id,
    event,
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    responseStatus: null,
    deliveredAt: null,
  };
  deliveries.push(delivery);

  const body = JSON.stringify({ id: deliveryId, event, data: payload });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    delivery.attempts = attempt;
    delivery.lastAttemptAt = new Date().toISOString();

    const ts = String(Date.now());
    const sig = signPayload(body, ts, endpoint.secret || WEBHOOK_SECRET);

    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ghost-event": event,
          "x-ghost-delivery": deliveryId,
          "x-ghost-timestamp": ts,
          ...(sig ? { "x-ghost-signature": sig } : {}),
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      delivery.responseStatus = res.status;
      if (res.ok) {
        delivery.status = "success";
        delivery.deliveredAt = new Date().toISOString();
        return;
      }
      // Non-2xx — retry
    } catch {
      // Network error — retry
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }

  delivery.status = "failed";
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "webhooks-service",
    endpoints: endpoints.length,
    deliveries: deliveries.length,
    signed: !!WEBHOOK_SECRET,
  });
});

// ── Endpoint management ───────────────────────────────────────────────────────

app.get("/status", (_req, res) => {
  const successCount = deliveries.filter((d) => d.status === "success").length;
  const failedCount = deliveries.filter((d) => d.status === "failed").length;
  const pendingCount = deliveries.filter((d) => d.status === "pending").length;
  res.json({
    ok: true,
    endpoints: endpoints.length,
    deliveries: {
      total: deliveries.length,
      success: successCount,
      failed: failedCount,
      pending: pendingCount,
    },
  });
});

app.get("/endpoints", (_req, res) => {
  // Don't expose per-endpoint secrets
  const safe = endpoints.map(({ id, url, events, active, createdAt }) => ({
    id, url, events, active, createdAt,
  }));
  res.json({ ok: true, endpoints: safe });
});

app.post("/endpoints", (req, res) => {
  const { url, events, secret } = req.body || {};
  if (!url) {
    res.status(400).json({ ok: false, error: "url required" });
    return;
  }
  // Basic URL validation (must be http/https)
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      res.status(400).json({ ok: false, error: "url must be http or https" });
      return;
    }
  } catch {
    res.status(400).json({ ok: false, error: "invalid url" });
    return;
  }

  const endpoint = {
    id: randomId("ep"),
    url: String(url),
    events: Array.isArray(events) ? events.map(String) : ["*"],
    secret: String(secret || ""),
    active: true,
    createdAt: new Date().toISOString(),
  };
  endpoints.push(endpoint);
  res.status(201).json({ ok: true, endpoint: { ...endpoint, secret: undefined } });
});

app.delete("/endpoints/:id", (req, res) => {
  const idx = endpoints.findIndex((e) => e.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }
  endpoints.splice(idx, 1);
  res.json({ ok: true, deleted: req.params.id });
});

// ── Deliveries ────────────────────────────────────────────────────────────────

app.get("/deliveries", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  const endpointId = req.query.endpointId;
  let result = endpointId
    ? deliveries.filter((d) => d.endpointId === endpointId)
    : deliveries;
  result = [...result].reverse().slice(0, limit);
  res.json({ ok: true, deliveries: result });
});

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * POST /dispatch
 * Trigger delivery of an event to all matching registered endpoints.
 * Body: { event: string, payload: unknown }
 */
app.post("/dispatch", (req, res) => {
  const { event, payload } = req.body || {};
  if (!event) {
    res.status(400).json({ ok: false, error: "event required" });
    return;
  }

  const targets = endpoints.filter(
    (e) => e.active && (e.events.includes("*") || e.events.includes(event))
  );

  // Fire-and-forget; don't await deliveries
  for (const ep of targets) {
    deliver(ep, event, payload).catch((err) =>
      console.error(`[webhooks-service] delivery error for ${ep.id}: ${err.message}`)
    );
  }

  res.json({ ok: true, event, dispatched: targets.length });
});

/** GET /stats — aggregate delivery and endpoint stats */
app.get("/stats", (_req, res) => {
  const activeEndpoints = endpoints.filter((e) => e.active).length;
  const byStatus = {};
  for (const d of deliveries) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
  res.json({ ok: true, stats: { endpoints: { total: endpoints.length, active: activeEndpoints }, deliveries: { total: deliveries.length, ...byStatus }, fetchedAt: new Date().toISOString() } });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[webhooks-service] Listening on port ${PORT}`);
  console.log(`[webhooks-service] HMAC signing: ${WEBHOOK_SECRET ? "enabled" : "disabled (set WEBHOOK_SECRET)"}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
