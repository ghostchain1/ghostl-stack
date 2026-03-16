/**
 * ai/anomalyDetector.ts — Rule-based anomaly detection for GhostBrain Orchestrator.
 *
 * Uses heuristics derived from the live OrchestratorSnapshot to produce
 * AnomalyEvents. No ML model dependency — deterministic, no network calls.
 *
 * Governance rule: anomalies are recorded, not acted upon autonomously.
 * Actions are proposed to the signing relay and require governance ratification.
 */

import { randomUUID } from "crypto";
import type { AnomalyEvent, AnomalyType, OrchestratorSnapshot } from "../types.js";
import { THRESHOLDS } from "../config.js";
import { recordAnomaly } from "../orchestrator/infrastructureManager.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(
  type:     AnomalyType,
  severity: AnomalyEvent["severity"],
  details:  string,
): AnomalyEvent {
  return {
    id:         randomUUID(),
    type,
    severity,
    details,
    detectedAt: Date.now(),
    resolved:   false,
  };
}

// ── Detection rules ───────────────────────────────────────────────────────────

function detectOfflineNodes(snapshot: OrchestratorSnapshot): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];
  for (const node of snapshot.nodes) {
    if (node.status === "offline") {
      events.push(
        makeEvent("node_down", "critical", `Node "${node.id}" (${node.role}) is offline`),
      );
    } else if (node.status === "degraded") {
      events.push(
        makeEvent("node_down", "warning", `Node "${node.id}" is degraded (syncing or slow)`),
      );
    }
  }
  return events;
}

function detectBlockLag(snapshot: OrchestratorSnapshot): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];
  const get = (layer: string): number =>
    snapshot.chains.find((c) => c.layer === layer)?.blockNumber ?? 0;

  const l1l2Lag = get("l1") - get("l2");
  const l2l3Lag = get("l2") - get("l3");

  if (l1l2Lag > THRESHOLDS.maxBlockLag) {
    events.push(
      makeEvent(
        "high_block_lag",
        "warning",
        `L2 is ${l1l2Lag} blocks behind L1 (threshold: ${THRESHOLDS.maxBlockLag})`,
      ),
    );
  }
  if (l2l3Lag > THRESHOLDS.maxBlockLag) {
    events.push(
      makeEvent(
        "high_block_lag",
        "warning",
        `L3 is ${l2l3Lag} blocks behind L2 (threshold: ${THRESHOLDS.maxBlockLag})`,
      ),
    );
  }
  return events;
}

function detectJailedValidators(snapshot: OrchestratorSnapshot): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];
  for (const v of snapshot.validators) {
    if (v.jailed) {
      events.push(
        makeEvent(
          "validator_jailed",
          "critical",
          `Validator "${v.moniker}" (${v.address.slice(0, 16)}…) is jailed`,
        ),
      );
    }
  }
  return events;
}

function detectLowParticipation(snapshot: OrchestratorSnapshot): AnomalyEvent[] {
  const total  = snapshot.validators.length;
  if (total === 0) return [];

  const active = snapshot.validators.filter((v) => !v.jailed).length;
  const pct    = (active / total) * 100;

  if (pct < THRESHOLDS.validatorQuorumPct) {
    return [
      makeEvent(
        "low_participation",
        "critical",
        `Only ${active}/${total} validators active (${pct.toFixed(1)}% < threshold ${THRESHOLDS.validatorQuorumPct}%)`,
      ),
    ];
  }
  return [];
}

function detectRestartLoops(snapshot: OrchestratorSnapshot): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];
  for (const c of snapshot.infra.containers) {
    if (c.restartCount >= 5) {
      events.push(
        makeEvent(
          "container_restart_loop",
          c.restartCount >= 10 ? "critical" : "warning",
          `Container "${c.name}" has restarted ${c.restartCount} times`,
        ),
      );
    }
  }
  return events;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Analyse the current snapshot and emit anomaly events for any detected issues.
 * All detected events are stored via `recordAnomaly`.
 */
export function runAnomalyDetection(snapshot: OrchestratorSnapshot): AnomalyEvent[] {
  const detected: AnomalyEvent[] = [
    ...detectOfflineNodes(snapshot),
    ...detectBlockLag(snapshot),
    ...detectJailedValidators(snapshot),
    ...detectLowParticipation(snapshot),
    ...detectRestartLoops(snapshot),
  ];

  for (const ev of detected) {
    recordAnomaly(ev);
  }

  return detected;
}
