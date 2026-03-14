/**
 * IntelligenceSync — synchronizes AI memory and knowledge between GhostBrain nodes.
 */
export interface MemoryFragment {
  nodeId:    string;
  type:      string;
  data:      Record<string, unknown>;
  timestamp: number;
}

export class IntelligenceSync {
  private sharedMemory: MemoryFragment[] = [];

  sync(local: MemoryFragment[], remote: MemoryFragment[]): MemoryFragment[] {
    const merged = [...local, ...remote];
    // Deduplicate by nodeId+timestamp+type
    const seen  = new Set<string>();
    const deduped = merged.filter(f => {
      const key = `${f.nodeId}:${f.type}:${f.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    this.sharedMemory = deduped.sort((a, b) => a.timestamp - b.timestamp);
    return this.sharedMemory;
  }

  getShared(limit = 200): MemoryFragment[] {
    return this.sharedMemory.slice(-limit);
  }
}
