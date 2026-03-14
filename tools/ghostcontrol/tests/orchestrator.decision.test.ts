import assert from "node:assert/strict";
import test from "node:test";

import { decideCheckpoint } from "../orchestrator/ghostloop.ts";

test("decideCheckpoint advances when required checks pass and there are no open incidents", () => {
  const decision = decideCheckpoint({
    preflight: [{ name: "docker_daemon", ok: true, required: true }],
    invariants: { ok: true, violations: [] },
    openIncidentCount: 0,
    selectedCandidateFound: false,
  });

  assert.equal(decision, "ADVANCE");
});

test("decideCheckpoint holds when required preflight fails", () => {
  const decision = decideCheckpoint({
    preflight: [{ name: "docker_daemon", ok: false, required: true }],
    invariants: { ok: true, violations: [] },
    openIncidentCount: 0,
    selectedCandidateFound: false,
  });

  assert.equal(decision, "HOLD");
});

test("decideCheckpoint holds on critical invariant violation", () => {
  const decision = decideCheckpoint({
    preflight: [{ name: "docker_daemon", ok: true, required: true }],
    invariants: {
      ok: false,
      violations: [
        {
          code: "L2_DIRECT_EXTERNAL_BRIDGE_BLOCKED",
          severity: "critical",
          message: "blocked",
        },
      ],
    },
    openIncidentCount: 0,
    selectedCandidateFound: false,
  });

  assert.equal(decision, "HOLD");
});

test("decideCheckpoint holds when incidents exist but no candidate is selected", () => {
  const decision = decideCheckpoint({
    preflight: [{ name: "docker_daemon", ok: true, required: true }],
    invariants: { ok: true, violations: [] },
    openIncidentCount: 2,
    selectedCandidateFound: false,
  });

  assert.equal(decision, "HOLD");
});

