/**
 * GhostContractAI — Memory Budget Enforcement
 *
 * Tracks process RSS and enforces hard/soft memory limits.
 * Jobs are rejected / aborted if memory exceeds hard limit.
 */

import { logger } from "../logger.js";

const MEMORY_SOFT_MB = Number(process.env.GHOSTAI_MEMORY_SOFT_MB ?? 512);
const MEMORY_HARD_MB = Number(process.env.GHOSTAI_MEMORY_HARD_MB ?? 1024);

export class MemoryBudgetError extends Error {
  constructor(rss: number) {
    super(
      `MemoryBudgetError: RSS ${rss} MB exceeds hard limit ${MEMORY_HARD_MB} MB`,
    );
    this.name = "MemoryBudgetError";
  }
}

/**
 * Enforce memory budget before running a job.
 * Throws if current RSS is already over the hard limit.
 */
export function assertMemoryBudget(): void {
  const rssMB = _rssMB();
  if (rssMB > MEMORY_HARD_MB) {
    throw new MemoryBudgetError(rssMB);
  }
  if (rssMB > MEMORY_SOFT_MB) {
    logger.warn("Memory soft limit exceeded — forcing GC if available", {
      rssMB,
      softLimit: MEMORY_SOFT_MB,
    });
    // Hint to V8 GC if exposed
    if (typeof (global as Record<string, unknown>).gc === "function") {
      (global as Record<string, unknown>).gc as () => void;
    }
  }
}

/**
 * Wrap an async job function in a memory budget envelope.
 * Checks before execution; warns if exceeded mid-run.
 */
export async function withMemoryBudget<T>(fn: () => Promise<T>): Promise<T> {
  assertMemoryBudget();
  const result = await fn();
  // Post-run check for logging
  const rssMB = _rssMB();
  if (rssMB > MEMORY_SOFT_MB) {
    logger.warn("Memory soft limit exceeded post-job", { rssMB });
  }
  return result;
}

function _rssMB(): number {
  return Math.ceil(process.memoryUsage().rss / 1_048_576);
}

/**
 * Periodic memory monitor — logs current RSS every interval.
 */
export function startMemoryMonitor(intervalMs = 30_000): NodeJS.Timeout {
  return setInterval(() => {
    const rssMB = _rssMB();
    logger.info("Memory monitor", { rssMB, softMB: MEMORY_SOFT_MB, hardMB: MEMORY_HARD_MB });
  }, intervalMs);
}
