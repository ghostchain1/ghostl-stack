/**
 * Load Monitor — GhostBrain Infrastructure AI
 *
 * Collects real-time platform metrics every POLL_INTERVAL_MS.
 * Metrics are stored in SQLite for trending and fed into the
 * AutoScaleController to drive scaling decisions.
 *
 * Tracked signals:
 *   cpu           — Node.js process CPU usage (0–100 %)
 *   heapUsedMb    — V8 heap used (MB)
 *   rssGb         — Resident set size (GB)
 *   activeStreams  — Live streaming sessions in DB
 *   totalViewers  — Sum of viewers across all live streams
 *   apiRps        — API requests per second (rolling 10 s window)
 *   aiQueueDepth  — GhostBrain inference queue length (polled from :7900)
 *   networkRxMbps — Estimated inbound bandwidth (MB/s, derived from DB)
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PlatformMetrics {
  sampledAt:     string;
  cpu:           number;  // 0–100
  heapUsedMb:    number;
  rssGb:         number;
  activeStreams:  number;
  totalViewers:  number;
  apiRps:        number;
  aiQueueDepth:  number;
  networkRxMbps: number;
}

export type PressureLevel = 'normal' | 'elevated' | 'high' | 'critical';

export interface PressureReport {
  level:    PressureLevel;
  reasons:  string[];
  metrics:  PlatformMetrics;
}

// ── Thresholds ─────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  cpu:           { elevated: 55, high: 75, critical: 90  },
  heapUsedMb:    { elevated: 512, high: 1024, critical: 1800 },
  activeStreams:  { elevated: 200, high: 500, critical: 1000 },
  totalViewers:  { elevated: 50_000, high: 200_000, critical: 500_000 },
  apiRps:        { elevated: 500, high: 1_000, critical: 2_500 },
  aiQueueDepth:  { elevated: 20, high: 50, critical: 100 },
  networkRxMbps: { elevated: 500, high: 2_000, critical: 8_000 },
} as const;

const POLL_INTERVAL_MS  = 5_000;
const METRIC_RETAIN_HRS = 24;

// ── In-process RPS counter ─────────────────────────────────────────────────────

let _reqCount = 0;
let _rpsSnapshot = 0;

/**
 * Call this from the Express middleware to increment the request counter.
 * The load monitor snapshots it every POLL_INTERVAL_MS.
 */
export function countApiRequest(): void { _reqCount++; }

// ── Core monitor ───────────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;
let _latest: PlatformMetrics | null = null;

/** Start polling. Safe to call multiple times — only starts once. */
export function startMonitoring(): void {
  if (_timer) return;
  _timer = setInterval(_collectAndStore, POLL_INTERVAL_MS);
  _collectAndStore(); // immediate first sample
}

