/**
 * MemoryEngine — persistent event storage for GhostBrain.
 * Writes every system event to a NDJSON log for historical learning.
 */
import * as fs   from "fs";
import * as path from "path";

const MEMORY_DIR  = path.join(__dirname, "../storage");
const MEMORY_FILE = path.join(MEMORY_DIR, "memory.ndjson");

export interface MemoryEvent {
  id:        string;
  timestamp: number;
  type:      string;
  payload:   Record<string, unknown>;
  source?:   string;
  outcome?:  string;
}

export class MemoryEngine {
  constructor() {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }

  store(event: Omit<MemoryEvent, "id" | "timestamp">): MemoryEvent {
    const entry: MemoryEvent = {
      id:        `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      ...event,
    };
    fs.appendFileSync(MEMORY_FILE, JSON.stringify(entry) + "\n", "utf8");
    return entry;
  }

  load(): MemoryEvent[] {
    if (!fs.existsSync(MEMORY_FILE)) return [];
    return fs.readFileSync(MEMORY_FILE, "utf8")
      .split("\n")
      .filter(Boolean)
      .map(line => JSON.parse(line) as MemoryEvent);
  }

  recent(n = 100): MemoryEvent[] {
    return this.load().slice(-n);
  }

  byType(type: string): MemoryEvent[] {
    return this.load().filter(e => e.type === type);
  }

  clear(): void {
    fs.writeFileSync(MEMORY_FILE, "", "utf8");
  }
}
