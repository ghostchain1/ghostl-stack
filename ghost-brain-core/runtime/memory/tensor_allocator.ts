/**
 * GhostBrain Runtime — Tensor Allocator
 *
 * Pool-based tensor memory allocator.  Provides aligned buffer allocation with
 * buddy-coalescing on free and optional memory scrubbing (security mode).
 *
 * On Node.js (Phase 1/2) this manages SharedArrayBuffers for cross-thread
 * tensor sharing.  On Phase 4+ chiplets the same API is implemented natively.
 */

export interface TensorHandle {
  id:        number;
  byteSize:  number;
  alignment: number;
  buffer:    SharedArrayBuffer;
}

interface FreeBlock {
  offset:   number;
  byteSize: number;
}

const ALIGN_CPU      = 64;
const POOL_SIZE_BYTES = Number(process.env.GB_TENSOR_POOL_MB ?? "2048") * 1024 * 1024;
const SCRUB_ON_FREE  = process.env.GB_TENSOR_SCRUB === "1";

export class TensorAllocator {
  private readonly pool: SharedArrayBuffer;
  private readonly view: Uint8Array;
  private freeList: FreeBlock[];
  private _nextId  = 1;
  private _allocs  = 0;
  private _frees   = 0;

  constructor(poolBytes = POOL_SIZE_BYTES) {
    // SharedArrayBuffer requires cross-origin isolation in browsers; Node.js allows it freely
    this.pool     = new SharedArrayBuffer(poolBytes);
    this.view     = new Uint8Array(this.pool);
    this.freeList = [{ offset: 0, byteSize: poolBytes }];
  }

  alloc(byteSize: number, alignment = ALIGN_CPU): TensorHandle {
    const aligned = Math.ceil(byteSize / alignment) * alignment;
    // Best-fit search
    let bestIdx = -1;
    let bestSize = Infinity;
    for (let i = 0; i < this.freeList.length; ++i) {
      const blk = this.freeList[i]!;
      if (blk.byteSize >= aligned && blk.byteSize < bestSize) {
        bestIdx = i;
        bestSize = blk.byteSize;
      }
    }
    if (bestIdx === -1) throw new Error(`GhostBrain TensorAllocator: OOM (requested ${aligned} bytes)`);

    const blk = this.freeList[bestIdx]!;
    const offset = blk.offset;

    // Split the block
    if (blk.byteSize > aligned) {
      this.freeList[bestIdx] = { offset: offset + aligned, byteSize: blk.byteSize - aligned };
    } else {
      this.freeList.splice(bestIdx, 1);
    }

    this._allocs++;
    return {
      id:        this._nextId++,
      byteSize:  aligned,
      alignment,
      buffer:    this.pool,
    };
  }

  free(handle: TensorHandle): void {
    if (SCRUB_ON_FREE) {
      // Zero the allocation to prevent data remnance
      this.view.fill(0, 0, handle.byteSize);
    }
    this.freeList.push({ offset: 0, byteSize: handle.byteSize });
    this._coalesce();
    this._frees++;
  }

  /** Merge adjacent free blocks (buddy coalescing). */
  private _coalesce(): void {
    this.freeList.sort((a, b) => a.offset - b.offset);
    let i = 0;
    while (i + 1 < this.freeList.length) {
      const a = this.freeList[i]!;
      const b = this.freeList[i + 1]!;
      if (a.offset + a.byteSize === b.offset) {
        a.byteSize += b.byteSize;
        this.freeList.splice(i + 1, 1);
      } else {
        ++i;
      }
    }
  }

  freeRatio(): number {
    const totalFree = this.freeList.reduce((s, b) => s + b.byteSize, 0);
    return totalFree / this.pool.byteLength;
  }

  stats() {
    return {
      poolBytes:   this.pool.byteLength,
      freeRatio:   this.freeRatio(),
      allocs:      this._allocs,
      frees:       this._frees,
      freeBlocks:  this.freeList.length,
    };
  }
}
