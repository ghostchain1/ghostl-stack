/**
 * GhostBrain Runtime — Runtime Controller
 *
 * Central orchestrator for the GhostBrain compute runtime.  Owns the kernel
 * scheduler, tensor allocator, buffer manager, and KV cache.  Exposes a
 * simple `submitKernel` / `execute` API used by the integration layer and
 * the GhostBrain Core service.
 */

import { TensorAllocator }              from "../memory/tensor_allocator.js";
import { BufferManager, createDefaultBufferManager } from "../memory/buffer_manager.js";
import { KVCacheManager }               from "../memory/kv_cache_manager.js";
import { KernelScheduler }              from "../scheduler/kernel_scheduler.js";
import { KernelExecutor }               from "./kernel_executor.js";
import type { KernelSpec }              from "../scheduler/types.js";

export class GhostRuntimeController {
  private readonly allocator:  TensorAllocator;
  private readonly bufMgr:     BufferManager;
  private readonly kvCache:    KVCacheManager;
  private readonly executor:   KernelExecutor;
  private readonly scheduler:  KernelScheduler;
  private _submitted = 0;
  private _errors    = 0;

  constructor() {
    this.allocator = new TensorAllocator();
    this.bufMgr    = createDefaultBufferManager(this.allocator);
    this.kvCache   = new KVCacheManager(this.allocator);
    this.executor  = new KernelExecutor(this.allocator, this.bufMgr);
    this.scheduler = new KernelScheduler(this.executor);
  }

  /** Submit a kernel for asynchronous execution.
   *  Returns a promise that resolves when the kernel completes. */
  submitKernel(spec: KernelSpec): Promise<unknown> {
    this._submitted++;
    return this.scheduler.submit(spec).catch(err => {
      this._errors++;
      throw err;
    });
  }

  /** Submit and immediately await a single kernel (convenience method). */
  async execute(spec: KernelSpec): Promise<unknown> {
    return this.submitKernel(spec);
  }

  /** Flush all pending kernels and return when the queue is empty. */
  async flush(): Promise<void> {
    // Poll until the scheduler queue is drained
    while (this.scheduler.stats().queued > 0) {
      await new Promise<void>(r => setImmediate(r));
    }
  }

  get kv(): KVCacheManager { return this.kvCache; }
  get buf(): BufferManager  { return this.bufMgr;  }

  stats() {
    return {
      submitted:  this._submitted,
      errors:     this._errors,
      scheduler:  this.scheduler.stats(),
      allocator:  this.allocator.stats(),
      kvcache:    this.kvCache.stats(),
    };
  }
}

// Singleton runtime controller (one per process)
let _instance: GhostRuntimeController | null = null;
export function getRuntimeController(): GhostRuntimeController {
  if (!_instance) _instance = new GhostRuntimeController();
  return _instance;
}
