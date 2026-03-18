import assert from "node:assert/strict";
import test from "node:test";

import {
  assertChainAllowed,
  evaluateInvariants,
  mergeRuntimeContainerStates,
  runtimeInspectionWarningsToViolations,
} from "../guards/invariants.ts";

/** Canonical GhostChain L1/L2/L3 chain allowlist used in test fixtures. */
const CANONICAL_CHAINS = {
  allowlist: [
    { chainId: 14000101, name: "GhostChain" as const, layer: "l1" as const },
    { chainId: 901,      name: "GhostL2"    as const, layer: "l2" as const },
    { chainId: 903,      name: "GhostL3"    as const, layer: "l3" as const },
  ],
};

test("passes when routes stay within GhostChain rules and governance is non-mainnet", () => {
  const result = evaluateInvariants({
    routes: [
      { from: "l2", to: "l1", integration: "ghostchain-core-bridge", via: "direct" },
      { from: "l3", to: "l2", integration: "ghostl2-gateway", via: "l2" },
      { from: "l3", to: "l1", integration: "ghostchain-settlement", via: "l2" },
    ],
    containers: [
      {
        name: "ghostcontrol-api",
        user: "1001:1001",
        privileged: false,
        healthcheck: true,
      },
    ],
    governance: {
      target: "devnet",
      proposalApproved: false,
      constitutionalGateEnabled: true,
    },
    chains: CANONICAL_CHAINS,
  });

  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
});

test("blocks direct L2/L3 external routes", () => {
  const result = evaluateInvariants({
    routes: [
      { from: "l2", to: "external", integration: "external-bridge", via: "direct" },
      { from: "l3", to: "external", integration: "external-bridge", via: "direct" },
    ],
    containers: [],
    governance: {
      target: "devnet",
      proposalApproved: false,
      constitutionalGateEnabled: true,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.violations.some(
      (violation) => violation.code === "L2_DIRECT_EXTERNAL_BRIDGE_BLOCKED",
    ),
    true,
  );
  assert.equal(
    result.violations.some(
      (violation) => violation.code === "L3_DIRECT_EXTERNAL_BRIDGE_BLOCKED",
    ),
    true,
  );
});

test("requires governance approval for mainnet-affecting changes", () => {
  const result = evaluateInvariants({
    routes: [],
    containers: [],
    governance: {
      target: "mainnet",
      proposalApproved: false,
      constitutionalGateEnabled: false,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.violations.some(
      (violation) => violation.code === "MAINNET_GOVERNANCE_APPROVAL_REQUIRED",
    ),
    true,
  );
});

test("runtime container state overrides static container policy inputs", () => {
  const merged = mergeRuntimeContainerStates(
    [
      {
        name: "ghostcontrol-api",
        user: "1001:1001",
        privileged: false,
        healthcheck: true,
        readOnlyRootFs: true,
      },
    ],
    [
      {
        name: "ghostcontrol-api",
        user: "0:0",
        privileged: true,
        healthcheck: false,
        readOnlyRootFs: false,
      },
    ],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.user, "0:0");
  assert.equal(merged[0]?.privileged, true);
  assert.equal(merged[0]?.healthcheck, false);
  assert.equal(merged[0]?.readOnlyRootFs, false);
});

test("runtime inspection warnings map to invariant violations", () => {
  const violations = runtimeInspectionWarningsToViolations([
    "service=ghostcontrol-api: lookup failed (docker_socket_permission_denied)",
  ]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.code, "CONTAINER_RUNTIME_INSPECTION_DEGRADED");
  assert.equal(violations[0]?.severity, "high");
});

test("blocks unknown chain IDs via CHAIN_NOT_IN_MAINCHAIN_ALLOWLIST", () => {
  const result = evaluateInvariants({
    routes: [],
    containers: [],
    governance: { target: "devnet", proposalApproved: false, constitutionalGateEnabled: true },
    chains: {
      allowlist: [
        { chainId: 1,   name: "GhostChain" as const, layer: "l1" as const }, // legacy external mainnet sentinel — NOT allowed
        { chainId: 137, name: "GhostL2"    as const, layer: "l2" as const }, // Polygon — NOT allowed
      ],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.violations.some((v) => v.code === "CHAIN_NOT_IN_MAINCHAIN_ALLOWLIST"),
    true,
  );
});

test("requires all three canonical GhostChain mainchains to be declared", () => {
  // Only L1 declared — L2 and L3 missing
  const result = evaluateInvariants({
    routes: [],
    containers: [],
    governance: { target: "devnet", proposalApproved: false, constitutionalGateEnabled: true },
    chains: {
      allowlist: [
        { chainId: 14000101, name: "GhostChain" as const, layer: "l1" as const },
      ],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.violations.filter((v) => v.code === "MAINCHAIN_CHAIN_UNDECLARED").length,
    2, // GhostL2 and GhostL3 both missing
  );
});

test("assertChainAllowed accepts the three canonical mainchain IDs", () => {
  assert.equal(assertChainAllowed(14000101).name, "GhostChain");
  assert.equal(assertChainAllowed(901).name, "GhostL2");
  assert.equal(assertChainAllowed(903).name, "GhostL3");
});

test("assertChainAllowed throws for non-GhostChain IDs", () => {
  assert.throws(() => assertChainAllowed(1),   /invariant_chain_blocked:1/);
  assert.throws(() => assertChainAllowed(137), /invariant_chain_blocked:137/);
});
