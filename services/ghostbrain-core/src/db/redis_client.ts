/**
 * GhostBrain Core — Redis Real-Time Memory Client
 *
 * Hot / real-time memory layer. Wraps ioredis with graceful degradation:
 * if GHOSTBRAIN_REDIS_URL is not set the module falls back to an in-process
 * LRU-style Map (same behavior, no persistence across restarts).
 *
 * Target latency: < 5 ms per operation.
 *
 * Env vars:
 *   GHOSTBRAIN_REDIS_URL  — Redis connection URL, e.g. redis://localhost:6379
 *   REDIS_PASSWORD        — optional password (overrides any password in URL)
 *
 * TTL conventions used by GhostBrain:
 *   Real-time state    300 s   (5 min)
 *   Active decisions   600 s   (10 min)
 *   Metrics cache      60 s
 *   AI predictions     120 s
 *   Daily counters     86 400 s
 */

import Redis from "ioredis";

let _redis: Redis | null = null;
let _ready = false;

// ── In-process fallback ───────────────────────────────────────────────────────

interface FallbackEntry { value: string; expiresAt: number }
const _fallback = new Map<string, FallbackEntry>();

function evictExpired(): void {
  const now = Date.now();
  for (const [k, v] of _fallback) if (now > v.expiresAt) _fallback.delete(k);
}

setInterval(evictExpired, 60_000).unref();

// ── Initialization ────────────────────────────────────────────────────────────

export function isRedisReady(): boolean {
  return _ready;
}

export async function initRedis(): Promise<void> {
  const url = process.env.GHOSTBRAIN_REDIS_URL;
  if (!url) {
    console.warn(
      "[ghostbrain-redis] GHOSTBRAIN_REDIS_URL not set — using in-process fallback." +
      " Real-time state will not survive restarts.",
    );
    return;
  }

  try {
    _redis = new Redis(url, {
      password:               process.env.REDIS_PASSWORD,
      maxRetriesPerRequest:   3,
      enableReadyCheck:       true,
      lazyConnect:            true,
      connectTimeout:         5_000,
      commandTimeout:         3_000,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2_000)),
    });

    await _redis.connect();
    await _redis.ping();
    _ready = true;

    _redis.on("error",  (e)  => { console.error("[ghostbrain-redis] error:", e.message); _ready = false; });
    _redis.on("ready",  ()   => { _ready = true; });
    _redis.on("close",  ()   => { _ready = false; });

    console.info("[ghostbrain-redis] Redis real-time memory connected");
  } catch (err) {
    console.error("[ghostbrain-redis] Connection failed — using in-process fallback:", (err as Error).message);
    _redis = null;
    _ready = false;
  }
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit().catch(() => null);
    _redis = null;
    _ready = false;
  }
}

// ── Core operations ───────────────────────────────────────────────────────────

/** Store a value with TTL in seconds (default 5 min). */
export async function rSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  const serialized = JSON.stringify(value);
  if (_redis && _ready) {
    await _redis.setex(key, ttlSeconds, serialized).catch((e) =>
      console.error("[ghostbrain-redis] setex error:", e.message),
    );
    return;
  }
  evictExpired();
  _fallback.set(key, { value: serialized, expiresAt: Date.now() + ttlSeconds * 1_000 });
}

/** Retrieve a value. Returns null if missing or expired. */
export async function rGet<T>(key: string): Promise<T | null> {
  if (_redis && _ready) {
    const raw = await _redis.get(key).catch(() => null);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; }
    catch { return null; }
  }
  const entry = _fallback.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _fallback.delete(key); return null; }
  try { return JSON.parse(entry.value) as T; }
  catch { return null; }
}

/** Atomically increment a counter. Resets TTL on each call. */
export async function rIncr(key: string, ttlSeconds = 3_600): Promise<number> {
  if (_redis && _ready) {
    const val = await _redis.incr(key).catch(() => 0);
    if (val === 1) await _redis.expire(key, ttlSeconds).catch(() => null);
    return val;
  }
  const entry = _fallback.get(key);
  const current = entry ? (JSON.parse(entry.value) as number) : 0;
  const next = current + 1;
  _fallback.set(key, { value: JSON.stringify(next), expiresAt: Date.now() + ttlSeconds * 1_000 });
  return next;
}

/** Push to head of a list, trim to maxLen. */
export async function rLPush(
  key: string,
  value: unknown,
  maxLen    = 1_000,
  ttlSeconds = 86_400,
): Promise<void> {
  const serialized = JSON.stringify(value);
  if (_redis && _ready) {
    const pipe = _redis.pipeline();
    pipe.lpush(key, serialized);
    pipe.ltrim(key, 0, maxLen - 1);
    pipe.expire(key, ttlSeconds);
    await pipe.exec().catch((e) => console.error("[ghostbrain-redis] lpush error:", e.message));
    return;
  }
  const existing = await rGet<unknown[]>(key) ?? [];
  existing.unshift(JSON.parse(serialized));
  if (existing.length > maxLen) existing.length = maxLen;
  await rSet(key, existing, ttlSeconds);
}

/** Read a range from a list. stop=-1 means all elements from start. */
export async function rLRange<T>(key: string, start = 0, stop = -1): Promise<T[]> {
  if (_redis && _ready) {
    const raw = await _redis.lrange(key, start, stop).catch(() => [] as string[]);
    return raw.flatMap((r) => {
      try { return [JSON.parse(r) as T]; }
      catch { return []; }
    });
  }
  const arr = await rGet<T[]>(key) ?? [];
  return stop === -1 ? arr.slice(start) : arr.slice(start, stop + 1);
}

/** Delete a key. */
export async function rDel(key: string): Promise<void> {
  if (_redis && _ready) {
    await _redis.del(key).catch(() => null);
    return;
  }
  _fallback.delete(key);
}

/** Get multiple keys at once (mget). Returns array of T|null. */
export async function rMGet<T>(keys: string[]): Promise<(T | null)[]> {
  if (keys.length === 0) return [];
  if (_redis && _ready) {
    const raws = await _redis.mget(...keys).catch(() => keys.map(() => null));
    return raws.map((r) => {
      if (!r) return null;
      try { return JSON.parse(r) as T; }
      catch { return null; }
    });
  }
  return Promise.all(keys.map((k) => rGet<T>(k)));
}

/** Report size of the fallback map (useful for health checks). */
export function fallbackSize(): number {
  return _fallback.size;
}
