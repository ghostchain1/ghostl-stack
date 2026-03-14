/**
 * GhostBrain Core — Vector Memory
 *
 * Embedding-based similarity search over knowledge entries.
 * Uses a simple TF-IDF-style float vector (no external vector DB).
 * Vectors are derived from text — good enough for pattern matching in
 * a constrained domain. Upgrade path: replace buildVector() with a
 * real embedding model (e.g. local GGUF via llama.cpp HTTP API).
 *
 * Disk-backed: vectors stored as JSON rows in vector.ndjson.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface VectorEntry {
  id:       string;
  text:     string;
  vector:   number[];
  metadata: Record<string, unknown>;
  storedAt: number;
}

const VOCAB_SIZE   = 256;   // simplified fixed-size vocabulary hash space
const _store: VectorEntry[] = [];

let MEMORY_DIR     = process.env.GHOSTBRAIN_MEMORY_DIR ?? "/tmp/ghostbrain-memory";
let VECTOR_JOURNAL = join(MEMORY_DIR, "vector.ndjson");

function ensureDir() { mkdirSync(MEMORY_DIR, { recursive: true }); }

/** Build a fixed-size float vector from text (character n-gram frequency). */
function buildVector(text: string): number[] {
  const vec = new Array<number>(VOCAB_SIZE).fill(0);
  const normalized = text.toLowerCase();
  for (let i = 0; i < normalized.length - 1; i++) {
    const bigram = normalized.charCodeAt(i) * 31 + normalized.charCodeAt(i + 1);
    vec[bigram % VOCAB_SIZE] += 1;
  }
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both vectors are L2-normalized, so dot = cosine similarity
}

export function hydrateVectorMemory(dir?: string): void {
  if (dir) {
    MEMORY_DIR     = dir;
    VECTOR_JOURNAL = join(dir, "vector.ndjson");
  }
  ensureDir();
  if (!existsSync(VECTOR_JOURNAL)) return;
  try {
    const lines = readFileSync(VECTOR_JOURNAL, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try { _store.push(JSON.parse(line) as VectorEntry); }
      catch { /* skip */ }
    }
  } catch { /* start fresh */ }
}

/** Store a text entry with its vector embedding. */
export function storeVector(
  id: string,
  text: string,
  metadata: Record<string, unknown> = {},
): VectorEntry {
  ensureDir();
  const entry: VectorEntry = {
    id,
    text,
    vector: buildVector(text),
    metadata,
    storedAt: Date.now(),
  };
  // Replace if id already exists
  const idx = _store.findIndex(e => e.id === id);
  if (idx >= 0) _store[idx] = entry; else _store.push(entry);
  appendFileSync(VECTOR_JOURNAL, JSON.stringify(entry) + "\n");
  return entry;
}

/** Find top-k most similar entries to the query text. */
export function search(
  query: string,
  topK = 5,
  threshold = 0.3,
): Array<VectorEntry & { score: number }> {
  const qVec = buildVector(query);
  return _store
    .map(e => ({ ...e, score: cosine(qVec, e.vector) }))
    .filter(e => e.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Alias for storeVector — for mock-compatible imports. */
export const store = storeVector;

export function vectorStats() {
  return { entries: _store.length };
}

/**
 * Remove near-duplicate vectors whose cosine similarity to any earlier entry
 * exceeds the given threshold. Returns the number of entries removed.
 * Called by the memory optimizer.
 */
export function pruneVectors(similarityThreshold = 0.99): number {
  if (_store.length <= 1) return 0;
  const toRemove = new Set<number>();
  for (let i = 0; i < _store.length; i++) {
    if (toRemove.has(i)) continue;
    for (let j = i + 1; j < _store.length; j++) {
      if (toRemove.has(j)) continue;
      if (cosine(_store[i]!.vector, _store[j]!.vector) >= similarityThreshold) {
        toRemove.add(j);
      }
    }
  }
  if (toRemove.size === 0) return 0;
  // Remove in reverse order to preserve indices
  const indices = [...toRemove].sort((a, b) => b - a);
  for (const idx of indices) _store.splice(idx, 1);
  return toRemove.size;
}
