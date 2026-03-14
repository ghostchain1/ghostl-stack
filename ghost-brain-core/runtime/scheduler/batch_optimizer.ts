/**
 * GhostBrain Runtime — Batch Optimizer
 *
 * Groups compatible kernel specs into a single batch for dispatch.
 * Compatibility rules:
 *   - Same opcode (matmul, attention, etc.)
 *   - Same precision and target backend
 *   - Combined batch size does not exceed MAX_BATCH_SIZE (64)
 *   - Combined FLOP budget does not exceed MAX_BATCH_GFLOPS (1 TF = 1000 GF)
 */

import type { KernelSpec, ScheduledBatch } from "./types.js";

const MAX_BATCH_SIZE    = 64;
const MAX_BATCH_GFLOPS  = 1_000; // 1 TFlop per batch cap

function estimateFlopsB(spec: KernelSpec): number {
  // Simplified FLOP estimate for GEMM: 2 * M * N * K / 1e9
  const [M, N, K] = spec.shape ?? [128, 128, 128];
  return (2 * M * N * K) / 1e9;
}

export class BatchOptimizer {
  optimise(kernels: KernelSpec[]): ScheduledBatch {
    if (kernels.length === 0) return { kernels: [], estimatedFlopsBillion: 0 };
    if (kernels.length === 1) {
      return { kernels, estimatedFlopsBillion: estimateFlopsB(kernels[0]!) };
    }

    // Group by (opcode, precision, target)
    const groups = new Map<string, KernelSpec[]>();
    for (const k of kernels) {
      const key = `${k.opcode}:${k.precision ?? "fp32"}:${k.target ?? "cpu"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(k);
    }

    // Select largest group to form the primary batch
    let best: KernelSpec[] = [];
    for (const [, grp] of groups) {
      if (grp.length > best.length) best = grp;
    }

    const selected = best.slice(0, MAX_BATCH_SIZE);
    let totalGFlops = 0;
    const trimmed: KernelSpec[] = [];
    for (const k of selected) {
      const gf = estimateFlopsB(k);
      if (totalGFlops + gf > MAX_BATCH_GFLOPS) break;
      totalGFlops += gf;
      trimmed.push(k);
    }

    return { kernels: trimmed.length > 0 ? trimmed : [selected[0]!], estimatedFlopsBillion: totalGFlops };
  }
}
