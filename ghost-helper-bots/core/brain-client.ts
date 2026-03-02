/**
 * GhostBrain Client — ghost-helper-bots
 *
 * Connects the bot-loop to GhostBrain Core via two transports:
 *   • NATS (preferred)  — direct low-latency pub/sub
 *   • HTTP fallback     — POST /api/v1/signals + /api/v1/agents/register
 *
 * The client:
 *   1. Registers the bots as a "sentinel" + "executor" agent on startup
 *   2. Publishes health/anomaly signals after each bot stage
 *   3. Subscribes to ghostbrain.agent.ghost-helper-bots.task for inbound tasks
 *   4. Sends heartbeats every 60 seconds so GhostBrain knows the agent is alive
 *
 * Subjects used:
 *   ghostbrain.agent.register           — registration
 *   ghostbrain.signal.health            — normal health signal
 *   ghostbrain.signal.anomaly           — anomaly signal
 *   ghostbrain.agent.ghost-helper-bots.task   — inbound task assignments
 *   ghostbrain.agent.ghost-helper-bots.report — outbound task reports
 */

import { connect, type NatsConnection, StringCodec } from "nats";
import { randomUUID } from "node:crypto";

export type Layer = "L1" | "L2" | "L3";

export interface HealthSignalPayload {
  signalId?: string;
  source: "docker" | "manual" | "nats";
  service?: string;
  layer?: Layer;
  metric?: string;
  value?: number;
  threshold?: number;
  logLine?: string;
  observedAt?: string;
  anomaly: boolean;
}

export interface BrainMessage<T = unknown> {
  messageId: string;
  subject: string;
  correlationId: string;
  senderAgentId: string;
  payload: T;
  sentAt: string;
}

const AGENT_ID = "ghost-helper-bots";
const sc = StringCodec();

let _nc: NatsConnection | null = null;

// ─── Envelope factory ──────────────────────────────────────────────────────
function envelope<T>(subject: string, payload: T, correlationId?: string): string {
  const msg: BrainMessage<T> = {
    messageId: randomUUID(),
    subject,
    correlationId: correlationId ?? randomUUID(),
    senderAgentId: AGENT_ID,
    payload,
    sentAt: new Date().toISOString(),
  };
  return JSON.stringify(msg);
}

// ─── Connect ───────────────────────────────────────────────────────────────
export async function connectBrain(natsUrl: string): Promise<void> {
  if (_nc) return;
  try {
    _nc = await connect({ servers: natsUrl, reconnect: true, maxReconnectAttempts: -1 });
    console.log(`[brain-client] NATS connected → ${natsUrl}`);
    await _registerAgent();
    _startHeartbeat();
    _subscribeToTasks();
  } catch (err) {
    console.warn(`[brain-client] NATS unavailable (${String(err)}) — signal publishing disabled`);
    _nc = null;
  }
}

export async function disconnectBrain(): Promise<void> {
  if (_nc) {
    await _nc.drain();
    _nc = null;
  }
}

// ─── Agent registration ────────────────────────────────────────────────────
async function _registerAgent(): Promise<void> {
  const now = new Date().toISOString();
  const reg = {
    agentId: AGENT_ID,
    role: "sentinel",
    capabilities: [
      "docker.ps",
      "metrics.query",
      "logs.query",
      "policy.evaluate",
    ],
    resourceScopes: [
      { type: "stack", name: "ghostl-stack", layer: "L2" as Layer },
    ],
    natsSubject: `ghostbrain.agent.${AGENT_ID}.task`,
    registeredAt: now,
    lastSeen: now,
    healthy: true,
  };
  _publish("ghostbrain.agent.register", reg);
  console.log("[brain-client] Agent registered with GhostBrain Core");
}

// ─── Heartbeat ─────────────────────────────────────────────────────────────
function _startHeartbeat(): void {
  setInterval(() => {
    const sig: HealthSignalPayload = {
      signalId: randomUUID(),
      source: "manual",
      service: AGENT_ID,
      layer: "L2",
      metric: "agent.alive",
      value: 1,
      observedAt: new Date().toISOString(),
      anomaly: false,
    };
    _publish("ghostbrain.signal.health", sig);
  }, 60_000);
}

// ─── Task subscription ─────────────────────────────────────────────────────
function _subscribeToTasks(): void {
  if (!_nc) return;
  const sub = _nc.subscribe(`ghostbrain.agent.${AGENT_ID}.task`);
  void (async () => {
    for await (const m of sub) {
      try {
        const msg = JSON.parse(sc.decode(m.data)) as BrainMessage;
        console.log(`[brain-client] Task received: ${JSON.stringify(msg.payload)}`);
        // Acknowledge back — actual execution would be handled by the loop stages
        _reportResult(msg.correlationId, { status: "acknowledged", agentId: AGENT_ID });
      } catch (err) {
        console.error("[brain-client] Task parse error:", err);
      }
    }
  })();
}

// ─── Signal publish ────────────────────────────────────────────────────────
export function publishSignal(signal: HealthSignalPayload): void {
  const enriched: HealthSignalPayload = {
    signalId: signal.signalId ?? randomUUID(),
    observedAt: signal.observedAt ?? new Date().toISOString(),
    ...signal,
  };
  const subject = enriched.anomaly ? "ghostbrain.signal.anomaly" : "ghostbrain.signal.health";
  _publish(subject, enriched);
}

export function publishStageSignal(stage: string, ok: boolean, service?: string): void {
  publishSignal({
    source: "manual",
    service: service ?? AGENT_ID,
    layer: "L2",
    metric: `bot.stage.${stage}`,
    value: ok ? 1 : 0,
    logLine: `Bot stage '${stage}' completed — ${ok ? "OK" : "FAILED"}`,
    observedAt: new Date().toISOString(),
    anomaly: !ok,
  });
}

// ─── Internal publish ──────────────────────────────────────────────────────
function _publish<T>(subject: string, payload: T): void {
  if (!_nc) return;
  _nc.publish(subject, sc.encode(envelope(subject, payload)));
}

function _reportResult(correlationId: string, result: unknown): void {
  _publish(`ghostbrain.agent.${AGENT_ID}.report`, {
    correlationId,
    result,
    reportedAt: new Date().toISOString(),
  });
}
