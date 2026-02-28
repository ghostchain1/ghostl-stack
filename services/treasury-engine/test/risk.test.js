import test from "node:test";
import assert from "node:assert/strict";

import { deterministicRiskScore, simulateAllocation } from "../src/risk.js";

test("deterministic risk score is stable", () => {
  const input = { amount: "100", strategy: "balanced" };
  const first = deterministicRiskScore(input);
  const second = deterministicRiskScore(input);
  assert.equal(first, second);
  assert.ok(first >= 0 && first < 10000);
});

test("allocation simulation splits principal", () => {
  const simulation = simulateAllocation({
    principalWei: "1000",
    stableAssetRatio: 70,
    yieldRatio: 30,
    riskCapBps: 7500,
    strategy: "balanced"
  });

  assert.equal(simulation.principalWei, "1000");
  assert.equal(BigInt(simulation.split.stableAssetWei) + BigInt(simulation.split.yieldAssetWei), 1000n);
  assert.ok(simulation.expectedApyBps >= 50);
});

test("simulation rejects non-positive principal", () => {
  assert.throws(
    () =>
      simulateAllocation({
        principalWei: "0",
        stableAssetRatio: 50,
        yieldRatio: 50,
        riskCapBps: 7000
      }),
    /principal_must_be_positive/
  );
});
