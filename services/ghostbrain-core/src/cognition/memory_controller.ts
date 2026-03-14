/**
 * GhostBrain Core — Memory Controller
 *
 * Central coordinator for all memory layers.
 * Handles:
 * - unified hydration at startup
 * - tier promotion: hot → warm (disk) → cold (archive)
 * - cross-layer queries (e.g. "what do we know about this resource?")
 * - Prometheus metric counters for memory state
 */

import { mkdirSync }             from "node:fs";
import { hydrateCognitiveMemory, cognitiveStats }      from "../memory/cognitive_memory.js";
import { hydrateInfraMemory, infraSummary, getInfraHistory } from "../memory/infrastructure_memory.js";
import { hydrateFixMemory, fixMemoryStats, lookupFix } from "../memory/fix_memory.js";
import { hydratePerfMemory, perfStats, getPerfHistory } from "../memory/performance_memory.js";
import { hydrateVectorMemory, vectorStats, search }    from "../memory/vector_memory.js";

export interface MemoryTotals {
  cognitive:      ReturnType<typeof cognitiveStats>;
  infrastructure: ReturnType<typeof infraSummary>;
  fixes:          ReturnType<typeof fixMemoryStats>;
  performance:    ReturnType<typeof perfStats>;
  vector:         ReturnType<typeof vectorStats>;
  hydratedAt:     string;
}

let _hydratedAt: Date | null = null;

/** Boot-time hydration — call once from index.ts before serving traffic. */
export function hydrateAllMemory(): void {
  const dir = process.env.GHOSTBRAIN_MEMORY_DIR ?? "/tmp/ghostbrain-memory";
  mkdirSync(dir, { recursive: true });
  hydrateCognitiveMemory(dir);
  hydrateInfraMemory(dir);
  hydrateFixMemory(dir);
  hydratePerfMemory(dir);
  hydrateVectorMemory(dir);
  _hydratedAt = new Date();
}

/** Aggregate stats across all memory layers. */
export function getMemoryTotals(): MemoryTotals {
  return {
    cognitive:      cognitiveStats(),
    infrastructure: infraSummary(),
    fixes:          fixMemoryStats(),
    performance:    perfStats(),
    vector:         vectorStats(),
    hydratedAt:     _hydratedAt?.toISOString() ?? "not_yet",
  };
}

/**
 * Cross-layer context for a resource:
 * returns infra history + perf history + known fixes.
 */
export function getResourceContext(resourceId: string) {
  return {
    infraHistory:    getInfraHistory(resourceId, undefined, 3_600_000),
    perfHistory:     getPerfHistory(resourceId, 86_400_000),
    suggestedFix:    lookupFix(resourceId),
    similarPatterns: search(resourceId, 3),
  };
}

export function isHydrated(): boolean {
  return _hydratedAt !== null;
}
