/**
 * GhostBrain Memory — Cross-Node Learning Memory
 *
 * Learns from events emitted by any cluster node.
 * Identifies recurring patterns across nodes so that a fix discovered on
 * Node A can automatically be applied on Node B.
 */

import { appendFile, readFile, mkdir } from "node:fs/promises";
import { existsSync }                  from "node:fs";
import { join }                        from "node:path";
import { createHash }                  from "node:crypto";

const MEMORY_DIR = process.env.MEMORY_DIR ?? "/tmp/ghostbrain-fed-memory";
const JOURNAL    = "learning.ndjson";
const MAX_EVENTS = 2_000;

export type LearnCategory = "crash" | "fix" | "overload" | "recovery" | "attack" | "optimization";

export interface CrossNodeLearnEvent {
  id:        string;
  nodeId:    string;
  category:  LearnCategory;
  problem:   string;
  solution?: string;
  outcome:   "success" | "failure" | "pending";
  data:      Record<string, unknown>;
  ts:        number;
}

// In-memory store
const _events: CrossNodeLearnEvent[] = [];

// Cross-node pattern table: problem → nodes that experienced it → solutions tried
interface PatternEntry {
  problem:        string;
  nodesSeen:      Set<string>;
  successCount:   number;
  failureCount:   number;
  bestSolution:   string | null;
}
const _patterns = new Map<string, PatternEntry>();

function problemKey(nodeId: string, category: LearnCategory, problem: string): string {
  // Strip node-specific ID prefix so the same crash on different nodes maps to same key
  return `${category}:${problem.replace(/[0-9a-f-]{8,}/gi, "<id>")}`;
}

function eventId(nodeId: string, category: string, ts: number): string {
  return createHash("sha256").update(`${nodeId}:${category}:${ts}`).digest("hex").slice(0, 16);
}

async function ensureDir(): Promise<void> {
  if (!existsSync(MEMORY_DIR)) await mkdir(MEMORY_DIR, { recursive: true });
}

export async function globalLearn(nodeId: string, event: Omit<CrossNodeLearnEvent, "id" | "nodeId">): Promise<CrossNodeLearnEvent> {
  const ev: CrossNodeLearnEvent = {
    id:     eventId(nodeId, event.category, event.ts),
    nodeId,
    ...event,
  };

  _events.push(ev);
  if (_events.length > MAX_EVENTS) _events.shift();

  // Update pattern table
  const key = problemKey(nodeId, ev.category, ev.problem);
  let pat = _patterns.get(key);
  if (!pat) {
    pat = { problem: ev.problem, nodesSeen: new Set(), successCount: 0, failureCount: 0, bestSolution: null };
    _patterns.set(key, pat);
  }
  pat.nodesSeen.add(nodeId);
  if (ev.outcome === "success") {
    pat.successCount++;
    if (ev.solution) pat.bestSolution = ev.solution;
  } else if (ev.outcome === "failure") {
    pat.failureCount++;
  }

  await ensureDir();
  try {
    await appendFile(join(MEMORY_DIR, JOURNAL), JSON.stringify(ev) + "\n", "utf8");
  } catch { /* non-fatal */ }

  return ev;
}

export async function hydrateLearnMemory(): Promise<void> {
  await ensureDir();
  const p = join(MEMORY_DIR, JOURNAL);
  if (!existsSync(p)) return;
  try {
    const lines = (await readFile(p, "utf8")).split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const ev = JSON.parse(line) as CrossNodeLearnEvent;
        _events.push(ev);
        if (_events.length > MAX_EVENTS) _events.shift();
        const key = problemKey(ev.nodeId, ev.category, ev.problem);
        let pat = _patterns.get(key);
        if (!pat) {
          pat = { problem: ev.problem, nodesSeen: new Set(), successCount: 0, failureCount: 0, bestSolution: null };
          _patterns.set(key, pat);
        }
        pat.nodesSeen.add(ev.nodeId);
        if (ev.outcome === "success" && ev.solution) pat.bestSolution = ev.solution;
      } catch { /* skip */ }
    }
  } catch { /* file unreadable */ }
}

export function getCrossNodePatterns(category?: LearnCategory): Array<{
  key: string;
  problem: string;
  nodesSeen: string[];
  successCount: number;
  failureCount: number;
  bestSolution: string | null;
}> {
  return [..._patterns.entries()]
    .filter(([k]) => !category || k.startsWith(`${category}:`))
    .map(([k, p]) => ({
      key:          k,
      problem:      p.problem,
      nodesSeen:    [...p.nodesSeen],
      successCount: p.successCount,
      failureCount: p.failureCount,
      bestSolution: p.bestSolution,
    }))
    .sort((a, b) => (b.successCount + b.failureCount) - (a.successCount + a.failureCount));
}

export function learningStats(): { totalEvents: number; totalPatterns: number; patternsWithSolution: number } {
  const withSolution = [..._patterns.values()].filter(p => p.bestSolution !== null).length;
  return { totalEvents: _events.length, totalPatterns: _patterns.size, patternsWithSolution: withSolution };
}
