/**
 * GhostBrain Core — Embedding Engine
 *
 * Converts structured data (logs, events, errors, tasks, configs) into
 * fixed-size float vectors for similarity search in vector memory.
 *
 * Implementation: character n-gram + token frequency TF-IDF hash (no external SaaS).
 * Upgrade path: swap encodeText() to call a local GGUF / llama.cpp HTTP endpoint.
 *
 * Public API:
 *   encodeText(text)                 — encode arbitrary string → float[]
 *   encodeEvent(event)               — encode a structured event object
 *   encodeConfig(config)             — encode a config/state snapshot
 *   cosineSimilarity(a, b)           — compute similarity between two vectors
 *   mostSimilar(query, candidates)   — rank candidates by similarity
 *   storeEmbedding(text, metadata)   — encode + persist to vector_memory
 */

import { storeVector, search } from "./memory/vector_memory.js";
import { log }           from "./observability/event_logger.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const VOCAB_SIZE  = 512;   // fixed vector dimension — must match vector_memory.ts if shared
const BIGRAM_W    = 0.6;   // weight for character bigrams
const TOKEN_W     = 0.4;   // weight for token (word) presence

// ── Core encoding ─────────────────────────────────────────────────────────────

/**
 * Encode arbitrary text into a fixed-size L2-normalized float vector.
 * Uses character bigrams + token presence with configurable weights.
 */
export function encodeText(text: string): number[] {
  const vec = new Float32Array(VOCAB_SIZE);
  const normalized = text.toLowerCase().replace(/[^a-z0-9_:\-. ]/g, " ");

  // Character bigram features
  for (let i = 0; i < normalized.length - 1; i++) {
    const h = (normalized.charCodeAt(i) * 31 + normalized.charCodeAt(i + 1)) % VOCAB_SIZE;
    vec[h] += BIGRAM_W;
  }

  // Token presence features (bag-of-words hash)
  const tokens = normalized.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    let h = 0;
    for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) % VOCAB_SIZE;
    vec[h] += TOKEN_W;
  }

  return l2Normalize(Array.from(vec));
}

/**
 * Encode a structured event object into a vector.
 * Serialises key fields into a canonical text form first.
 */
export function encodeEvent(event: {
  resourceId?: string;
  category?:   string;
  label?:      string;
  layer?:      string;
  payload?:    Record<string, unknown>;
}): number[] {
  const parts = [
    event.layer     && `layer:${event.layer}`,
    event.category  && `category:${event.category}`,
    event.label     && `label:${event.label}`,
    event.resourceId && `resource:${event.resourceId}`,
    event.payload   && safeStringify(event.payload),
  ].filter(Boolean).join(" ");
  return encodeText(parts);
}

/**
 * Encode a configuration/state snapshot into a vector.
 * Flattens nested keys into dotted paths for vocabulary coverage.
 */
export function encodeConfig(config: Record<string, unknown>): number[] {
  const flat = flattenKeys(config);
  return encodeText(flat);
}

// ── Similarity ─────────────────────────────────────────────────────────────────

/** Cosine similarity of two L2-normalized vectors (range: 0–1). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}

export interface SimilarityResult<T> {
  item:  T;
  score: number;
}

/**
 * Rank a list of candidates by cosine similarity to a query string.
 */
export function mostSimilar<T>(
  query:      string,
  candidates: T[],
  getText:    (item: T) => string,
  topK = 5,
): SimilarityResult<T>[] {
  const qVec = encodeText(query);
  return candidates
    .map(item => ({ item, score: cosineSimilarity(qVec, encodeText(getText(item))) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ── Persistence bridging ──────────────────────────────────────────────────────

/**
 * Encode text and store the embedding in vector_memory for future recall.
 */
export function storeEmbedding(text: string, metadata: Record<string, unknown>): string {
  storeVector(text, text, metadata);
  log.debug("embedding_engine: store", `${text.length} chars`);
  return text; // vector_memory uses text as the primary lookup key
}

/**
 * Search stored embeddings for text similar to the query.
 */
export function searchEmbeddings(query: string, topK = 5, threshold = 0.25) {
  return search(query, topK, threshold);
}

// ── Batch encoding ────────────────────────────────────────────────────────────

export interface EmbeddingBatch {
  text:     string;
  vector:   number[];
  metadata: Record<string, unknown>;
}

/** Encode multiple items and optionally persist them. */
export function encodeBatch(
  items:   Array<{ text: string; metadata?: Record<string, unknown> }>,
  persist = true,
): EmbeddingBatch[] {
  return items.map(item => {
    const vector = encodeText(item.text);
    if (persist) storeVector(item.text, item.text, item.metadata ?? {});
    return { text: item.text, vector, metadata: item.metadata ?? {} };
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getEmbeddingStats() {
  return {
    vocabSize:  VOCAB_SIZE,
    bigramWeight: BIGRAM_W,
    tokenWeight:  TOKEN_W,
    backend:    "local-ngram",   // upgrade to "llama-cpp" when local LLM is available
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

function safeStringify(obj: unknown): string {
  try { return JSON.stringify(obj); } catch { return String(obj); }
}

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string {
  return Object.entries(obj)
    .map(([k, v]) => {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        return flattenKeys(v as Record<string, unknown>, path);
      }
      return `${path}=${safeStringify(v)}`;
    })
    .join(" ");
}
