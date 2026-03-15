/**
 * MemoryAgent — stores and retrieves long-term GhostBrain memories.
 */
import { MemoryEngine, MemoryEvent } from "../src/MemoryEngine";

export class MemoryAgent {
  private engine = new MemoryEngine();

  store(type: string, payload: Record<string, unknown>, outcome?: string): void {
    this.engine.store({ type, payload, source: "memory-agent", outcome });
  }

  recall(type: string): MemoryEvent[] {
    return this.engine.byType(type);
  }

  recent(n = 50): MemoryEvent[] {
    return this.engine.recent(n);
  }
}
