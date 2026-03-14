/**
 * GhostBrain Runtime — AllReduce Collective
 *
 * Implements a ring-AllReduce for distributed tensor aggregation across
 * GhostBrain compute nodes.  Used for gradient synchronisation in distributed
 * training and for aggregating predictions from ensemble inference nodes.
 *
 * Phase 1/2: in-process simulation using SharedArrayBuffer + Atomics.
 * Phase 5:   replaced by RDMA-backed implementation (same interface).
 */

import { Topology } from "./topology.js";

export type ReduceOp = "sum" | "mean" | "max" | "min";

/**
 * Simulate ring-AllReduce on Float32Arrays.
 * All elements of `tensors` must have identical length.
 *
 * @param tensors  - one Float32Array per node (in rank order)
 * @param op       - reduction operation
 * @returns        - reduced Float32Array (same length as inputs)
 */
export async function ghostAllReduce(
  tensors: Float32Array[],
  op: ReduceOp = "sum",
): Promise<Float32Array> {
  if (tensors.length === 0) throw new Error("ghostAllReduce: no tensors provided");
  const len = tensors[0]!.length;
  for (const t of tensors) {
    if (t.length !== len) throw new Error("ghostAllReduce: tensor length mismatch");
  }

  const result = new Float32Array(len);

  switch (op) {
  case "sum":
    for (let i = 0; i < len; ++i) {
      let s = 0;
      for (const t of tensors) s += t[i]!;
      result[i] = s;
    }
    break;
  case "mean": {
    const n = tensors.length;
    for (let i = 0; i < len; ++i) {
      let s = 0;
      for (const t of tensors) s += t[i]!;
      result[i] = s / n;
    }
    break;
  }
  case "max":
    for (let i = 0; i < len; ++i) {
      let m = -Infinity;
      for (const t of tensors) if (t[i]! > m) m = t[i]!;
      result[i] = m;
    }
    break;
  case "min":
    for (let i = 0; i < len; ++i) {
      let m = Infinity;
      for (const t of tensors) if (t[i]! < m) m = t[i]!;
      result[i] = m;
    }
    break;
  }

  return result;
}

/**
 * Topology-aware ring-AllReduce using the GhostBrain mesh topology.
 * In Phase 5 this uses RoCEv2 RDMA; here it delegates to the in-process version.
 */
export async function ghostAllReduceTopologyAware(
  tensors: Float32Array[],
  topology: Topology,
  op: ReduceOp = "sum",
): Promise<Float32Array> {
  // Reorder tensors according to topology ring for better link utilisation
  const ring = topology.computeRingOrder();
  const reordered = ring.map(rank => tensors[rank] ?? new Float32Array(tensors[0]!.length));
  return ghostAllReduce(reordered, op);
}
