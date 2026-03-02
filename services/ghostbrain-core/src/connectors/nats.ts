/**
 * GhostBrain Core — NATS Connector
 *
 * GhostBrain publishes task assignments and subscribes to agent reports
 * over the NATS message bus. All messages are envelope-wrapped and include
 * correlation IDs for traceability.
 *
 * Subject conventions:
 *   ghostbrain.agent.register        — agent → brain: registration
 *   ghostbrain.agent.{agentId}.task  — brain → agent: task dispatch
 *   ghostbrain.agent.{agentId}.report — agent → brain: result/heartbeat
 *   ghostbrain.signal.health         — any → brain: health signals
 *   ghostbrain.signal.anomaly        — any → brain: anomaly signals
 */

import { connect, type NatsConnection, StringCodec, type Subscription } from "nats";
import { NATS_URL } from "../config.js";
import { logger } from "../logger.js";
import type { BrainMessage, AgentRegistration, HealthSignal } from "../types.js";
import { v4 as uuidv4 } from "uuid";

const sc = StringCodec();

let _nc: NatsConnection | null = null;

export async function connectNATS(): Promise<NatsConnection> {
  if (_nc) return _nc;
  _nc = await connect({ servers: NATS_URL });
  logger.info("NATS connected", { url: NATS_URL });
  return _nc;
}

export async function disconnectNATS(): Promise<void> {
  if (_nc) {
    await _nc.drain();
    _nc = null;
    logger.info("NATS disconnected");
  }
}

export function getNATSConnection(): NatsConnection {
  if (!_nc) throw new Error("NATS not connected. Call connectNATS() first.");
  return _nc;
}

// ─── Publish helpers ──────────────────────────────────────────────────────────
export function publish<T>(
  subject: string,
  payload: T,
  correlationId?: string,
): void {
  const nc = getNATSConnection();
  const envelope: BrainMessage<T> = {
    messageId: uuidv4(),
    subject,
    correlationId: correlationId ?? uuidv4(),
    senderAgentId: "ghostbrain-core",
    payload,
    sentAt: new Date().toISOString(),
  };
  nc.publish(subject, sc.encode(JSON.stringify(envelope)));
}

// ─── Subscribe helpers ────────────────────────────────────────────────────────
export function subscribe<T>(
  subject: string,
  handler: (msg: BrainMessage<T>) => void | Promise<void>,
): Subscription {
  const nc = getNATSConnection();
  const sub = nc.subscribe(subject);

  void (async () => {
    for await (const m of sub) {
      try {
        const raw = sc.decode(m.data);
        const envelope = JSON.parse(raw) as BrainMessage<T>;
        await handler(envelope);
      } catch (err) {
        logger.error("NATS message parse error", { subject, err: String(err) });
      }
    }
  })();

  return sub;
}

// ─── Agent registration subscriber ───────────────────────────────────────────
export function subscribeAgentRegistrations(
  onRegister: (reg: AgentRegistration) => void,
): Subscription {
  return subscribe<AgentRegistration>("ghostbrain.agent.register", msg => {
    logger.info("Agent registered", { agentId: msg.payload.agentId, role: msg.payload.role });
    onRegister(msg.payload);
  });
}

// ─── Health signal subscriber ─────────────────────────────────────────────────
export function subscribeHealthSignals(
  onSignal: (signal: HealthSignal) => void,
): Subscription {
  return subscribe<HealthSignal>("ghostbrain.signal.health", msg => {
    onSignal(msg.payload);
  });
}

export function subscribeAnomalySignals(
  onAnomaly: (signal: HealthSignal) => void,
): Subscription {
  return subscribe<HealthSignal>("ghostbrain.signal.anomaly", msg => {
    onAnomaly(msg.payload);
  });
}

// ─── Task dispatch ────────────────────────────────────────────────────────────
export function dispatchTask(agentId: string, task: unknown, correlationId: string): void {
  publish(`ghostbrain.agent.${agentId}.task`, task, correlationId);
}

// ─── Report subscriber ────────────────────────────────────────────────────────
export function subscribeAgentReport(
  agentId: string,
  onReport: (report: unknown) => void,
): Subscription {
  return subscribe(`ghostbrain.agent.${agentId}.report`, msg => {
    onReport(msg.payload);
  });
}
