/**
 * GhostBrain Core — Cognitive Memory
 *
 * Stores AI knowledge learned from the system:
 * - crash signatures & root causes
 * - attack patterns detected
 * - container allocation decisions
 * - tuning insights
 *
 * Backed by hot RAM cache + disk journal (append-only NDJSON).
 */

import { createHash }         from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join }               from "node:path";

export type KnowledgeCategory =
  | "crash"
  | "attack"
  | "allocation"
  | "tuning"
  | "routing"
  | "governance";

export interface KnowledgeEntry {
  id:          string;          // SHA-256 of (category + key)
  category:    KnowledgeCategory;
  key:         string;          // e.g. "validator_oom_kill"
  summary:     string;
  detail:      Record<string, unknown>;
  confidence:  number;          // 0–1
  seenCount:   number;
  firstSeen:   number;          // epoch ms
  lastSeen:    number;
}

const HOT: Map<string, KnowledgeEntry> = new Map();
let MEMORY_DIR = process.env.GHOSTBRAIN_MEMORY_DIR ?? "/tmp/ghostbrain-memory";
let JOURNAL_PATH = join(MEMORY_DIR, "cognitive.ndjson");

function ensureDir() {
  mkdirSync(MEMORY_DIR, { recursive: true });
}

/** Load existing journal into hot cache at startup. */
export function hydrateCognitiveMemory(dir?: string): void {
  if (dir) {
    MEMORY_DIR   = dir;
    JOURNAL_PATH = join(dir, "cognitive.ndjson");
  }
  ensureDir();
  if (!existsSync(JOURNAL_PATH)) return;
  try {
    const lines = readFileSync(JOURNAL_PATH, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as KnowledgeEntry;
        const existing = HOT.get(entry.id);
        // Keep the most recent / highest confidence entry
        if (!existing || entry.lastSeen > existing.lastSeen) HOT.set(entry.id, entry);
      } catch { /* skip malformed lines */ }
    }
  } catch { /* file unreadable — start fresh */ }
}

function entryId(category: KnowledgeCategory, key: string): string {
  return createHash("sha256").update(`${category}:${key}`).digest("hex").slice(0, 16);
}

/** Store or update a knowledge entry. Returns the stored entry. */
export function storeKnowledge(
  category: KnowledgeCategory,
  key: string,
  summary: string,
  detail: Record<string, unknown> = {},
  confidence = 0.8,
): KnowledgeEntry {
  ensureDir();
  const id = entryId(category, key);
  const now = Date.now();
  const existing = HOT.get(id);
  const entry: KnowledgeEntry = existing
    ? { ...existing, summary, detail, confidence: Math.max(existing.confidence, confidence), seenCount: existing.seenCount + 1, lastSeen: now }
    : { id, category, key, summary, detail, confidence, seenCount: 1, firstSeen: now, lastSeen: now };
  HOT.set(id, entry);
  appendFileSync(JOURNAL_PATH, JSON.stringify(entry) + "\n");
  return entry;
}

export function getKnowledge(category: KnowledgeCategory, key: string): KnowledgeEntry | undefined {
  return HOT.get(entryId(category, key));
}

export function queryKnowledge(category?: KnowledgeCategory): KnowledgeEntry[] {
  const all = [...HOT.values()];
  return category ? all.filter(e => e.category === category) : all;
}

export function cognitiveStats() {
  const counts: Partial<Record<KnowledgeCategory, number>> = {};
  for (const e of HOT.values()) counts[e.category] = (counts[e.category] ?? 0) + 1;
  return { total: HOT.size, byCategory: counts };
}
