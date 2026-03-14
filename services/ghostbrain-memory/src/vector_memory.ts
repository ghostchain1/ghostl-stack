/**
 * GhostBrain Memory — Global Vector Memory
 *
 * Character bigram TF-IDF cosine similarity across all federated knowledge.
 * Accepts vectors from any cluster node; returns globally ranked search results.
 *
 * VOCAB_SIZE = 256 (character bigrams modulo-bucketed).
 */

import { appendFile, readFile, mkdir } from "node:fs/promises";
import { existsSync }                  from "node:fs";
import { join }                        from "node:path";

const MEMORY_DIR  = process.env.MEMORY_DIR ?? "/tmp/ghostbrain-fed-memory";
const JOURNAL     = "vectors.ndjson";
const VOCAB_SIZE  = 256;
const MAX_VECTORS = 10_000;

export interface VectorEntry {
  id:        string;
  nodeId:    string;
  text:      string;
  tags:      string[];
  vec:       number[];
  storedAt:  number;
}

const _store: VectorEntry[] = [];

// ── Embedding ──────────────────────────────────────────────────────────────────

function embed(text: string): number[] {
  const vec = new Array<number>(VOCAB_SIZE).fill(0);
  const lower = text.toLowerCase();
  for (let i = 0; i < lower.length - 1; i++) {
    const bucket = ((lower.charCodeAt(i) * 31 + lower.charCodeAt(i + 1)) & 0x7fffffff) % VOCAB_SIZE;
    vec[bucket]++;
  }
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < VOCAB_SIZE; i++) dot += (a[i]! * b[i]!);
  return dot; // both are already L2-normalized
}

// ── Storage ───────────────────────────────────────────────────────────────────

async function ensureDir(): Promise<void> {
  if (!existsSync(MEMORY_DIR)) await mkdir(MEMORY_DIR, { recursive: true });
}

export async function storeGlobalVector(entry: Omit<VectorEntry, "vec">): Promise<VectorEntry> {
  const full: VectorEntry = { ...entry, vec: embed(entry.text) };
  _store.push(full);
  if (_store.length > MAX_VECTORS) _store.shift();

  await ensureDir();
  try {
    await appendFile(join(MEMORY_DIR, JOURNAL), JSON.stringify({ ...full, vec: undefined }) + "\n", "utf8");
  } catch { /* non-fatal */ }
  return full;
}

export async function hydrateVectors(): Promise<void> {
  await ensureDir();
  const p = join(MEMORY_DIR, JOURNAL);
  if (!existsSync(p)) return;
  try {
    const lines = (await readFile(p, "utf8")).split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const raw = JSON.parse(line) as Omit<VectorEntry, "vec"> & { vec?: number[] };
        _store.push({ ...raw, vec: raw.vec ?? embed(raw.text) });
        if (_store.length > MAX_VECTORS) _store.shift();
      } catch { /* corrupt line */ }
    }
  } catch { /* file unreadable */ }
}

export function globalVectorSearch(
  query: string,
  topK: number = 10,
  threshold: number = 0.3,
  nodeId?: string
): Array<{ entry: Omit<VectorEntry, "vec">; score: number }> {
  const qvec    = embed(query);
  const candidates = nodeId ? _store.filter(e => e.nodeId === nodeId) : _store;
  return candidates
    .map(e => ({ entry: { ...e, vec: undefined as unknown as number[] }, score: cosine(qvec, e.vec) }))
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function vectorStats(): { total: number; nodeBreakdown: Record<string, number> } {
  const nb: Record<string, number> = {};
  for (const e of _store) nb[e.nodeId] = (nb[e.nodeId] ?? 0) + 1;
  return { total: _store.length, nodeBreakdown: nb };
}
