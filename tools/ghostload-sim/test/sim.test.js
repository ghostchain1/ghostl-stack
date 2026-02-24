import test from "node:test";
import assert from "node:assert/strict";
import { loadScenario, runSimulation } from "../src/sim.js";

for (const scenarioName of [
  "l1-fee-spike",
  "l2-sequencer-slowdown",
  "l3-demand-surge",
  "spam-attack",
  "bridge-burst"
]) {
  test(`simulation acceptance: ${scenarioName}`, () => {
    const scenario = loadScenario(scenarioName);
    const result = runSimulation({ scenario });
    assert.equal(result.acceptance.allPassed, true, `${scenarioName} failed acceptance`);
  });
}
