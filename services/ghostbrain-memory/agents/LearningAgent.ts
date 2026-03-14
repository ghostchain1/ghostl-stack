/**
 * LearningAgent — adjusts GhostBrain strategies based on historical outcomes.
 */
import { MemoryEvent } from "../src/MemoryEngine";

export class LearningAgent {
  learn(events: MemoryEvent[]): Record<string, number> {
    const successRates: Record<string, number> = {};

    const byType: Record<string, MemoryEvent[]> = {};
    for (const e of events) {
      (byType[e.type] ??= []).push(e);
    }

    for (const [type, evts] of Object.entries(byType)) {
      const successes = evts.filter(e => e.outcome === "success").length;
      successRates[type] = successes / evts.length;
    }

    console.log(`[LearningAgent] Learned from ${events.length} events:`, successRates);
    return successRates;
  }
}
