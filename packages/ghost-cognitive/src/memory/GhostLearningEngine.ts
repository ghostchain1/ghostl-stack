import { GhostMemoryStore } from './GhostMemoryStore.js';
import { GhostKnowledgeGraph } from './GhostKnowledgeGraph.js';

export interface LearningEvent {
  type: string;
  outcome: 'success' | 'failure' | 'neutral';
  context: Record<string, unknown>;
}

export interface LearningInsight {
  pattern: string;
  confidence: number;
  occurrences: number;
  lastSeen: number;
}

/**
 * GhostLearningEngine — correlates outcomes with prior events to build actionable
 * insights over time.
 *
 * Patterns are detected by grouping events with identical (type, outcome) pairs and
 * tracking recurrence counts. The knowledge graph is updated when a pattern exceeds
 * the confidence threshold.
 */
export class GhostLearningEngine {
  private readonly memory: GhostMemoryStore;
  private readonly graph: GhostKnowledgeGraph;
  private readonly patterns = new Map<string, LearningInsight>();
  private readonly confidenceThreshold: number;

  constructor(
    memory: GhostMemoryStore,
    graph: GhostKnowledgeGraph,
    opts: { confidenceThreshold?: number } = {},
  ) {
    this.memory = memory;
    this.graph = graph;
    this.confidenceThreshold = opts.confidenceThreshold ?? 0.7;
  }

  learn(event: LearningEvent): void {
    this.memory.store('learning-event', event, [event.type, event.outcome]);

    const key = `${event.type}:${event.outcome}`;
    const existing = this.patterns.get(key);

    if (existing) {
      existing.occurrences += 1;
      existing.lastSeen = Date.now();
      // Bayesian-ish confidence bump: approaches 1 asymptotically
      existing.confidence = Math.min(0.99, existing.confidence + (1 - existing.confidence) * 0.1);
    } else {
      this.patterns.set(key, {
        pattern: key,
        confidence: 0.5,
        occurrences: 1,
        lastSeen: Date.now(),
      });
    }

    // Promote high-confidence patterns into the knowledge graph
    const insight = this.patterns.get(key)!;
    if (insight.confidence >= this.confidenceThreshold) {
      this.graph.link(event.type, event.outcome, {
        relation: 'tends_to_produce',
        weight: insight.confidence,
      });
    }
  }

  insights(): LearningInsight[] {
    return [...this.patterns.values()].sort((a, b) => b.confidence - a.confidence);
  }

  topInsights(n = 10): LearningInsight[] {
    return this.insights().slice(0, n);
  }
}