export function stopMonitoring(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

export function getLatestMetrics(): PlatformMetrics | null { return _latest; }

// ── Snapshot ───────────────────────────────────────────────────────────────────

async function _collectAndStore(): Promise<void> {
  try {
    const db = getDb();

    // CPU — compare two process.cpuUsage() snapshots
    const cpuBefore = process.cpuUsage();
    await _sleep(100);
    const cpuAfter  = process.cpuUsage(cpuBefore);
    const cpuPct    = Math.min(100, ((cpuAfter.user + cpuAfter.system) / 1_000 / 100));

    // Memory
    const mem       = process.memoryUsage();
    const heapUsedMb = mem.heapUsed / 1_048_576;
    const rssGb      = mem.rss / 1_073_741_824;

    // Platform-level metrics from DB
    const streamsRow = db.prepare(`
      SELECT COUNT(*) AS n, COALESCE(SUM(viewer_count), 0) AS v
      FROM streams WHERE status = 'live'
    `).get() as any;

    // RPS snapshot
    _rpsSnapshot = _reqCount;
    _reqCount    = 0; // reset window

    // AI queue depth — poll GhostBrain Core :7900
    const aiQueueDepth = await _fetchAIQueue();

    // Network estimate: bytes transferred in last 5 s from a counter in DB
    const netRow = db.prepare(`
      SELECT COALESCE(SUM(payload_bytes), 0) AS total
      FROM api_request_log
      WHERE logged_at >= datetime('now', '-5 seconds')
    `).get() as any;
    const networkRxMbps = (netRow?.total ?? 0) / 1_048_576 / 5;

    const metrics: PlatformMetrics = {
      sampledAt:     new Date().toISOString(),
      cpu:           parseFloat(cpuPct.toFixed(2)),
      heapUsedMb:    parseFloat(heapUsedMb.toFixed(1)),
      rssGb:         parseFloat(rssGb.toFixed(3)),
      activeStreams:  streamsRow?.n ?? 0,
      totalViewers:  streamsRow?.v ?? 0,
      apiRps:        _rpsSnapshot,
      aiQueueDepth,
      networkRxMbps: parseFloat(networkRxMbps.toFixed(2)),
    };

    _latest = metrics;

    // Persist sample
    db.prepare(`
      INSERT INTO load_metrics
        (sample_id, sampled_at, cpu, heap_used_mb, rss_gb, active_streams,
         total_viewers, api_rps, ai_queue_depth, network_rx_mbps)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), metrics.sampledAt, metrics.cpu, metrics.heapUsedMb, metrics.rssGb,
      metrics.activeStreams, metrics.totalViewers, metrics.apiRps,
      metrics.aiQueueDepth, metrics.networkRxMbps,
    );

    // Prune old samples
    db.prepare(`
      DELETE FROM load_metrics
      WHERE sampled_at < datetime('now', '-${METRIC_RETAIN_HRS} hours')
    `).run();

  } catch (e) {
    // Monitor must never crash the process
    process.stderr.write(`[load_monitor] Error: ${(e as Error).message}\n`);
  }
}

// ── Trending & pressure analysis ───────────────────────────────────────────────

/**
 * Return the rolling average of a metric over the last `minutes` minutes.
 */
export function getMetricTrend(
  metric: keyof Omit<PlatformMetrics, 'sampledAt'>,
  minutes = 5,
): number {
  const db  = getDb();
  const row = db.prepare(`
    SELECT AVG(${_col(metric)}) AS avg
    FROM load_metrics
    WHERE sampled_at >= datetime('now', '-${minutes} minutes')
  `).get() as any;
  return row?.avg ?? 0;
}

/**
 * Evaluate current metrics and return a pressure report.
 * Used by AutoScaleController to decide which resources to scale.
 */
export function evaluatePressure(metrics: PlatformMetrics): PressureReport {
  const reasons: string[] = [];

  function check(field: keyof typeof THRESHOLDS, value: number): PressureLevel {
    const t = THRESHOLDS[field];
    if (value >= t.critical)  { reasons.push(`${field}=${value} (CRITICAL ≥ ${t.critical})`); return 'critical'; }
    if (value >= t.high)      { reasons.push(`${field}=${value} (HIGH ≥ ${t.high})`);         return 'high'; }
    if (value >= t.elevated)  { reasons.push(`${field}=${value} (ELEVATED ≥ ${t.elevated})`); return 'elevated'; }
    return 'normal';
  }

  const levels: PressureLevel[] = [
    check('cpu',           metrics.cpu),
    check('heapUsedMb',    metrics.heapUsedMb),
    check('activeStreams',  metrics.activeStreams),
    check('totalViewers',  metrics.totalViewers),
    check('apiRps',        metrics.apiRps),
    check('aiQueueDepth',  metrics.aiQueueDepth),
    check('networkRxMbps', metrics.networkRxMbps),
  ];

  const order: PressureLevel[] = ['critical', 'high', 'elevated', 'normal'];
  const level = order.find(l => levels.includes(l)) ?? 'normal';
  return { level, reasons, metrics };
}

/** Quick helper: is scaling immediately required? */
export function isUnderPressure(): boolean {
  if (!_latest) return false;
  return evaluatePressure(_latest).level !== 'normal';
}

export function getRecentMetrics(limit = 60): PlatformMetrics[] {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT * FROM load_metrics ORDER BY sampled_at DESC LIMIT ?
  `).all(limit) as any[];
  return rows.map(_rowToMetrics);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function _fetchAIQueue(): Promise<number> {
  try {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), 800);
    const res = await fetch('http://localhost:7900/health', { signal: ctl.signal });
    clearTimeout(tid);
    if (!res.ok) return 0;
    const j   = await res.json() as any;
    return j?.queue_depth ?? 0;
  } catch { return 0; }
}

function _sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

const _COL_MAP: Record<string, string> = {
  cpu: 'cpu', heapUsedMb: 'heap_used_mb', rssGb: 'rss_gb',
  activeStreams: 'active_streams', totalViewers: 'total_viewers',
  apiRps: 'api_rps', aiQueueDepth: 'ai_queue_depth', networkRxMbps: 'network_rx_mbps',
};
function _col(metric: string): string { return _COL_MAP[metric] ?? metric; }

function _rowToMetrics(r: any): PlatformMetrics {
  return {
    sampledAt:     r.sampled_at,
    cpu:           r.cpu,
    heapUsedMb:    r.heap_used_mb,
    rssGb:         r.rss_gb,
    activeStreams:  r.active_streams,
    totalViewers:  r.total_viewers,
    apiRps:        r.api_rps,
    aiQueueDepth:  r.ai_queue_depth,
    networkRxMbps: r.network_rx_mbps,
  };
}
