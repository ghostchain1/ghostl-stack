import { ExperimentEngine, ExperimentResult } from "../src/ExperimentEngine";
import { EvolutionGovernor }                  from "../src/EvolutionGovernor";

const engine   = new ExperimentEngine();
const governor = new EvolutionGovernor({ minConfidence: 0.85 });

export const ExperimentAgent = {
  name: "ExperimentAgent",
  description: "Manages A/B experiments for Ghost parameter optimisation",

  async react(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    switch (event.type) {
      case "experiment_register": {
        engine.register(event.payload as Parameters<ExperimentEngine["register"]>[0]);
        break;
      }
      case "experiment_start": {
        engine.start(event.payload.id as string);
        break;
      }
      case "experiment_result": {
        const { id, result } = event.payload as { id: string; result: ExperimentResult };
        engine.complete(id, result);
        const exp = engine.list("completed").find(e => e.id === id);
        if (exp) governor.approveExperiment(exp, result);
        break;
      }
      case "experiment_abort": {
        engine.abort(event.payload.id as string, event.payload.reason as string);
        break;
      }
      default:
        break;
    }
  },
};
