/**
 * signals.ts
 *
 * POST /signals
 * Receives on-chain events, governance actions, and bridge events
 * forwarded by governance-event-bridge or other producers. Stores
 * each signal to the in-memory queue and broadcasts to subscribers.
 */

import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";
import pino from "pino";

const log = pino({ name: "ghostbrain-core/signals" });

// ── In-memory signal store (last 500 signals) ─────────────────────────────────
const MAX_SIGNALS = 500;
const signalQueue: GhostSignal[] = [];

export interface GhostSignal {
  id: string;
  source: string;           // e.g. "governance-event-bridge", "validator-fabric"
  type: string;             // e.g. "ProposalCreated", "ValidatorSlashed"
  payload: Record<string, unknown>;
  receivedAt: string;       // ISO 8601
}

// ── Subscriber callbacks (internal, same process) ─────────────────────────────
type SignalHandler = (signal: GhostSignal) => void;
const subscribers: SignalHandler[] = [];

export function subscribeToSignals(handler: SignalHandler): void {
  subscribers.push(handler);
}

function generateId(): string {
  return `sig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function ingest(raw: Omit<GhostSignal, "id" | "receivedAt">): GhostSignal {
  const signal: GhostSignal = {
    ...raw,
    id: generateId(),
    receivedAt: new Date().toISOString(),
  };

  signalQueue.push(signal);
  if (signalQueue.length > MAX_SIGNALS) {
    signalQueue.shift();
  }

  subscribers.forEach((h) => {
    try { h(signal); } catch (err) { log.warn({ err }, "signal subscriber error"); }
  });

  return signal;
}

// ── Router ────────────────────────────────────────────────────────────────────
const router: RouterType = Router();

/**
 * POST /signals
 * Body: { source, type, payload }
 */
router.post("/", (req: Request, res: Response) => {
  const { source, type, payload } = req.body as Partial<GhostSignal>;

  if (!source || !type) {
    res.status(400).json({ ok: false, error: "source and type are required" });
    return;
  }

  const signal = ingest({
    source: String(source),
    type: String(type),
    payload: (payload as Record<string, unknown>) ?? {},
  });

  log.info({ id: signal.id, type: signal.type, source: signal.source }, "signal ingested");
  res.status(202).json({ ok: true, id: signal.id });
});

/**
 * GET /signals
 * Returns the last N signals (query param: limit, default 50)
 */
router.get("/", (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query["limit"] ?? 50), MAX_SIGNALS);
  res.json({ ok: true, signals: signalQueue.slice(-limit) });
});

export default router;
