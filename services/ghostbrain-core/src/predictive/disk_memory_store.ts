/**
 * GhostBrain Predictive AI — Disk Memory Store
 *
 * Provides a tiered, disk-backed rolling store for infrastructure metrics
 * collected by metrics_collector.ts.  Keeps RAM usage minimal by:
 *
 *   HOT  — last N samples in RAM (configurable, default 120)
 *   WARM — last 24 h in a line-delimited JSON file on NVMe/SSD
 *   COLD — older data rotated to a compressed archive on disk
 *   GC   — automatic sweep removes entries beyond the COLD_MAX_DAYS window
 *
 * Thread-safety: Node.js is single-threaded; all disk writes are synchronous
 * within a single tick to keep the hot cache and journal consistent.
 *
 * File layout (all under GHOSTBRAIN_MEMORY_DIR, default /var/lib/ghostbrain):
 *
 *   metrics_hot.json          — JSON array of the hot window (rewritten on flush)
 *   metrics_warm.ndjson       — append-only NDJSON (rotated daily)
 *   archive/metrics_YYYYMMDD.ndjson.gz — compressed cold storage
 */

import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  unlinkSync,
  renameSync,
  statSync,
} from "node:fs";
import { join }       from "node:path";
import { createGzip } from "node:zlib";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline }   from "node:stream/promises";

import type { InfraSnapshot } from "./metrics_collector.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_DIR       = process.env.GHOSTBRAIN_MEMORY_DIR ?? "/var/lib/ghostbrain";
const ARCHIVE_DIR    = join(BASE_DIR, "archive");

const HOT_MAX        = Number(process.env.DISK_STORE_HOT_MAX        ?? "120");   // entries in RAM
const WARM_MAX_LINES = Number(process.env.DISK_STORE_WARM_MAX_LINES ?? "17280"); // ~24 h at 5 s
const COLD_MAX_DAYS  = Number(process.env.DISK_STORE_COLD_MAX_DAYS  ?? "30");
const FLUSH_INTERVAL = Number(process.env.DISK_STORE_FLUSH_INTERVAL ?? "60000"); // ms, hot → disk

const HOT_FILE    = join(BASE_DIR, "metrics_hot.json");
const WARM_FILE   = join(BASE_DIR, "metrics_warm.ndjson");

// ── State ─────────────────────────────────────────────────────────────────────

let _hot: InfraSnapshot[] = [];
let _warmLineCount = 0;
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _initialised = false;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function ensureDirs(): void {
  mkdirSync(BASE_DIR,    { recursive: true });
  mkdirSync(ARCHIVE_DIR, { recursive: true });
}

function countWarmLines(): number {
  if (!existsSync(WARM_FILE)) return 0;
  let n = 0;
  for (const c of readFileSync(WARM_FILE, "utf8")) if (c === "\n") n++;
  return n;
}

/** Load the hot window from disk at startup so we warm-start immediately. */
export function hydrateStore(): void {
  if (_initialised) return;
  _initialised = true;
  ensureDirs();

  if (existsSync(HOT_FILE)) {
    try {
      const arr = JSON.parse(readFileSync(HOT_FILE, "utf8")) as InfraSnapshot[];
      _hot = arr.slice(-HOT_MAX);
    } catch { _hot = []; }
  }

  _warmLineCount = countWarmLines();

  // Start periodic flush
  if (!_flushTimer) {
    _flushTimer = setInterval(flushHotToDisk, FLUSH_INTERVAL);
    _flushTimer.unref(); // don't block process exit
  }
}

// ── Write path ────────────────────────────────────────────────────────────────

/** Append a snapshot to the hot ring buffer and WARM journal. */
export function storeSnapshot(snap: InfraSnapshot): void {
  if (!_initialised) hydrateStore();

  // Hot ring
  _hot.push(snap);
  if (_hot.length > HOT_MAX) _hot.shift();

  // Warm journal (append)
  try {
    appendFileSync(WARM_FILE, JSON.stringify(snap) + "\n");
    _warmLineCount++;
  } catch { /* disk errors must not crash the engine */ }

  // Rotate warm → cold when warm file is full
  if (_warmLineCount >= WARM_MAX_LINES) {
    void rotateWarm();
  }
}

// ── Flush hot to disk ─────────────────────────────────────────────────────────

/** Persist the hot window to disk (called periodically + on shutdown). */
export function flushHotToDisk(): void {
  if (!_hot.length) return;
  try {
    writeFileSync(HOT_FILE, JSON.stringify(_hot));
  } catch { /* ignore */ }
}

// ── Rotation ──────────────────────────────────────────────────────────────────

/** Compress WARM_FILE into archive then start a fresh warm file. */
async function rotateWarm(): Promise<void> {
  if (!existsSync(WARM_FILE)) return;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const dest = join(ARCHIVE_DIR, `metrics_${date}.ndjson.gz`);

  // Rename current warm file to a temp path
  const tmp = WARM_FILE + ".rotating";
  try {
    renameSync(WARM_FILE, tmp);
    _warmLineCount = 0;
  } catch {
    return; // another rotation in progress
  }

  // Compress in background
  try {
    await pipeline(
      createReadStream(tmp),
      createGzip({ level: 6 }),
      createWriteStream(dest),
    );
    unlinkSync(tmp);
  } catch {
    // Restore on failure
    try { renameSync(tmp, WARM_FILE); } catch { /* give up */ }
  }

  // Prune archives older than COLD_MAX_DAYS
  pruneArchive();
}

function pruneArchive(): void {
  const cutoff = Date.now() - COLD_MAX_DAYS * 86_400_000;
  try {
    for (const file of readdirSync(ARCHIVE_DIR)) {
      const full = join(ARCHIVE_DIR, file);
      try {
        if (statSync(full).mtime.getTime() < cutoff) unlinkSync(full);
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
}

// ── Read path ─────────────────────────────────────────────────────────────────

/** Return a copy of the hot ring buffer (most-recent first). */
export function getHotWindow(): InfraSnapshot[] {
  return [..._hot].reverse();
}

/** Return the last N entries from the hot window. */
export function getRecentSnapshots(n: number): InfraSnapshot[] {
  return _hot.slice(-n);
}

/** Summarise memory tier sizes for Prometheus / status endpoint. */
export function storeStats(): {
  hotEntries:  number;
  warmLines:   number;
  archiveFiles: number;
  baseDir:     string;
} {
  let archiveFiles = 0;
  try { archiveFiles = readdirSync(ARCHIVE_DIR).length; } catch { /* ignore */ }
  return {
    hotEntries:   _hot.length,
    warmLines:    _warmLineCount,
    archiveFiles,
    baseDir:      BASE_DIR,
  };
}

/** Graceful shutdown — flush hot window to disk. */
export function shutdownStore(): void {
  if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null; }
  flushHotToDisk();
}
