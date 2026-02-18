import assert from "node:assert/strict";
import test from "node:test";

import { candidateFitsRiskBudget, rankPatches, scorePatch } from "../patches/ranker.ts";

test("scorePatch favors severity and lower blast radius/time-to-fix", () => {
  const highUrgency = scorePatch(
    {
      id: "a",
      incidentId: 1,
      summary: "critical bridge outage",
      severity: "critical",
      blastRadius: 1,
      timeToFixMinutes: 10,
      testability: 0.95,
      riskPenalty: 0.7,
    },
    3,
  );
  const lowUrgency = scorePatch(
    {
      id: "b",
      incidentId: 2,
      summary: "warning log noise",
      severity: "warn",
      blastRadius: 3,
      timeToFixMinutes: 60,
      testability: 0.6,
      riskPenalty: 0.2,
    },
    3,
  );

  assert.equal(highUrgency.score > lowUrgency.score, true);
});

test("rankPatches returns highest score first", () => {
  const ranked = rankPatches([
    {
      id: "p1",
      incidentId: 1,
      summary: "medium",
      severity: "warn",
      blastRadius: 2,
      timeToFixMinutes: 40,
      testability: 0.8,
      riskPenalty: 0.7,
    },
    {
      id: "p2",
      incidentId: 2,
      summary: "top issue",
      severity: "critical",
      blastRadius: 1,
      timeToFixMinutes: 15,
      testability: 0.9,
      riskPenalty: 0.8,
    },
  ]);

  assert.equal(ranked[0]?.id, "p2");
  assert.equal(ranked[0]?.rank, 1);
});

test("candidateFitsRiskBudget enforces LOW and MED thresholds", () => {
  const candidate = {
    id: "p3",
    incidentId: 3,
    summary: "controlled patch",
    severity: "error" as const,
    blastRadius: 2,
    timeToFixMinutes: 20,
    testability: 0.8,
    riskPenalty: 1.2,
  };

  assert.equal(candidateFitsRiskBudget(candidate, "LOW"), false);
  assert.equal(candidateFitsRiskBudget(candidate, "MED"), true);
  assert.equal(candidateFitsRiskBudget(candidate, "HIGH"), true);
});

