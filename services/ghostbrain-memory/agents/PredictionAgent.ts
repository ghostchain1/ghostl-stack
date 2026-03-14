/**
 * PredictionAgent — predicts imminent failures from historical event patterns.
 */
import { GhostSystemEvent } from "../src/EventStore";

export interface Prediction {
  type:       string;
  confidence: number;  // 0-1
  message:    string;
}

export class PredictionAgent {
  predict(events: GhostSystemEvent[]): Prediction[] {
    const predictions: Prediction[] = [];

    // Node failure prediction: 5+ node errors in recent window
    const nodeErrors = events.filter(e => e.type === "node_error").length;
    if (nodeErrors >= 5) {
      predictions.push({
        type:       "node_failure_imminent",
        confidence: Math.min(nodeErrors / 10, 0.95),
        message:    `${nodeErrors} node errors detected — failure likely within 10 minutes`,
      });
    }

    // Gas spike prediction: trending gas events
    const gasEvents = events.filter(e => e.type === "gas_spike").length;
    if (gasEvents >= 3) {
      predictions.push({
        type:       "gas_storm_incoming",
        confidence: Math.min(gasEvents / 8, 0.8),
        message:    "Gas spikes clustering — fee surge predicted",
      });
    }

    // Validator risk
    const validatorWarnings = events.filter(e => e.type === "validator_warning").length;
    if (validatorWarnings >= 3) {
      predictions.push({
        type:       "validator_instability",
        confidence: Math.min(validatorWarnings / 6, 0.85),
        message:    "Multiple validator warnings — potential consensus instability",
      });
    }

    return predictions;
  }
}
