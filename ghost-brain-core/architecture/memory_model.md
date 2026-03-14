# GhostBrain — Memory Model

## Overview

GhostBrain manages memory across a 4-level hierarchy.  The tensor allocator handles all
allocations above the hardware register file; the buffer manager provides pool-based reuse;
the KV cache manager serves the LLM inference path.

## Tensor Allocator (`runtime/memory/tensor_allocator.ts`)

### Allocation Lifecycle
```
alloc(shape, dtype, hint?) → TensorHandle
   → round up to alignment (64 bytes for CPU, 256 bytes for GPU/chiplet)
   → reserve from pool or expand pool from OS page allocator
   → return opaque TensorHandle

free(handle)
   → return to pool (never call OS free immediately)
   → coalesce adjacent free blocks (buddy-allocator style)
```

### Pool Configuration

| Backend | Pool Size | Alignment | Policy       |
|---------|-----------|-----------|--------------|
| CPU     | 2 GB      | 64 B      | best-fit     |
| GPU     | 40 GB     | 256 B     | stream-aware |
| FPGA    | 512 MB    | 4 KB      | static tiles |
| Chiplet | 96 GB HBM | 256 B     | HBM-aware    |

### Fragmentation Mitigation
- Buddy allocator halves fragmentation for power-of-2 tensor shapes
- Compaction pass runs when free-ratio < 20% (triggered by allocator, not GC)
- Memory-mapped temp tensors for shapes > 512 MB (mmap + madvise MADV_SEQUENTIAL)

## Buffer Manager (`runtime/memory/buffer_manager.ts`)

Provides **typed buffer pools** for known tensor shapes (attention KV pairs, embedding vectors,
activation tensors) to avoid repeated alloc/free cycles in the hot inference path.

```
Pool A: [seq=512, heads=32, dim=128] × 32 buffers  ← pre-allocated at startup
Pool B: [vocab=128000, dim=4096] × 4 buffers        ← embedding lookup
Pool C: [batch=64, seq=512, dim=4096] × 8 buffers   ← MLP activations
Dynamic pool: arbitrary shapes, managed by tensor_allocator
```

## KV Cache Manager (`runtime/memory/kv_cache_manager.ts`)

### PagedAttention Implementation
- Inspired by vLLM PagedAttention; adapted for GhostBrain's chain-integrated inference
- Each "page" = 16 tokens × num_heads × head_dim × 2 (K+V) × sizeof(dtype)
- Pages are allocated from the HBM pool and tracked in a page table
- Pages are reclaimed when the corresponding sequence is finished (tracked via `seq_id`)

### Page Table
```
seq_id → [ page_idx_0, page_idx_1, …, page_idx_N ]
```
- Maximum concurrent sequences: 256 (default; configurable via `KV_MAX_SEQS`)
- Page size: 16 tokens (balances fragmentation vs. granularity)

### Eviction Policy
- LRU eviction when under memory pressure
- Evicted pages written to host DRAM swap area (pinned, 16 GB reserved)
- Re-materialization transparent to inference kernel

## Distributed Memory (Phase 5)

When running across multiple chiplets:
- Tensor sharding via `runtime/distributed/topology.ts`
- Remote tensors accessed via RDMA (RoCEv2, 512 Gbps fabric)
- Ownership table: each tensor shard has exactly one owning node
- AllReduce synchronises gradient/activation shards (see `all_reduce.ts`)

## Security

- Phase 4+: all HBM content encrypted with AES-256-XTS (see `security/encryption/memory_encryption.ts`)
- Keys derived from chip attestation identity (`security/attestation/chip_identity.rs`)
- Scrubbing on dealloc prevents data remnance attacks
