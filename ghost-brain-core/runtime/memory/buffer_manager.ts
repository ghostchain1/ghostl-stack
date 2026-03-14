/**
 * GhostBrain Runtime — Buffer Manager
 *
 * Typed buffer pools for known tensor shapes in the hot inference path.
 * Avoids repeated alloc/free for common shapes (attention KV pairs, embeddings,
 * MLP activations).
 */

import { TensorAllocator, type TensorHandle } from "./tensor_allocator.js";

export interface BufferPoolConfig {
  name:       string;
  shape:      number[];
  dtype:      "fp32" | "fp16" | "bf16" | "int8" | "int4";
  poolSize:   number; // number of pre-allocated tensors in this pool
}

const DTYPE_BYTES: Record<string, number> = {
  fp32: 4, fp16: 2, bf16: 2, int8: 1, int4: 1,
};

interface PoolEntry {
  config:  BufferPoolConfig;
  handles: TensorHandle[];
  free:    TensorHandle[];
  _allocs: number;
  _borrows: number;
}

export class BufferManager {
  private readonly allocator: TensorAllocator;
  private readonly pools = new Map<string, PoolEntry>();

  constructor(allocator: TensorAllocator) {
    this.allocator = allocator;
  }

  /** Register and pre-allocate a typed buffer pool. */
  registerPool(cfg: BufferPoolConfig): void {
    const elemBytes = DTYPE_BYTES[cfg.dtype] ?? 4;
    const elemCount = cfg.shape.reduce((a, b) => a * b, 1);
    const byteSize  = elemCount * elemBytes;

    const entry: PoolEntry = {
      config: cfg, handles: [], free: [], _allocs: 0, _borrows: 0,
    };

    for (let i = 0; i < cfg.poolSize; ++i) {
      const h = this.allocator.alloc(byteSize);
      entry.handles.push(h);
      entry.free.push(h);
      entry._allocs++;
    }

    this.pools.set(cfg.name, entry);
  }

  /** Borrow a buffer from a named pool.  Throws if exhausted. */
  borrow(poolName: string): TensorHandle {
    const entry = this.pools.get(poolName);
    if (!entry) throw new Error(`GhostBrain BufferManager: unknown pool '${poolName}'`);
    const h = entry.free.pop();
    if (!h) throw new Error(`GhostBrain BufferManager: pool '${poolName}' exhausted`);
    entry._borrows++;
    return h;
  }

  /** Return a buffer to its pool. */
  return(poolName: string, handle: TensorHandle): void {
    const entry = this.pools.get(poolName);
    if (!entry) throw new Error(`GhostBrain BufferManager: unknown pool '${poolName}'`);
    entry.free.push(handle);
  }

  /** Borrow from dynamic pool (falls back to allocator for non-standard shapes). */
  borrowDynamic(byteSize: number): TensorHandle {
    return this.allocator.alloc(byteSize);
  }

  returnDynamic(handle: TensorHandle): void {
    this.allocator.free(handle);
  }

  stats() {
    const poolStats: Record<string, unknown> = {};
    for (const [name, entry] of this.pools) {
      poolStats[name] = {
        total:   entry.handles.length,
        free:    entry.free.length,
        allocs:  entry._allocs,
        borrows: entry._borrows,
      };
    }
    return { pools: poolStats, allocator: this.allocator.stats() };
  }
}

// ── Default pool configuration ────────────────────────────────────────────────

export function createDefaultBufferManager(allocator: TensorAllocator): BufferManager {
  const mgr = new BufferManager(allocator);
  mgr.registerPool({ name: "kv_pairs",     shape: [512, 32, 128, 2], dtype: "fp16", poolSize: 32 });
  mgr.registerPool({ name: "embeddings",   shape: [128000, 128],     dtype: "fp16", poolSize: 4  });
  mgr.registerPool({ name: "mlp_activations", shape: [64, 512, 4096], dtype: "fp16", poolSize: 8 });
  return mgr;
}
