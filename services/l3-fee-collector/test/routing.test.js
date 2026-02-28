import test from "node:test";
import assert from "node:assert/strict";

import {
  assertEvmAddress,
  assertL3ToL2Route,
  normalizeFeeSource,
  toWeiString
} from "../src/routing.js";

test("normalizes valid fee source", () => {
  assert.equal(normalizeFeeSource("GAS"), "gas");
  assert.equal(normalizeFeeSource("deployment"), "deployment");
});

test("rejects invalid fee source", () => {
  assert.throws(() => normalizeFeeSource("bridge"), /invalid_fee_source/);
});

test("validates l3 to l2 route", () => {
  const result = assertL3ToL2Route({
    destinationLayer: "L2",
    destinationChainId: 901,
    destinationBridgeAddress: "0x0000000000000000000000000000000000000901",
    expectedL2ChainId: 901,
    expectedBridgeAddress: "0x0000000000000000000000000000000000000901"
  });
  assert.equal(result.layer, "L2");
  assert.equal(result.chainId, 901);
});

test("blocks L3 bypass to L1", () => {
  assert.throws(
    () =>
      assertL3ToL2Route({
        destinationLayer: "L1",
        destinationChainId: 14000101,
        destinationBridgeAddress: "0x0000000000000000000000000000000000000901",
        expectedL2ChainId: 901,
        expectedBridgeAddress: "0x0000000000000000000000000000000000000901"
      }),
    /routing_violation_l3_must_route_to_l2/
  );
});

test("validates bridge address format", () => {
  assert.equal(
    assertEvmAddress("0x0000000000000000000000000000000000000901", "bridge"),
    "0x0000000000000000000000000000000000000901"
  );
  assert.throws(() => assertEvmAddress("bridge", "bridge"), /bridge_must_be_0x_address/);
});

test("enforces positive wei amounts", () => {
  assert.equal(toWeiString("1"), "1");
  assert.throws(() => toWeiString("0"), /amount_must_be_positive/);
});
