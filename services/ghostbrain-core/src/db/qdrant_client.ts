/**
 * GhostBrain Core — Qdrant Vector Database Client
 *
 * Long-term neural memory layer. Provides embedding-based semantic search
 * using Qdrant as the vector store backend.
 *
 * Gracefully degrades when GHOSTBRAIN_QDRANT_URL is not set: falls back to
 * the existing file-backed vector store (vector_memory.ts).
 *
 * Env vars:
 *   GHOSTBRAIN_QDRANT_URL  — Qdrant HTTP URL, e.g. http://localhost:6333
 *   GHOSTBRAIN_QDRANT_KEY  — optional API key for secured Qdrant deployments
 *
 * Collections:
 *   system_logs_embeddings       — infra events from all L1/L2/L3 layers
 *   repair_strategy_embeddings   — repair sequences + outcome embeddings
 *   deployment_embeddings        — deployment scripts & config states
 *   infrastructure_patterns      — recurring infra cause-effect patterns
 *
 * Vector dimension: 512 (matches embedding_engine.ts VOCAB_SIZE).
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import { randomUUID }   from "node:crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

export const COLLECTIONS = {
  SYSTEM_LOGS:       "system_logs_embeddings",
  REPAIR_STRATEGIES: "repair_strategy_embeddings",
  DEPLOYMENTS:       "deployment_embeddings",
  INFRA_PATTERNS:    "infrastructure_patterns",
} as const;

export type QdrantCollection = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** Must match embedding_engine.ts VOCAB_SIZE */
export const VECTOR_DIM = 512;

// ── State ─────────────────────────────────────────────────────────────────────

let _client: QdrantClient | null = null;
let _initialized = false;

export function isQdrantReady(): boolean {
  return _initialized && _client !== null;
}

export function getQdrantClient(): QdrantClient | null {
  return _client;
}

// ── Initialization ────────────────────────────────────────────────────────────

export async function initQdrant(): Promise<void> {
  const url = process.env.GHOSTBRAIN_QDRANT_URL;
  if (!url) {
    console.warn(
      "[ghostbrain-qdrant] GHOSTBRAIN_QDRANT_URL not set — using file-backed vector store." +
      " Set GHOSTBRAIN_QDRANT_URL=http://localhost:6333 to enable long-term neural memory.",
    );
    return;
  }

  try {
    _client = new QdrantClient({
      url,
      apiKey: process.env.GHOSTBRAIN_QDRANT_KEY,
      timeout: 10_000,
    });

    // Health check — list collections
    await _client.getCollections();

    // Ensure all required collections exist with correct vector config
    await Promise.all(
      Object.values(COLLECTIONS).map((col) => ensureCollection(col)),
    );

    _initialized = true;
    console.info(
      "[ghostbrain-qdrant] Qdrant neural memory connected — all collections ready",
      Object.values(COLLECTIONS),
    );
  } catch (err) {
    console.error(
      "[ghostbrain-qdrant] Connection failed — using file-backed fallback:",
      (err as Error).message,
    );
    _client      = null;
    _initialized = false;
  }
}

async function ensureCollection(name: string): Promise<void> {
  if (!_client) return;
  try {
    await _client.getCollection(name);
  } catch {
    // Collection doesn't exist — create it
    await _client.createCollection(name, {
      vectors:              { size: VECTOR_DIM, distance: "Cosine" },
      optimizers_config:    { default_segment_number: 2 },
      replication_factor:   1,
    });
    console.info(`[ghostbrain-qdrant] Created collection: ${name}`);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QdrantPoint {
  /** UUID string — auto-generated if not provided */
  id:      string;
  vector:  number[];
  payload: Record<string, unknown>;
}

export interface QdrantSearchResult {
  id:      string;
  score:   number;
  payload: Record<string, unknown>;
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Upsert one or more points into a collection.
 * Returns true on success, false if Qdrant is unavailable.
 */
export async function qdrantUpsert(
  collection: QdrantCollection,
  points:     QdrantPoint[],
): Promise<boolean> {
  if (!_client || !_initialized || points.length === 0) return false;
  try {
    await _client.upsert(collection, {
      wait: true,
      points: points.map((p) => ({
        id:      p.id,
        vector:  p.vector,
        payload: p.payload,
      })),
    });
    return true;
  } catch (err) {
    console.error(`[ghostbrain-qdrant] upsert error (${collection}):`, (err as Error).message);
    return false;
  }
}

/**
 * Search for the top-k most similar vectors in a collection.
 * Returns results sorted by score descending, empty array on failure.
 */
export async function qdrantSearch(
  collection:     QdrantCollection,
  vector:         number[],
  limit           = 10,
  scoreThreshold  = 0.3,
  filter?:        Record<string, unknown>,
): Promise<QdrantSearchResult[]> {
  if (!_client || !_initialized) return [];
  try {
    const results = await _client.search(collection, {
      vector,
      limit,
      score_threshold: scoreThreshold,
      with_payload:    true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filter:          filter as any,
    });
    return results.map((r) => ({
      id:      String(r.id),
      score:   r.score,
      payload: (r.payload ?? {}) as Record<string, unknown>,
    }));
  } catch (err) {
    console.error(`[ghostbrain-qdrant] search error (${collection}):`, (err as Error).message);
    return [];
  }
}

/**
 * Delete points by IDs from a collection.
 */
export async function qdrantDelete(
  collection: QdrantCollection,
  ids:        string[],
): Promise<boolean> {
  if (!_client || !_initialized || ids.length === 0) return false;
  try {
    await _client.delete(collection, { wait: true, points: ids });
    return true;
  } catch (err) {
    console.error(`[ghostbrain-qdrant] delete error (${collection}):`, (err as Error).message);
    return false;
  }
}

/**
 * Get per-collection vector counts.
 */
export async function qdrantStats(): Promise<Record<string, { vectors_count: number }>> {
  if (!_client || !_initialized) return {};
  const out: Record<string, { vectors_count: number }> = {};
  await Promise.all(
    Object.values(COLLECTIONS).map(async (col) => {
      try {
        const info     = await _client!.getCollection(col);
        out[col]       = { vectors_count: (info.indexed_vectors_count ?? info.points_count ?? 0) as number };
      } catch {
        out[col]       = { vectors_count: 0 };
      }
    }),
  );
  return out;
}

/**
 * Helper: generate a UUID for use as a Qdrant point ID.
 */
export function newPointId(): string {
  return randomUUID();
}
