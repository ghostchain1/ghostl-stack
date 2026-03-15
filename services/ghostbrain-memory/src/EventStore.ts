/**
 * EventStore — in-memory event bus tracking real-time GhostStack events.
 */
export interface GhostSystemEvent {
  id:        string;
  time:      number;
  type:      string;
  source:    string;
  severity:  "info" | "warn" | "error" | "critical";
  data:      Record<string, unknown>;
}

export class EventStore {
  private events: GhostSystemEvent[] = [];
  private readonly maxEvents = 10_000;

  add(event: Omit<GhostSystemEvent, "id" | "time">): GhostSystemEvent {
    const e: GhostSystemEvent = {
      id:   `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      time: Date.now(),
      ...event,
    };
    this.events.push(e);
    if (this.events.length > this.maxEvents) this.events.shift();
    return e;
  }

  getRecent(n = 100): GhostSystemEvent[] {
    return this.events.slice(-n);
  }

  byType(type: string): GhostSystemEvent[] {
    return this.events.filter(e => e.type === type);
  }

  bySeverity(severity: GhostSystemEvent["severity"]): GhostSystemEvent[] {
    return this.events.filter(e => e.severity === severity);
  }

  count(): number {
    return this.events.length;
  }
}
