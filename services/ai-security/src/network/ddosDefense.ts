/**
 * ddosDefense.ts — In-process DDoS / rate-abuse detection
 *
 * Maintains a sliding-window request counter per source IP (or identifier).
 * Call `recordRequest(ip)` from your middleware.  The `checkDDoS()` function
 * runs the analysis and can auto-block IPs via the intrusionDetector module.
 *
 * This module does NOT make outbound calls — all state is in-memory.
 * Blocked IPs are stored with a configurable TTL and re-allowed automatically.
 *
 * For production, complement with nginx rate_limit or Cloudflare WAF rules.
 */

import logger from "../utils/logger";

export interface TrafficEntry {
  ip: string;
  requestCount: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil?: number;
}

export interface DDoSEvent {
  timestamp: string;
  ip: string;
  requestCount: number;
  action: "blocked" | "rate-limited" | "cleared";
  reason: string;
}

const WINDOW_MS              = Number(process.env.ASE_DDOS_WINDOW_MS   ?? 10_000);  // 10 s
const RATE_LIMIT_THRESHOLD   = Number(process.env.ASE_RATE_LIMIT_REQ   ?? 100);    // req/window
const BLOCK_THRESHOLD        = Number(process.env.ASE_DDOS_BLOCK_REQ   ?? 200);    // req/window
const BLOCK_TTL_MS           = Number(process.env.ASE_DDOS_BLOCK_TTL   ?? 300_000); // 5 min

const counters = new Map<string, TrafficEntry>();
const events: DDoSEvent[] = [];
const MAX_EVENTS = 500;

// ── Public ingestion API ──────────────────────────────────────────────────────

export function recordRequest(ip: string): { allowed: boolean } {
  const now     = Date.now();
  const existing = counters.get(ip);

  if (existing?.blocked) {
    if (existing.blockedUntil && now > existing.blockedUntil) {
      // TTL expired — unblock
      existing.blocked      = false;
      existing.blockedUntil = undefined;
      existing.requestCount = 1;
      existing.windowStart  = now;
    } else {
      return { allowed: false };
    }
  }

  if (!existing || now - existing.windowStart > WINDOW_MS) {
    counters.set(ip, { ip, requestCount: 1, windowStart: now, blocked: false });
    return { allowed: true };
  }

  existing.requestCount++;
  return { allowed: !existing.blocked };
}

// ── Detection cycle ───────────────────────────────────────────────────────────

export function checkDDoS(): DDoSEvent[] {
  const now       = Date.now();
  const newEvents: DDoSEvent[] = [];

  // Clean up stale windows
  for (const [ip, entry] of counters.entries()) {
    if (!entry.blocked && now - entry.windowStart > WINDOW_MS * 3) {
      counters.delete(ip);
    }
  }

  for (const entry of counters.values()) {
    if (entry.blocked) continue;
    if (entry.requestCount <= RATE_LIMIT_THRESHOLD) continue;

    let action: DDoSEvent["action"] = "rate-limited";
    if (entry.requestCount >= BLOCK_THRESHOLD) {
      entry.blocked      = true;
      entry.blockedUntil = now + BLOCK_TTL_MS;
      action             = "blocked";
      logger.warn(`[DDoSDefense] BLOCKED ${entry.ip}: ${entry.requestCount} req/${WINDOW_MS / 1000}s`);
    } else {
      logger.info(`[DDoSDefense] Rate-limiting ${entry.ip}: ${entry.requestCount} req/${WINDOW_MS / 1000}s`);
    }

    const ev: DDoSEvent = {
      timestamp:    new Date().toISOString(),
      ip:           entry.ip,
      requestCount: entry.requestCount,
      action,
      reason:       `${entry.requestCount} requests in ${WINDOW_MS / 1000} s window`,
    };
    newEvents.push(ev);
    events.unshift(ev);
  }

  if (events.length > MAX_EVENTS) events.splice(MAX_EVENTS);
  return newEvents;
}

// ── Manual block / unblock ────────────────────────────────────────────────────

export function blockIp(ip: string, ttlMs = BLOCK_TTL_MS): void {
  const now = Date.now();
  counters.set(ip, {
    ip,
    requestCount: BLOCK_THRESHOLD + 1,
    windowStart:  now,
    blocked:      true,
    blockedUntil: now + ttlMs,
  });
  const ev: DDoSEvent = {
    timestamp: new Date().toISOString(),
    ip,
    requestCount: 0,
    action:       "blocked",
    reason:       "Manually blocked",
  };
  events.unshift(ev);
  if (events.length > MAX_EVENTS) events.splice(MAX_EVENTS);
  logger.info(`[DDoSDefense] Manually blocked ${ip}`);
}

export function unblockIp(ip: string): void {
  const entry = counters.get(ip);
  if (entry) { entry.blocked = false; entry.blockedUntil = undefined; }
  counters.delete(ip);
  logger.info(`[DDoSDefense] Unblocked ${ip}`);
}

// ── Status ─────────────────────────────────────────────────────────────────────

export function getBlockedIps(): TrafficEntry[] {
  return [...counters.values()].filter((e) => e.blocked);
}

export function getNetworkStatus() {
  const tracked = counters.size;
  const blocked  = [...counters.values()].filter((e) => e.blocked).length;
  return {
    trackedIps:   tracked,
    blockedIps:   blocked,
    totalEvents:  events.length,
    thresholds:   { rateLimit: RATE_LIMIT_THRESHOLD, block: BLOCK_THRESHOLD, windowSecs: WINDOW_MS / 1000 },
  };
}

export function getDDoSEvents(limit = 50): DDoSEvent[] { return events.slice(0, limit); }
