import test from "node:test";
import assert from "node:assert/strict";
import { enforceRoutingLaw, loadPolicy } from "../../../packages/ghostload-policy/index.js";

const policy = loadPolicy(new URL("../../../packages/ghostload-policy/default-policy.json", import.meta.url));

test("routing law allows only L3->L2 and L2->L1", () => {
  const good = enforceRoutingLaw(
    {
      actions: [
        { kind: "route", from: "L3", to: "L2" },
        { kind: "route", from: "L2", to: "L1" }
      ],
      externalSettlementLayer: "L1"
    },
    policy
  );
  assert.equal(good.ok, true);

  const bad = enforceRoutingLaw(
    {
      actions: [{ kind: "route", from: "L2", to: "EXTERNAL" }],
      externalSettlementLayer: "L1"
    },
    policy
  );
  assert.equal(bad.ok, false);
});
