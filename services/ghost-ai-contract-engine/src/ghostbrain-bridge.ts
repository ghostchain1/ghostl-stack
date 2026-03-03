// SPDX-License-Identifier: MIT
// GhostChain · GhostBrain AI Contract Engine — GhostBrain NATS Bridge

import { connect, NatsConnection, StringCodec } from "nats";
import type { GhostBrainContractEvent, EngineCycle } from "./types.js";
import { NATS_URL } from "./config.js";
import { log } from "./logger.js";

const SUBJECT      = "ghostcontract.events";
const CYCLE_SUBJ   = "ghostcontract.cycle";
const REGISTER_URL = process.env["GHOSTBRAIN_URL"] ?? "http://localhost:7900";

const sc = StringCodec();

let _nc: NatsConnection | null = null;

/// Connect to NATS (idempotent). Returns connected client.
async function _connect(): Promise<NatsConnection | null> {
  if (_nc && !_nc.isClosed()) return _nc;
  try {
    _nc = await connect({
      servers: NATS_URL,
      reconnect: true,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
      name: "ghost-ai-contract-engine",
    });
    log.info("NATS connected", { servers: NATS_URL });
    _nc.closed().then(() => {
      log.warn("NATS connection closed");
      _nc = null;
    });
    return _nc;
  } catch (err) {
    log.error("NATS connect failed", { err: String(err) });
    return null;
  }
}

/// Publish a typed contract event to GhostBrain.
export async function publishEvent(event: GhostBrainContractEvent): Promise<void> {
  const nc = await _connect();
  if (!nc) {
    log.warn("NATS unavailable — dropping event", { event: event.event });
    return;
  }
  try {
    nc.publish(SUBJECT, sc.encode(JSON.stringify(event)));
  } catch (err) {
    log.error("NATS publish failed", { err: String(err), event: event.event });
  }
}

/// Publish an entire engine cycle summary.
export async function publishCycle(cycle: EngineCycle): Promise<void> {
  const nc = await _connect();
  if (!nc) {
    log.warn("NATS unavailable — dropping cycle");
    return;
  }
  try {
    nc.publish(CYCLE_SUBJ, sc.encode(JSON.stringify(cycle)));
    log.info("Cycle published", {
      errors:   cycle.scan.errors.length,
      fixes:    cycle.fixes.length,
      brands:   cycle.brands.length,
      compile:  cycle.compile.status,
    });
  } catch (err) {
    log.error("NATS cycle publish failed", { err: String(err) });
  }
}

/// Register with GhostBrain Core via HTTP.
export async function registerWithGhostBrain(): Promise<void> {
  const body = JSON.stringify({
    name:         "ghost-ai-contract-engine",
    port:         Number(process.env["PORT"] ?? 7611),
    capabilities: ["contract-scan", "contract-fix", "contract-brand", "contract-compile"],
    version:      "1.0.0",
  });
  try {
    const res = await fetch(`${REGISTER_URL}/api/agents/register`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.ok) {
      log.info("Registered with GhostBrain Core");
    } else {
      log.warn("GhostBrain registration non-ok", { status: res.status });
    }
  } catch (err) {
    log.warn("GhostBrain registration failed (will retry on next tick)", { err: String(err) });
  }
}

/// Gracefully drain and close the NATS connection.
export async function closeBridge(): Promise<void> {
  if (_nc && !_nc.isClosed()) {
    await _nc.drain();
  }
}
