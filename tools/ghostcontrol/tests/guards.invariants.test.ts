import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateInvariants,
  mergeRuntimeContainerStates,
  runtimeInspectionWarningsToViolations,
} from "../guards/invariants.ts";

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
