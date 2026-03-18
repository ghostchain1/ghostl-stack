/**
 * ghostbrain-simulator — HTTP Server Entry Point
 * ================================================
 * Wraps the SimulationController classes with an Express REST API so that
 * the ghost-promotion-engine (and GhostBrain Core) can trigger and monitor
 * simulation runs.
 *
 * Endpoints:
 *   GET  /health                — liveness / readiness
 *   GET  /status                — current simulation run status
 *   POST /simulate/all          — run all scenarios and return aggregate score
 *   POST /simulate/:scenario    — run a single named scenario
 *   GET  /results/latest        — latest completed run results
 *
 * Env vars:
 *   SIMULATOR_PORT              HTTP port (default: 7960)
 *   GHOSTBRAIN_URL              GhostBrain Core for result forwarding (default: http://localhost:7900)
 *   DRY_RUN                     "1" = run but don't forward results (default: 0)
 */

import http    from "http";
import path    from "path";
import express from "express";
import type { Request, Response } from "express";

import { SimulationController } from "./SimulationController";

const PORT          = Number(process.env.SIMULATOR_PORT ?? "7960");
const GHOSTBRAIN_URL = (process.env.GHOSTBRAIN_URL ?? "http://localhost:7900").replace(/\/$/, "");
const DRY_RUN       = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

// Canonical scenario names (must match files in scenarios/)
const ALL_SCENARIOS = ["node_failure", "validator_attack", "gas_spike", "liquidity_crash"];

// ── State ─────────────────────────────────────────────────────────────────────
interface RunStatus {
  done:       boolean;
  running:    boolean;
  score:      number;
  passed:     boolean;
  summary:    string;
  startedAt:  string | null;
  finishedAt: string | null;
  results:    Record<string, unknown>;
  gitHash:    string;
}

let currentRun: RunStatus = {
  done:       false,
  running:    false,
  score:      0,
  passed:     false,
  summary:    "No simulation run yet",
  startedAt:  null,
  finishedAt: null,
  results:    {},
  gitHash:    "",
};

function buildMetrics(): string {
  return [
    "# HELP ghostbrain_simulator_running Whether a simulation run is currently active.",
    "# TYPE ghostbrain_simulator_running gauge",
    `ghostbrain_simulator_running ${currentRun.running ? 1 : 0}`,
    "# HELP ghostbrain_simulator_done Whether the latest simulation run completed.",
    "# TYPE ghostbrain_simulator_done gauge",
    `ghostbrain_simulator_done ${currentRun.done ? 1 : 0}`,
    "# HELP ghostbrain_simulator_passed Whether the latest simulation run passed.",
    "# TYPE ghostbrain_simulator_passed gauge",
    `ghostbrain_simulator_passed ${currentRun.passed ? 1 : 0}`,
    "# HELP ghostbrain_simulator_score Latest simulation score.",
    "# TYPE ghostbrain_simulator_score gauge",
    `ghostbrain_simulator_score ${currentRun.score}`,
  ].join("\n") + "\n";
}

// ── Score computation ─────────────────────────────────────────────────────────
function computeScore(results: Record<string, Record<string, unknown>>): number {
  let total = 0;
  let weight = 0;

  for (const [, result] of Object.entries(results)) {
    const risk = (result.riskReport as { riskLevel?: string } | undefined)?.riskLevel ?? "HIGH";
    const scenarioScore =
      risk === "LOW"      ? 100 :
      risk === "MEDIUM"   ?  75 :
      risk === "HIGH"     ?  40 :
      /* CRITICAL */          0;
    total  += scenarioScore;
    weight += 1;
  }

  return weight > 0 ? Math.round(total / weight) : 0;
}

// ── Simulation runner ─────────────────────────────────────────────────────────
async function runAllSimulations(gitHash: string): Promise<void> {
  if (currentRun.running) return;

  const ctrl = new SimulationController();
  const results: Record<string, unknown> = {};

  currentRun = {
    done:       false,
    running:    true,
    score:      0,
    passed:     false,
    summary:    "Running...",
    startedAt:  new Date().toISOString(),
    finishedAt: null,
    results:    {},
    gitHash,
  };

  console.log(`[ghostbrain-simulator] Starting full simulation suite for ${gitHash}`);

  for (const name of ALL_SCENARIOS) {
    try {
      const scenario = ctrl.loadScenario(name);
      const result   = await ctrl.runScenario(scenario);
      results[name]  = result;
      console.log(`[ghostbrain-simulator] Scenario '${name}' complete`);
    } catch (err) {
      results[name] = { error: err instanceof Error ? err.message : String(err) };
      console.warn(`[ghostbrain-simulator] Scenario '${name}' failed:`, err);
    }
  }

  const score  = computeScore(results as Record<string, Record<string, unknown>>);
  const passed = score >= 80;

  currentRun = {
    done:       true,
    running:    false,
    score,
    passed,
    summary:    `Score: ${score}/100 — ${passed ? "PASSED" : "FAILED"} (${ALL_SCENARIOS.length} scenarios)`,
    startedAt:  currentRun.startedAt,
    finishedAt: new Date().toISOString(),
    results,
    gitHash,
  };

  console.log(`[ghostbrain-simulator] Simulation complete — score=${score} passed=${passed}`);

  // Forward results to GhostBrain Core
  if (!DRY_RUN) {
    try {
      await fetch(`${GHOSTBRAIN_URL}/simulation/results`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...currentRun, source: "ghostbrain-simulator" }),
        signal:  AbortSignal.timeout(10_000),
      });
    } catch {
      console.warn("[ghostbrain-simulator] GhostBrain unreachable — result stored locally only");
    }
  }
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "ghostbrain-simulator" });
});

app.get("/status", (_req: Request, res: Response) => {
  res.json({ service: "ghostbrain-simulator", ...currentRun, dryRun: DRY_RUN });
});

app.get("/metrics", (_req: Request, res: Response) => {
  res.type("text/plain").send(buildMetrics());
});

app.get("/results/latest", (_req: Request, res: Response) => {
  res.json(currentRun);
});

app.post("/simulate/all", (req: Request, res: Response) => {
  const { gitHash } = req.body as { gitHash?: string };
  const hash = gitHash ?? "unknown";

  if (currentRun.running) {
    res.status(409).json({ error: "Simulation already running", gitHash: currentRun.gitHash });
    return;
  }

  runAllSimulations(hash).catch(console.error);
  res.json({ ok: true, message: "Simulation started", gitHash: hash });
});

app.post("/simulate/:scenario", async (req: Request<{ scenario: string }>, res: Response) => {
  const name = req.params.scenario;
  const ctrl = new SimulationController();

  try {
    const scenario = ctrl.loadScenario(name);
    const result   = await ctrl.runScenario(scenario);
    res.json({ ok: true, scenario: name, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg, scenario: name });
  }
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[ghostbrain-simulator] HTTP API listening on :${PORT} (dryRun=${DRY_RUN})`);
});

process.on("SIGTERM", () => { server.close(); process.exit(0); });
process.on("SIGINT",  () => { server.close(); process.exit(0); });
