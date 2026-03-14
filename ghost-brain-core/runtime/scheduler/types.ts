/**
 * GhostBrain Runtime — Shared Type Definitions
 *
 * Kernel spec and related types used across the runtime scheduler,
 * executor, and distributed layers.
 */

/** GhostChain hex string: 0x-prefixed bytes. */
export type Hex = `0x${string}`;

export type KernelPriority = number;
// Conventional priorities:
//   >= 100: governance (preempts all)
//   80–99:  fraud detection / security
//   60–79:  validator health
//   40–59:  treasury optimisation
//   20–39:  inference requests
//   0–19:   benchmarks / background

export type KernelTarget   = "cpu" | "gpu" | "fpga" | "chiplet";
export type KernelPrecision = "fp32" | "fp16" | "bf16" | "int8" | "int4";

export interface KernelSpec {
  /** Opcode from the GhostTensor dialect (matmul, attention, relu, …) */
  opcode:     string;
  /** Shape dimensions for the primary op (M, N, K for GEMM; seq, heads, dim for attention) */
  shape?:     number[];
  /** Execution priority — see KernelPriority constants above */
  priority:   KernelPriority;
  /** Target hardware backend */
  target?:    KernelTarget;
  /** Computation precision */
  precision?: KernelPrecision;
  /** Input tensor data (Phase 1: Float32Array; Phase 2+: TensorHandle IDs) */
  inputs?:    (Float32Array | number)[];
  /** Output tensors (populated by executor after completion) */
  outputs?:   (Float32Array | number)[];
  /** Caller-supplied metadata for audit/tracing */
  meta?:      Record<string, string>;
}

export interface ScheduledBatch {
  kernels:                KernelSpec[];
  estimatedFlopsBillion:  number;
}
