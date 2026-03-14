import test from "node:test";
import assert from "node:assert/strict";
import { buildRankedStrategies } from "../src/ranking.js";

const baseInput = {
  treasury: {
    totalValueWei: "100000000000000000000",
    deployedCapitalWei: "25000000000000000000",
    availableWei: "75000000000000000000",
    riskExposureBps: 3200
  },
  volatilityBand: "medium",
  riskCapBps: 7200,
  maxProtocolConcentrationBps: 4500,
  policyVersion: "federation-v1"
};

test("ranking is deterministic for identical input", () => {
  const first = buildRankedStrategies(baseInput);
  const second = buildRankedStrategies(baseInput);
  assert.deepEqual(first, second);
});

test("low risk cap flags violations", () => {
  const ranked = buildRankedStrategies({
    ...baseInput,
    riskCapBps: 1200
  });
  const violations = ranked.strategies.flatMap((strategy) => strategy.policyViolations);
  assert.ok(violations.includes("risk_cap_exceeded"));
});
