import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDecision, fallbackDecision, loadValidatedPolicy } from "../src/control.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const policy = loadValidatedPolicy(path.join(__dirname, "..", "..", "..", "packages", "ghostload-policy", "default-policy.json"));

test("decision builder keeps routing law edges", () => {
  const result = buildDecision(
    {
      layers: { L1: { gasGwei: 1.2 }, L2: { gasGwei: 0.002 }, L3: { gasGwei: 0.002 } },
      global: { feeVolatilityPct: 2.1, retryRatePct: 0.8, utilizationPct: 44, backlogDepth: 8 }
    },
    policy,
    { mode: "stability-first", lastAppliedAt: {} }
  );
  assert.equal(result.decision.externalSettlementLayer, "L1");
  const edges = result.decision.actions.filter((a) => a.kind === "route").map((a) => `${a.from}->${a.to}`);
  assert.deepEqual(edges, ["L3->L2", "L2->L1"]);
  assert.equal(result.guard.ok, true);
});

test("fallback decision is deterministic-safe", () => {
  const safe = fallbackDecision(policy, "kill-switch");
  assert.equal(safe.mode, "lockdown");
  assert.equal(safe.externalSettlementLayer, "L1");
  assert.equal(safe.actions.filter((a) => a.kind === "route").length, 2);
});
