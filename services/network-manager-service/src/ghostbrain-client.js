/**
 * GhostBrain Core — Network Manager Agent Client
 *
 * Registers this service with GhostBrain Core as an autonomous AI network agent.
 * Publishes health and anomaly signals after every probe, accepts task dispatch
 * from the GhostBrain orchestrator, and sends periodic heartbeats.
 *
 * NATS subject conventions (mirrors ghostbrain-core/src/connectors/nats.ts):
 *   ghostbrain.agent.register                          — publish: self-registration
 *   ghostbrain.agent.<agentId>.task                    — subscribe: task from brain
 *   ghostbrain.agent.<agentId>.report                  — publish: heartbeat / results
 *   ghostbrain.signal.health                           — publish: healthy probe result
 *   ghostbrain.signal.anomaly                          — publish: failing probe result
 *
 * The NATS connection is best-effort — if NATS is unreachable the service
 * continues in degraded mode (no GhostBrain signalling) without crashing.
 */

import { connect, StringCodec } from "nats";
import { randomUUID } from "node:crypto";

// ─── Config ────────────────────────────────────────────────────────────────────
const AGENT_ID   = process.env.GHOSTBRAIN_AGENT_ID          || "network-manager-service";
const NATS_URL   = process.env.NATS_URL                     || "nats://ghostbrain-nats:4222";
const NATS_CONNECT_TIMEOUT_MS  = Number(process.env.NATS_CONNECT_TIMEOUT_MS  || "5000");
const HEARTBEAT_INTERVAL_MS    = Number(process.env.GHOSTBRAIN_HEARTBEAT_INTERVAL_MS || "30000");
const LAYER      = process.env.GHOSTBRAIN_AGENT_LAYER       || "L2";

// ─── Agent capabilities (mirrors ghostbrain-core AgentCapability type) ─────────
const CAPABILITIES = [
  "network.firewall.read",
  "network.dns.update",
  "network.tls.renew",
  "metrics.query",
  "logs.query",
  "policy.evaluate",
  "docker.ps",
];

const REGISTRATION_BASE = {
  agentId:        AGENT_ID,
  role:           "sentinel",
  capabilities:   CAPABILITIES,
  resourceScopes: [
    { kind: "network", id: "ghostl-services" },
    { kind: "layer",   id: LAYER },
  ],
  natsSubject: `ghostbrain.agent.${AGENT_ID}.task`,
  healthy: true,
};

// ─── State ─────────────────────────────────────────────────────────────────────
const sc = StringCodec();
let _nc             = null;
let _taskHandler    = null;
let _heartbeatTimer = null;

// ─── Internal: structured log ──────────────────────────────────────────────────
function _log(level, event, data) {
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    JSON.stringify({ ts: new Date().toISOString(), level, event, ...data })
  );
}

// ─── Internal: publish with envelope ──────────────────────────────────────────
function _publish(subject, payload, correlationId) {
  if (!_nc) return;
  const envelope = {
    messageId:    randomUUID(),
    subject,
    correlationId: correlationId ?? randomUUID(),
    senderAgentId: AGENT_ID,
    payload,
    sentAt:       new Date().toISOString(),
  };
  try {
    _nc.publish(subject, sc.encode(JSON.stringify(envelope)));
  } catch (err) {
    _log("warn", "ghostbrain_publish_error", { subject, err: String(err) });
  }
}

// ─── Internal: heartbeat ───────────────────────────────────────────────────────
function _sendHeartbeat() {
  const reg = { ...REGISTRATION_BASE, lastSeen: new Date().toISOString() };
  _publish("ghostbrain.agent.register", reg);
  _publish(`ghostbrain.agent.${AGENT_ID}.report`, {
    agentId: AGENT_ID,
    type:    "heartbeat",
    healthy: true,
    ts:      new Date().toISOString(),
  });
}

