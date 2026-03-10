// GhostBrain Swarm — NATS communication bus
// Lazy singleton connection with reconnect backoff + silent fallback queue
import type { NatsConnection, StringCodec as StringCodecType } from 'nats';
import type { SwarmMessage, AgentHeartbeat } from './swarmProtocol.js';
import { CONFIG } from '../config/agentConfig.js';

type NatsModule = typeof import('nats');

let _nc: NatsConnection | null = null;
let _sc: ReturnType<StringCodecType> | null = null;
let _connecting = false;
let _backoffMs = 1_000;
const MAX_BACKOFF_MS = 60_000;

// Messages queued while NATS is unavailable
const _fallbackQueue: Array<{ subject: string; data: string }> = [];
const MAX_QUEUE = 200;

async function loadNats(): Promise<NatsModule | null> {
  try {
    return await import('nats') as NatsModule;
  } catch {
    return null;
  }
}

async function tryConnect(): Promise<void> {
  if (_connecting) return;
  _connecting = true;
  try {
    const natsLib = await loadNats();
    if (!natsLib) {
      console.warn('[swarmBus] nats package unavailable — running in offline mode');
      return;
    }
    const { connect, StringCodec } = natsLib;
    _nc = await connect({
      servers: CONFIG.natsUrl,
      reconnect: true,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2_000,
    });
    _sc = StringCodec();
    _backoffMs = 1_000;
    console.log(`[swarmBus] connected to NATS at ${CONFIG.natsUrl}`);

    // Drain the fallback queue
    for (const item of _fallbackQueue.splice(0)) {
      try {
        _nc.publish(item.subject, _sc.encode(item.data));
      } catch { /* discard if publish fails at drain */ }
    }

    // Clear connection on close
    void _nc.closed().then(() => {
      console.warn('[swarmBus] NATS connection closed');
      _nc = null;
      _sc = null;
      scheduleReconnect();
    });
  } catch (err) {
    console.warn(`[swarmBus] NATS connect failed (retry in ${_backoffMs}ms):`, (err as Error).message);
    scheduleReconnect();
  } finally {
    _connecting = false;
  }
}

function scheduleReconnect(): void {
  setTimeout(() => { void tryConnect(); }, _backoffMs);
  _backoffMs = Math.min(_backoffMs * 2, MAX_BACKOFF_MS);
}

/** Initialise the bus — call once on startup */
export async function initBus(): Promise<void> {
  await tryConnect();
}

/** Publish a SwarmMessage. Falls back to in-memory queue if NATS is offline. */
export function publish(topic: string, msg: SwarmMessage | AgentHeartbeat): void {
  const data = JSON.stringify(msg);
  if (_nc && _sc) {
    try {
      _nc.publish(topic, _sc.encode(data));
      return;
    } catch (err) {
      console.warn(`[swarmBus] publish error on ${topic}:`, (err as Error).message);
    }
  }
  // Queue for when connection is restored
  if (_fallbackQueue.length < MAX_QUEUE) {
    _fallbackQueue.push({ subject: topic, data });
  }
}

/** Subscribe to a NATS subject — returns an async iterator over raw JSON strings. */
export async function subscribe(subject: string): Promise<AsyncIterable<string> | null> {
  if (!_nc || !_sc) return null;
  const sc = _sc;
  const sub = _nc.subscribe(subject);
  return {
    [Symbol.asyncIterator]() {
      return (async function* () {
        for await (const m of sub) {
          yield sc.decode(m.data);
        }
      })();
    },
  };
}

export function isConnected(): boolean {
  return _nc !== null;
}
