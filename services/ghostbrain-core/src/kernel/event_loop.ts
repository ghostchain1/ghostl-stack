/**
 * GhostBrain Core — Kernel Event Loop
 *
 * Typed, in-process async event bus used by kernel/brain.ts to decouple
 * subsystems. Handlers are called sequentially per event type so they
 * can freely await without race conditions.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type BrainEventType =
  | "THRESHOLD_BREACH"
  | "CRASH_PREDICTED"
  | "RECOVERY_NEEDED"
  | "REBALANCE_NEEDED"
  | "CLUSTER_SYNC"
  | "MEMORY_PRESSURE"
  | "TICK";

export interface BrainEvent<P = unknown> {
  type:      BrainEventType;
  payload?:  P;
  emittedAt: number;
}

type Handler<P = unknown> = (ev: BrainEvent<P>) => Promise<void> | void;

// ── State ─────────────────────────────────────────────────────────────────────

const _handlers = new Map<BrainEventType, Handler[]>();
const _queue: BrainEvent[] = [];
let   _running = false;
let   _processHandle: ReturnType<typeof setImmediate> | null = null;

// ── Stats ─────────────────────────────────────────────────────────────────────

let _emitted = 0;
let _dispatched = 0;

// ── Internal ──────────────────────────────────────────────────────────────────

async function drainQueue(): Promise<void> {
  while (_queue.length > 0 && _running) {
    const ev = _queue.shift()!;
    _dispatched++;
    const handlers = _handlers.get(ev.type) ?? [];
    for (const h of handlers) {
      try { await h(ev); } catch { /* handler errors must not crash the loop */ }
    }
  }
  _processHandle = null;
  if (_queue.length > 0 && _running) scheduleProcess();
}

function scheduleProcess(): void {
  if (_processHandle) return;
  _processHandle = setImmediate(() => { void drainQueue(); });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function emitBrainEvent<P = unknown>(type: BrainEventType, payload?: P): void {
  if (!_running) return;
  _emitted++;
  _queue.push({ type, payload, emittedAt: Date.now() });
  scheduleProcess();
}

export function onBrainEvent<P = unknown>(type: BrainEventType, handler: Handler<P>): () => void {
  if (!_handlers.has(type)) _handlers.set(type, []);
  _handlers.get(type)!.push(handler as Handler);
  return () => {
    const list = _handlers.get(type);
    if (list) {
      const idx = list.indexOf(handler as Handler);
      if (idx !== -1) list.splice(idx, 1);
    }
  };
}

export function startEventLoop(): void {
  _running = true;
}

export function stopEventLoop(): void {
  _running = false;
  if (_processHandle) { clearImmediate(_processHandle); _processHandle = null; }
  _queue.length = 0;
}

export function eventLoopStats(): {
  running: boolean; queueDepth: number; emitted: number; dispatched: number;
} {
  return { running: _running, queueDepth: _queue.length, emitted: _emitted, dispatched: _dispatched };
}