// ─── Internal: subscribe to task dispatch ──────────────────────────────────────
async function _subscribeTaskDispatch() {
  if (!_nc) return;
  const subject = `ghostbrain.agent.${AGENT_ID}.task`;
  const sub = _nc.subscribe(subject);
  _log("info", "ghostbrain_subscribed", { subject, agentId: AGENT_ID });

  void (async () => {
    for await (const m of sub) {
      try {
        const raw      = sc.decode(m.data);
        const envelope = JSON.parse(raw);
        const task     = envelope.payload ?? envelope;

        _log("info", "ghostbrain_task_received", {
          correlationId: envelope.correlationId,
          taskType:      task.type ?? "(unknown)",
        });

        let result = { ok: true };
        if (_taskHandler) {
          result = await _taskHandler(task).catch(err => ({
            ok: false, error: String(err),
          }));
        }

        _publish(`ghostbrain.agent.${AGENT_ID}.report`, {
          agentId:       AGENT_ID,
          type:          "task_result",
          correlationId: envelope.correlationId,
          result,
          ts:            new Date().toISOString(),
        }, envelope.correlationId);

      } catch (err) {
        _log("error", "ghostbrain_task_parse_error", { err: String(err) });
      }
    }
  })();
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Connect to GhostBrain Core via NATS and register as a network-AI agent.
 *
 * @param {((task: object) => Promise<object>) | null} onTask
 *   Handler called for autonomous task dispatch from GhostBrain.
 *   Must return a result object. Return `{ ok: false, error }` on failure.
 * @returns {Promise<boolean>} true if connected, false in degraded mode.
 */
export async function connectGhostBrain(onTask) {
  _taskHandler = onTask ?? null;
  try {
    _nc = await Promise.race([
      connect({ servers: NATS_URL }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("nats_connect_timeout")), NATS_CONNECT_TIMEOUT_MS)
      ),
    ]);

    _log("info", "ghostbrain_nats_connected", { url: NATS_URL, agentId: AGENT_ID, layer: LAYER });

    // Register with GhostBrain brain
    _publish("ghostbrain.agent.register", {
      ...REGISTRATION_BASE,
      lastSeen: new Date().toISOString(),
    });

    // Subscribe to task dispatch
    await _subscribeTaskDispatch();

    // Start heartbeat loop
    _heartbeatTimer = setInterval(_sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return true;
  } catch (err) {
    _log("warn", "ghostbrain_nats_unavailable", {
      err:    String(err),
      detail: "degraded mode — no GhostBrain signalling",
    });
    _nc = null;
    return false;
  }
}

/**
 * Publish a healthy health signal to GhostBrain.
 *
 * @param {{ ok: boolean, layer?: string, source?: string, metrics?: object, errors?: any[] }} signal
 */
export function publishHealthSignal({ ok, layer, source, metrics, errors }) {
  _publish("ghostbrain.signal.health", {
    source:  source  ?? AGENT_ID,
    layer:   layer   ?? LAYER,
    ok:      ok      ?? true,
    metrics: metrics ?? {},
    errors:  errors  ?? [],
    ts:      new Date().toISOString(),
  });
}

/**
 * Publish an anomaly signal (degraded / failing probe) to GhostBrain.
 *
 * @param {{ source?: string, layer?: string, severity?: string, description: string, metrics?: object, errors?: any[] }} signal
 */
export function publishAnomalySignal({ source, layer, severity, description, metrics, errors }) {
  _publish("ghostbrain.signal.anomaly", {
    source:      source      ?? AGENT_ID,
    layer:       layer       ?? LAYER,
    severity:    severity    ?? "warning",
    description: description ?? "anomaly detected",
    metrics:     metrics     ?? {},
    errors:      errors      ?? [],
    ts:          new Date().toISOString(),
  });
}

/**
 * Gracefully disconnect from NATS.
 */
export async function disconnectGhostBrain() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  if (_nc) {
    try { await _nc.drain(); } catch { /* ignore on shutdown */ }
    _nc = null;
  }
}
