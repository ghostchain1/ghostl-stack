/**
 * GhostBrain Agent — Local Memory
 *
 * Disk-backed ring buffer for node-local AI events.
 * Hydrated from NDJSON journal at startup; new events appended atomically.
 *
 * Memory tiers:
 *   RAM  — hot ring buffer (last RING_SIZE events, default 500)
 *   NVMe — NDJSON journal (append-only, rotated at MAX_FILE_MB)
 */

import { appendFile, readFile, mkdir, stat, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type LocalEventType =
  | "crash"
  | "recovery"
  | "threshold_breach"
  | "action_taken"
  | "vm_state"
  | "container_state"
  | "metric_snapshot";

export interface LocalEvent {
  id:        string;
  timestamp: number;
  nodeId:    string;
  type:      LocalEventType;
  severity:  "info" | "warn" | "critical";
  data:      Record<string, unknown>;
}

const MEMORY_DIR  = process.env.GHOSTBRAIN_AGENT_MEMORY_DIR ?? "/tmp/ghostbrain-agent-memory";
const JOURNAL     = "local.ndjson";
const RING_SIZE   = 500;
const MAX_FILE_MB = 20;

const _ring: LocalEvent[] = [];
let   _hydrated = false;

function journalPath(): string { return join(MEMORY_DIR, JOURNAL); }

async function ensureDir(): Promise<void> {
  if (!existsSync(MEMORY_DIR)) await mkdir(MEMORY_DIR, { recursive: true });
}

export async function hydrateLocalMemory(): Promise<void> {
  if (_hydrated) return;
  _hydrated = true;
  await ensureDir();
  const p = journalPath();
  if (!existsSync(p)) return;
  try {
    const text = await readFile(p, "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line) as LocalEvent;
        _ring.push(ev);
        if (_ring.length > RING_SIZE) _ring.shift();
      } catch { /* skip corrupt line */ }
    }
  } catch { /* journal not readable */ }
}

async function rotateIfNeeded(): Promise<void> {
  const p = journalPath();
  try {
    const s = await stat(p);
    if (s.size > MAX_FILE_MB * 1024 * 1024) {
      await rename(p, `${p}.${Date.now()}.bak`);
      await writeFile(p, "", "utf8");
    }
  } catch { /* file may not exist yet */ }
}

export async function storeLocal(event: Omit<LocalEvent, "id" | "timestamp">): Promise<LocalEvent> {
  const ev: LocalEvent = {
    id:        `${event.nodeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    ...event,
  };
  _ring.push(ev);
  if (_ring.length > RING_SIZE) _ring.shift();

  await ensureDir();
  await rotateIfNeeded();
  try {
    await appendFile(journalPath(), JSON.stringify(ev) + "\n", "utf8");
  } catch { /* non-fatal */ }
  return ev;
}

export function getLocalHistory(limitMs?: number): LocalEvent[] {
  if (!limitMs) return [..._ring];
  const cutoff = Date.now() - limitMs;
  return _ring.filter(e => e.timestamp >= cutoff);
}

export function localStats(): { total: number; byType: Record<string, number>; bySeverity: Record<string, number> } {
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const e of _ring) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
  }
  return { total: _ring.length, byType, bySeverity };
}
