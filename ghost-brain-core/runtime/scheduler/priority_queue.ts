/**
 * GhostBrain Runtime — Priority Queue (min/max configurable)
 *
 * Binary-heap-based priority queue.  The comparator determines ordering:
 *   (a, b) => b.priority - a.priority  → max-heap (highest priority first)
 *   (a, b) => a.priority - b.priority  → min-heap
 */

export class PriorityQueue<T> {
  private heap: T[] = [];
  private readonly cmp: (a: T, b: T) => number;

  constructor(comparator: (a: T, b: T) => number) {
    this.cmp = comparator;
  }

  push(item: T): void {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top  = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  peek(): T | undefined {
    return this.heap[0];
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  size(): number {
    return this.heap.length;
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.cmp(this.heap[i]!, this.heap[parent]!) < 0) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent]!, this.heap[i]!];
      i = parent;
    }
  }

  private _sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let largest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.cmp(this.heap[l]!, this.heap[largest]!) > 0) largest = l;
      if (r < n && this.cmp(this.heap[r]!, this.heap[largest]!) > 0) largest = r;
      if (largest === i) break;
      [this.heap[i], this.heap[largest]] = [this.heap[largest]!, this.heap[i]!];
      i = largest;
    }
  }
}
