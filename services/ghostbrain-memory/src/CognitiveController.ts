/**
 * CognitiveController — central GhostBrain cognitive coordinator.
 * Integrates Memory, Decision, Simulation, and Learning layers.
 */
import { MemoryEngine }      from "./MemoryEngine";
import { EventStore }        from "./EventStore";
import { KnowledgeGraph }    from "./KnowledgeGraph";
import { DecisionEngine }    from "./DecisionEngine";
import { StrategySimulator } from "./StrategySimulator";
import { MemoryAgent }       from "../agents/MemoryAgent";
import { LearningAgent }     from "../agents/LearningAgent";
import { PredictionAgent }   from "../agents/PredictionAgent";

export class CognitiveController {
  private memory    = new MemoryEngine();
  private events    = new EventStore();
  private knowledge = new KnowledgeGraph();
  private decision  = new DecisionEngine();
  private simulator = new StrategySimulator();
  private memAgent  = new MemoryAgent();
  private learner   = new LearningAgent();
  private predictor = new PredictionAgent();

  constructor() {
    this.knowledge.initGhostTopology();
  }

  process(event: { type: string; data?: Record<string, unknown>; source?: string }): {
    decision: ReturnType<DecisionEngine["decide"]>;
    simulation: ReturnType<StrategySimulator["simulate"]>;
    safe: boolean;
  } {
    // Store in persistent memory
    const memEntry = this.memory.store({
      type:    event.type,
      payload: event.data ?? {},
      source:  event.source ?? "system",
    });

    // Add to real-time event store
    this.events.add({
      type:     event.type,
      source:   event.source ?? "system",
      severity: "info",
      data:     event.data ?? {},
    });

    // Decide
    const decision = this.decision.decide({ type: event.type, data: event.data });

    // Simulate before acting
    const simulation = this.simulator.simulate(decision.action);

    // Learn from recent history
    this.learner.learn(this.memory.recent(200));

    // Predict cascade risks
    const predictions = this.predictor.predict(this.events.getRecent(50));
    if (predictions.length > 0) {
      predictions.forEach(p => console.warn(`[GhostBrain] Prediction: ${p.type} (confidence: ${p.confidence.toFixed(2)}) — ${p.message}`));
    }

    const safe = simulation.safe && decision.risk !== "HIGH";

    console.log(`[GhostBrain] Event: ${event.type} → Action: ${decision.action} (safe: ${safe})`);

    // Record outcome in memory agent
    this.memAgent.store(event.type, { decision: decision.action, simulation }, safe ? "success" : "blocked");

    return { decision, simulation, safe };
  }
}
