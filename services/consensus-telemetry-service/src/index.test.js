import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CONSENSUS_TELEMETRY_NO_SERVER = "1";
const { __test } = await import("./index.js");

test("computeOracleIncidents flags stale and lag", () => {
  const snapshot = {
    configured: true,
    latestBlockNumber: 100,
    latestOutputIndex: 10,
    nextOutputIndex: 11,
    outputRoot: "0x1111111111111111111111111111111111111111111111111111111111111111",
    outputTimestamp: 1000,
    outputBlockNumber: 100
  };
  const incidents = __test.computeOracleIncidents({
    snapshot,
    headNumber: 300,
    headTimestamp: 2000,
    maxBlockDrift: 50,
    maxAgeSec: 100
  });
  assert.equal(incidents.oracle_lag, true);
  assert.equal(incidents.oracle_stale, true);
});

test("computeOracleIncidents flags Phase5 oracle wiring issues", () => {
  const snapshot = {
    configured: true,
    addressInvalid: true,
    zeroAddress: true,
    parentChainMismatch: true,
    contractCodeMissing: true,
    versionError: "missing function selector",
    versionEmpty: true,
    error: "oracle_contract_not_deployed"
  };
  const incidents = __test.computeOracleIncidents({
    snapshot,
    headNumber: null,
    headTimestamp: null,
    maxBlockDrift: 50,
    maxAgeSec: 100
  });
  assert.equal(incidents.oracle_address_invalid, true);
  assert.equal(incidents.oracle_zero_address, true);
  assert.equal(incidents.oracle_wrong_parent_chain, true);
  assert.equal(incidents.oracle_not_deployed, true);
  assert.equal(incidents.oracle_abi_mismatch, true);
  assert.equal(incidents.oracle_version_empty, true);
  assert.equal(incidents.oracle_error, true);
});

test("buildBridgeKey is deterministic", () => {
  const key1 = __test.buildBridgeKey(
    ["address", "address", "uint256", "uint256"],
    [
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002",
      10n,
      1n
    ]
  );
  const key2 = __test.buildBridgeKey(
    ["address", "address", "uint256", "uint256"],
    [
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002",
      10n,
      1n
    ]
  );
  assert.equal(key1, key2);
});
