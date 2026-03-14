/**
 * ExperimentEngine — runs A/B experiments against Ghost parameters.
 */
export interface Experiment {
  id:          string;
  name:        string;
  description: string;
  control:     Record<string, unknown>;
  variant:     Record<string, unknown>;
  status:      "pending" | "running" | "completed" | "aborted";
  startedAt?:  number;
  result?:     ExperimentResult;
}

export interface ExperimentResult {
  winner:      "control" | "variant" | "inconclusive";
  improvement: number;  // percentage
  confidence:  number;  // 0–1
}

export class ExperimentEngine {
  private experiments: Map<string, Experiment> = new Map();

  register(exp: Omit<Experiment, "status">): Experiment {
    const entry: Experiment = { ...exp, status: "pending" };
    this.experiments.set(entry.id, entry);
    console.log(`[ExperimentEngine] Registered experiment: ${entry.name}`);
    return entry;
  }

  start(id: string): void {
    const exp = this.get(id);
    exp.status    = "running";
    exp.startedAt = Date.now();
    console.log(`[ExperimentEngine] Started: ${exp.name}`);
  }

  complete(id: string, result: ExperimentResult): void {
    const exp  = this.get(id);
    exp.status = "completed";
    exp.result = result;
    console.log(
      `[ExperimentEngine] Completed: ${exp.name} — winner: ${result.winner}, ` +
      `improvement: ${result.improvement.toFixed(2)} %, confidence: ${(result.confidence * 100).toFixed(1)} %`
    );
  }

  abort(id: string, reason: string): void {
    const exp  = this.get(id);
    exp.status = "aborted";
    console.warn(`[ExperimentEngine] Aborted ${exp.name}: ${reason}`);
  }

  list(status?: Experiment["status"]): Experiment[] {
    const all = [...this.experiments.values()];
    return status ? all.filter(e => e.status === status) : all;
  }

  private get(id: string): Experiment {
    const exp = this.experiments.get(id);
    if (!exp) throw new Error(`Experiment '${id}' not found`);
    return exp;
  }
}
