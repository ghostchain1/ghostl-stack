/**
 * GhostBrain Runtime — Kernel Scheduler
 *
 * Dequeues kernels from the priority queue, applies batch optimisation, and
 * dispatches to the kernel executor.  Respects GhostBrain governance priority
 * ordering: governance evaluations always preempt inference workloads.
 */

import { PriorityQueue }   from "./priority_queue.js";
import { BatchOptimizer }  from "./batch_optimizer.js";
import { KernelExecutor }  from "../execution/kernel_executor.js";
import type { KernelSpec, ScheduledBatch, KernelPriority } from "./types.js";

export class KernelScheduler {
  private readonly queue:     PriorityQueue<KernelSpec>;
  private readonly optimizer: BatchOptimizer;
  private readonly executor:  KernelExecutor;
  private running = false;
  private _scheduled = 0;
  private _batches   = 0;

  constructor(executor: KernelExecutor) {
    this.queue     = new PriorityQueue<KernelSpec>((a, b) => b.priority - a.priority);
    this.optimizer = new BatchOptimizer();
    this.executor  = executor;
  }

  /** Submit a kernel for scheduled execution. Returns a promise that resolves
   *  when the kernel has completed.  Governance kernels (priority >= 100) skip
   *  batching and are dispatched immediately. */
  submit(spec: KernelSpec): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.queue.push({ ...spec, _resolve: resolve, _reject: reject } as any);
      this._scheduled++;
      this._maybeDispatch();
    });
  }

  private _maybeDispatch(): void {
    if (this.running) return;
    this.running = true;
    // Use setImmediate so callers can submit before dispatch begins
    setImmediate(() => this._dispatchLoop());
  }

  private async _dispatchLoop(): Promise<void> {
    while (!this.queue.isEmpty()) {
      const batch = this._formBatch();
      this._batches++;
      try {
        await this.executor.executeBatch(batch);
        for (const k of batch.kernels) (k as any)._resolve?.();
      } catch (err) {
        for (const k of batch.kernels) (k as any)._reject?.(err);
      }
    }
    this.running = false;
  }

  private _formBatch(): ScheduledBatch {
    const peek = this.queue.peek();
    if (!peek) return { kernels: [], estimatedFlopsBillion: 0 };

    // Governance kernels (priority >= 100) run alone, undelayed
    if (peek.priority >= 100) {
      return { kernels: [this.queue.pop()!], estimatedFlopsBillion: 0 };
    }

    // Collect compatible kernels for batching
    const candidates: KernelSpec[] = [];
    while (!this.queue.isEmpty() && candidates.length < 64) {
      const k = this.queue.peek()!;
      if (k.priority >= 100) break; // governance boundary — stop accumulating
      candidates.push(this.queue.pop()!);
    }
    return this.optimizer.optimise(candidates);
  }

  stats() {
    return {
      queued:     this.queue.size(),
      scheduled:  this._scheduled,
      batches:    this._batches,
    };
  }
}
