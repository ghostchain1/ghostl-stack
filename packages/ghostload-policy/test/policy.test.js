import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPolicy, validatePolicy, enforceRoutingLaw, validateDecision } from "../index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const policy = loadPolicy(path.join(__dirname, "..", "default-policy.json"));

test("default policy validates", () => {
  const result = validatePolicy(policy);
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test("routing law rejects L3 to L1 direct", () => {
  const result = enforceRoutingLaw(
    {
      actions: [{ kind: "route", from: "L3", to: "L1" }],
      externalSettlementLayer: "L1"
    },
    policy
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" | "), /L3->L1 direct route forbidden/);
});

test("decision validation enforces fee bands and cooldown", () => {
  const now = Date.now();
  const result = validateDecision(
    {
      actions: [
        { kind: "fee", layer: "L1", valueGwei: 50, deltaBps: 5000 },
        { kind: "route", from: "L3", to: "L2" }
      ]
    },
    policy,
    {
      now,
      lastAppliedAt: { L1: now - 5_000 },
      metrics: { feeVolatilityPct: 2, retryRatePct: 1, utilizationPct: 40 }
    }
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" | "), /out of hard band/);
});
