import crypto from 'node:crypto';
import type { CivilizationEvent, CivilizationEventType } from '../types.js';

type RecordInput = Omit<CivilizationEvent, 'id' | 'timestamp'>;

/**
 * GhostCivilizationMemory — long-term institutional memory of the GhostStack.
 *
 * Records every significant ecosystem event with structured metadata,
 * preserving the full history of governance outcomes, economic decisions,
 * network events, treaty lifecycles, and expansion milestones.
 *
 * This memory is the foundation for:
 *  - Post-mortem analysis
 *  - Pattern detection (recurring events signal systemic issues)
 *  - Audit trails for regulatory compliance
 *  - Historical context for the DecisionSynthesizer
 *  - Long-term drift detection (gradual degradation)
 *
 * In production, this would be backed by a persistent store (PostgreSQL /
 * Loki / S3-backed event log). Here it operates as an in-memory ring buffer
 * capped at `maxEntries`.
 */
export class GhostCivilizationMemory {
  private readonly history: CivilizationEvent[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  /** Record a new civilization event. */
  record(input: RecordInput): CivilizationEvent {
    const event: CivilizationEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...input,
    };

    this.history.push(event);

    // Evict oldest entries when ring buffer is full
    if (this.history.length > this.maxEntries) {
      this.history.splice(0, this.history.length - this.maxEntries);
    }

    return event;
  }

  // ── Query API ──────────────────────────────────────────────────────────────

  /** Retrieve the N most recent events (default 50). */
  recent(limit = 50): CivilizationEvent[] {
    return this.history.slice(-limit).reverse();
  }

  /** Filter events by type. */
  byType(type: CivilizationEventType, limit = 100): CivilizationEvent[] {
    return this.history
      .filter((e) => e.type === type)
      .slice(-limit)
      .reverse();
  }

  /** Filter events by significance level. */
  bySignificance(level: CivilizationEvent['significance'], limit = 100): CivilizationEvent[] {
    return this.history
      .filter((e) => e.significance === level)
      .slice(-limit)
      .reverse();
  }

  /** Return all 'historic' significance events (the greatest hits). */
  get historicEvents(): CivilizationEvent[] {
    return this.history.filter((e) => e.significance === 'historic');
  }

  /**
   * Detect recurring patterns: returns event types that have occurred
   * more than `threshold` times in the last `windowMs` milliseconds.
   */
  detectPatterns(windowMs = 3_600_000, threshold = 3): { type: CivilizationEventType; count: number }[] {
    const since = Date.now() - windowMs;
    const recent = this.history.filter((e) => e.timestamp >= since);
    const counts = new Map<CivilizationEventType, number>();
    for (const e of recent) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    return [...counts.entries()]
      .filter(([, count]) => count >= threshold)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** Summary stats for telemetry / dashboard. */
  summary(): {
    total: number;
    byType: Record<string, number>;
    bySignificance: Record<string, number>;
    oldestAt: number | null;
    newestAt: number | null;
  } {
    const byType: Record<string, number> = {};
    const bySignificance: Record<string, number> = {};
    for (const e of this.history) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
      bySignificance[e.significance] = (bySignificance[e.significance] ?? 0) + 1;
    }
    return {
      total: this.history.length,
      byType,
      bySignificance,
      oldestAt: this.history[0]?.timestamp ?? null,
      newestAt: this.history.at(-1)?.timestamp ?? null,
    };
  }

  get size(): number {
    return this.history.length;
  }
}
