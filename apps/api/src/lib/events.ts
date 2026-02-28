import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type EventScope = 'ai' | 'integrations' | 'auth' | 'webhook' | 'analytics' | 'identity';
export type EventStatus = 'ok' | 'error';

export type EventRecord = {
  id: string;
  scope: EventScope;
  type: string;
  status: EventStatus;
  actorId?: string;
  payload?: Record<string, unknown>;
  at: string;
};

type EventInput = {
  scope: EventScope;
  type: string;
  status: EventStatus;
  actorId?: string;
  payload?: Record<string, unknown>;
};

type EventQuery = {
  scope?: EventScope;
  limit?: number;
};

const resolveEventsPath = () => {
  if (process.env.EVENTS_PATH) return process.env.EVENTS_PATH;
  const authPath = process.env.AUTH_DB_PATH || process.env.SQLITE_DB_PATH;
  if (authPath) return path.join(path.dirname(authPath), 'events.json');
  return 'data/events.json';
};

const EVENTS_PATH = resolveEventsPath();
const EVENTS_MAX = Number(process.env.EVENTS_MAX || 2000);

let cache: EventRecord[] | null = null;
let writeQueue: Promise<void> = Promise.resolve();

const ensureCache = () => {
  if (cache) return;
  try {
    const raw = fs.readFileSync(EVENTS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    cache = Array.isArray(parsed) ? (parsed as EventRecord[]) : [];
  } catch {
    cache = [];
  }
};

const enqueueWrite = async () => {
  const dir = path.dirname(EVENTS_PATH);
  writeQueue = writeQueue
    .then(async () => {
      fs.mkdirSync(dir, { recursive: true });
      await fs.promises.writeFile(EVENTS_PATH, JSON.stringify(cache, null, 2));
    })
    .catch(() => undefined);
  return writeQueue;
};

export const emitEvent = async (input: EventInput): Promise<EventRecord> => {
  ensureCache();
  const record: EventRecord = {
    id: crypto.randomUUID(),
    scope: input.scope,
    type: input.type,
    status: input.status,
    actorId: input.actorId,
    payload: input.payload,
    at: new Date().toISOString()
  };
  cache!.push(record);
  if (cache!.length > EVENTS_MAX) {
    cache = cache!.slice(-EVENTS_MAX);
  }
  await enqueueWrite();
  return record;
};

export const getEvents = async ({ scope, limit = 20 }: EventQuery): Promise<EventRecord[]> => {
  ensureCache();
  const filtered = scope ? cache!.filter((event) => event.scope === scope) : cache!;
  const sliceStart = Math.max(filtered.length - limit, 0);
  return filtered.slice(sliceStart).reverse();
};

export const getWebhookDeliveries = async (limit = 20): Promise<EventRecord[]> => {
  return getEvents({ scope: 'webhook', limit });
};

export const getWebhookSummary = async () => {
  ensureCache();
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  const webhookEvents = cache!.filter((event) => event.scope === 'webhook');
  const recent = webhookEvents.filter((event) => {
    const at = Date.parse(event.at);
    return Number.isFinite(at) && now - at <= windowMs;
  });
  const failures = recent.filter((event) => event.status === 'error');
  const latest = webhookEvents[webhookEvents.length - 1];
  const lastError = [...webhookEvents].reverse().find((event) => event.status === 'error');
  return {
    total24h: recent.length,
    failures24h: failures.length,
    lastDeliveryAt: latest?.at,
    lastError: (lastError?.payload?.error as string | undefined) || (lastError ? lastError.type : undefined)
  };
};
