import assert from "node:assert/strict";
import test from "node:test";

import { preflightChecks } from "../orchestrator/ghostloop.ts";

test("vault preflight check uses cli/http fallback and remains optional", () => {
  const checks = preflightChecks([]);
  const vault = checks.find((check) => check.name === "vault_health");

  assert.ok(vault);
  assert.equal(vault?.required, false);
  assert.match(vault?.command ?? "", /command -v vault/);
  assert.match(vault?.command ?? "", /v1\/sys\/health/);
  assert.match(vault?.command ?? "", /vault_cli_and_http_unavailable/);
});

test("rpc chain-id checks are required and enforce GhostChain defaults", () => {
  const checks = preflightChecks([]);
  const l1 = checks.find((check) => check.name === "rpc_l1_chain_id");
  const l2 = checks.find((check) => check.name === "rpc_l2_chain_id");
  const l3 = checks.find((check) => check.name === "rpc_l3_chain_id");

  assert.ok(l1);
  assert.equal(l1?.required, true);
  assert.match(l1?.command ?? "", /L1_RPC/);
  assert.match(l1?.command ?? "", /RPC_L1/);
  assert.match(l1?.command ?? "", /L1_CHAIN_ID/);
  assert.match(l1?.command ?? "", /14000101/);
  assert.match(l1?.command ?? "", /eth_chainId/);

  assert.ok(l2);
  assert.equal(l2?.required, true);
  assert.match(l2?.command ?? "", /L2_RPC/);
  assert.match(l2?.command ?? "", /RPC_L2/);
  assert.match(l2?.command ?? "", /L2_CHAIN_ID/);
  assert.match(l2?.command ?? "", /901/);

  assert.ok(l3);
  assert.equal(l3?.required, true);
  assert.match(l3?.command ?? "", /L3_RPC/);
  assert.match(l3?.command ?? "", /RPC_L3/);
  assert.match(l3?.command ?? "", /L3_CHAIN_ID/);
  assert.match(l3?.command ?? "", /903/);
});

test("mainnet governance proposal gate is required only for MAINNET mode", () => {
  const mainnetChecks = preflightChecks([], "MAINNET");
  const devnetChecks = preflightChecks([], "DEVNET");
  const mainnetGate = mainnetChecks.find((check) => check.name === "governance_mainnet_proposal_gate");
  const devnetGate = devnetChecks.find((check) => check.name === "governance_mainnet_proposal_gate");

  assert.ok(mainnetGate);
  assert.equal(mainnetGate?.required, true);
  assert.match(mainnetGate?.command ?? "", /GOVERNANCE_PROPOSAL_ID/);
  assert.match(mainnetGate?.command ?? "", /GOVERNANCE_GATE_FILE/);
  assert.match(mainnetGate?.command ?? "", /allowDeploy/);

  assert.ok(devnetGate);
  assert.equal(devnetGate?.required, false);
});
