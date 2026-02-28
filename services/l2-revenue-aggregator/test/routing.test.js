import test from "node:test";
import assert from "node:assert/strict";

import {
  assertInboundRoute,
  assertOutboundRoute,
  normalizeFeeType,
  toWeiString
} from "../src/routing.js";

const IDS = { l1: 14000101, l2: 901, l3: 903 };

test("accepts L3 -> L2 inbound route", () => {
  const route = assertInboundRoute(
    {
      sourceLayer: "L3",
      sourceChainId: 903,
      targetLayer: "L2",
      targetChainId: 901
    },
    IDS
  );
  assert.equal(route.sourceLayer, "L3");
  assert.equal(route.targetLayer, "L2");
});

test("blocks L3 -> L1 bypass", () => {
  assert.throws(
    () =>
      assertInboundRoute(
        {
          sourceLayer: "L3",
          sourceChainId: 903,
          targetLayer: "L1",
          targetChainId: 14000101
        },
        IDS
      ),
    /routing_violation_l3_must_pass_through_l2/
  );
});

test("blocks L2 external destination", () => {
  assert.throws(
    () =>
      assertInboundRoute(
        {
          sourceLayer: "L2",
          sourceChainId: 901,
          targetLayer: "EXTERNAL",
          targetChainId: 137
        },
        IDS
      ),
    /routing_violation_l2_must_target_l1/
  );
});

test("outbound route must target L1", () => {
  assert.doesNotThrow(() => assertOutboundRoute(14000101, 14000101));
  assert.throws(() => assertOutboundRoute(137, 14000101), /routing_violation_l2_outbound_must_be_l1/);
});

test("fee type and wei validators", () => {
  assert.equal(normalizeFeeType("trading"), "trading");
  assert.throws(() => normalizeFeeType("mining"), /invalid_fee_type/);
  assert.equal(toWeiString("10"), "10");
  assert.throws(() => toWeiString("0"), /amount_must_be_positive/);
});
