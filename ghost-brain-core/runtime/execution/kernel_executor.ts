/**
 * GhostBrain Runtime — Kernel Executor
 *
 * Executes batches of kernels against the appropriate backend.  On Phase 1 (CPU)
 * all execution is in-process via TypeScript.  The executor dispatches to the
 * correct backend based on the target field in the KernelSpec.
 */

import type { TensorAllocator } from "../memory/tensor_allocator.js";
import type { BufferManager }   from "../memory/buffer_manager.js";
import type { KernelSpec, ScheduledBatch } from "../scheduler/types.js";

export class KernelExecutor {
  private readonly allocator: TensorAllocator;
  private readonly bufMgr:    BufferManager;
  private _executed = 0;
  private _errors   = 0;

  constructor(allocator: TensorAllocator, bufMgr: BufferManager) {
    this.allocator = allocator;
    this.bufMgr    = bufMgr;
  }

  async executeBatch(batch: ScheduledBatch): Promise<void> {
    for (const kernel of batch.kernels) {
      try {
        await this._executeOne(kernel);
        this._executed++;
      } catch (err) {
        this._errors++;
        throw err;
      }
    }
  }

  private async _executeOne(spec: KernelSpec): Promise<unknown> {
    switch (spec.target ?? "cpu") {
    case "cpu":     return this._executeCpu(spec);
    case "gpu":     return this._executeGpu(spec);
    case "fpga":
    case "chiplet": return this._executeChiplet(spec);
    default:
      throw new Error(`GhostBrain KernelExecutor: unknown target '${spec.target}'`);
    }
  }

  // ── CPU Execution (Phase 1) ─────────────────────────────────────────────────

  private async _executeCpu(spec: KernelSpec): Promise<void> {
    switch (spec.opcode) {
    case "matmul":
    case "matmul_tiled":
    case "matmul_int":
      this._cpuGemm(spec);
      return;
    case "attention":
      this._cpuFlashAttention(spec);
      return;
    case "add":
    case "mul":
    case "relu":
    case "softmax":
      this._cpuElementwise(spec);
      return;
    default:
      // Unknown op — log and continue (fail-open is safe for non-critical ops)
      console.warn(`GhostBrain KernelExecutor: no CPU impl for '${spec.opcode}' — skipped`);
    }
  }

  private _cpuGemm(spec: KernelSpec): void {
    const [M = 128, N = 128, K = 128] = spec.shape ?? [];
    // Naive reference GEMM (Phase 1 — correctness over speed)
    const A = spec.inputs?.[0] ?? new Float32Array(M * K);
    const B = spec.inputs?.[1] ?? new Float32Array(K * N);
    const C = new Float32Array(M * N);
    for (let i = 0; i < M; ++i)
      for (let j = 0; j < N; ++j)
        for (let k = 0; k < K; ++k)
          C[i * N + j]! += (A as Float32Array)[i * K + k]! * (B as Float32Array)[k * N + j]!;
    spec.outputs = [C];
  }

  private _cpuFlashAttention(spec: KernelSpec): void {
    // Placeholder — real implementation would use tiled softmax + matmul
    spec.outputs = [spec.inputs?.[0] ?? new Float32Array(0)];
  }

  private _cpuElementwise(spec: KernelSpec): void {
    const input = spec.inputs?.[0];
    if (!input || !(input instanceof Float32Array)) return;
    const out = new Float32Array(input.length);
    switch (spec.opcode) {
    case "relu":    for (let i = 0; i < input.length; ++i) out[i] = Math.max(0, input[i]!); break;
    case "add":     { const b = spec.inputs?.[1]; if (b instanceof Float32Array) for (let i = 0; i < input.length; ++i) out[i] = input[i]! + b[i]!; break; }
    case "mul":     { const b = spec.inputs?.[1]; if (b instanceof Float32Array) for (let i = 0; i < input.length; ++i) out[i] = input[i]! * b[i]!; break; }
    default: input.forEach((v, i) => out[i] = v);
    }
    spec.outputs = [out];
  }

  // ── GPU / Chiplet Stubs (Phase 2+) ─────────────────────────────────────────

  private async _executeGpu(spec: KernelSpec): Promise<void> {
    throw new Error(`GhostBrain: GPU backend not yet initialised for op '${spec.opcode}'. Enable Phase 2 GPU support.`);
  }

  private async _executeChiplet(spec: KernelSpec): Promise<void> {
    throw new Error(`GhostBrain: Chiplet backend not yet initialised for op '${spec.opcode}'. Enable Phase 4 chiplet support.`);
  }

  stats() {
    return { executed: this._executed, errors: this._errors };
  }
}
