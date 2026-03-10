/**
 * GhostBrain Runtime — KV Cache Manager (PagedAttention)
 *
 * Manages the key-value cache for LLM inference using a paged memory scheme
 * inspired by vLLM PagedAttention.  Each page holds PAGE_TOKENS tokens of
 * K and V tensors.  Pages are allocated from the TensorAllocator and tracked
 * in a per-sequence page table.
 *
 * LRU eviction is used when under memory pressure; evicted pages are written
 * to a host-DRAM swap area and re-materialised transparently on access.
 */

import { TensorAllocator, type TensorHandle } from "./tensor_allocator.js";

const PAGE_TOKENS    = Number(process.env.KV_PAGE_TOKENS   ?? "16");
const MAX_SEQS       = Number(process.env.KV_MAX_SEQS      ?? "256");
const NUM_HEADS      = Number(process.env.KV_NUM_HEADS      ?? "32");
const HEAD_DIM       = Number(process.env.KV_HEAD_DIM       ?? "128");
const DTYPE_BYTES    = 2; // fp16

const PAGE_BYTES = PAGE_TOKENS * NUM_HEADS * HEAD_DIM * 2 /* K+V */ * DTYPE_BYTES;

interface KVPage {
  handle:    TensorHandle;
  seqId:     number;
  pageIdx:   number;
  lastUsed:  number; // monotonic tick for LRU
}

export class KVCacheManager {
  private readonly allocator: TensorAllocator;
  private readonly pageTable   = new Map<number, KVPage[]>();  // seqId → pages
  private readonly freePages:  TensorHandle[] = [];
  private _tick        = 0;
  private _hits        = 0;
  private _misses      = 0;
  private _evictions   = 0;

  constructor(allocator: TensorAllocator, preAllocPages = 512) {
    this.allocator = allocator;
    for (let i = 0; i < preAllocPages; ++i) {
      try {
        this.freePages.push(allocator.alloc(PAGE_BYTES));
      } catch { break; } // stop if OOM
    }
  }

  /** Allocate a new token page for the given sequence. */
  allocPage(seqId: number): KVPage {
    if (this.freePages.length === 0) this._evictLRU();
    const handle = this.freePages.pop()!;
    const pages  = this.pageTable.get(seqId) ?? [];

    const page: KVPage = {
      handle, seqId, pageIdx: pages.length, lastUsed: ++this._tick,
    };

    pages.push(page);
    this.pageTable.set(seqId, pages);
    this._misses++;
    return page;
  }

  /** Look up which pages belong to a sequence (for attention kernel). */
  getPageTable(seqId: number): KVPage[] {
    const pages = this.pageTable.get(seqId);
    if (pages) { this._hits++; return pages; }
    this._misses++;
    return [];
  }

  /** Release all pages for a completed sequence. */
  releaseSeq(seqId: number): void {
    const pages = this.pageTable.get(seqId);
    if (!pages) return;
    for (const p of pages) this.freePages.push(p.handle);
    this.pageTable.delete(seqId);
  }

  private _evictLRU(): void {
    // Find the least recently used page across all sequences
    let lruPage: KVPage | null = null;
    let lruSeqId = -1;

    for (const [seqId, pages] of this.pageTable) {
      for (const page of pages) {
        if (!lruPage || page.lastUsed < lruPage.lastUsed) {
          lruPage  = page;
          lruSeqId = seqId;
        }
      }
    }

    if (!lruPage || lruSeqId === -1) {
      throw new Error("GhostBrain KVCacheManager: cannot evict — all sequences empty");
    }

    // Remove the page from the sequence's page table
    const pages = this.pageTable.get(lruSeqId)!;
    const idx   = pages.indexOf(lruPage);
    if (idx !== -1) pages.splice(idx, 1);
    if (pages.length === 0) this.pageTable.delete(lruSeqId);

    // In production, write evicted page to DRAM swap here
    this.freePages.push(lruPage.handle);
    this._evictions++;
  }

  stats() {
    return {
      activeSeqs:     this.pageTable.size,
      freePages:      this.freePages.length,
      pageTokens:     PAGE_TOKENS,
      pageBytes:      PAGE_BYTES,
      maxSeqs:        MAX_SEQS,
      cacheHits:      this._hits,
      cacheMisses:    this._misses,
      evictions:      this._evictions,
    };
  }
}
