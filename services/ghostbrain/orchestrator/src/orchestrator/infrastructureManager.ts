/**
 * orchestrator/infrastructureManager.ts — Coordinates container + chain health.
 *
 * High-level orchestrator that drives all monitoring loops and accumulates
 * the global OrchestratorSnapshot.
 */

import { refreshChainHealth } from "./blockchainManager.js";
import { buildInfraReport } from "./containerManager.js";
import { fetchValidators } from "../monitor/validatorHealth.js";
import type {
  AnomalyEvent,
  OrchestratorNode,
  OrchestratorSnapshot,
  ScalingProposal,
  ValidatorStatus,
} from "../types.js";

// ── State ─────────────────────────────────────────────────────────────────────

let _tick     = 0;
let _snapshot: OrchestratorSnapshot = buildEmptySnapshot();

/** Bounded ring buffer of anomaly events (max 200). */
const _anomalies: AnomalyEvent[] = [];
/** Recent scaling proposals (max 50). */
const _proposals: ScalingProposal[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEmptySnapshot(): OrchestratorSnapshot {
  return {
    tick:            0,
    timestamp:       Date.now(),
    chains:          [],
    nodes:           [],
    validators:      [],
    infra:           { containers: [], totalUp: 0, totalDown: 0, scannedAt: Date.now() },
    anomalies:       [],
    recentProposals: [],
    nodesHealthy:    0,
    nodesDegraded:   0,
    nodesOffline:    0,
  };
}

function countByStatus(nodes: OrchestratorNode[]) {
  let healthy = 0, degraded = 0, offline = 0;
  for (const n of nodes) {
    if (n.status === "healthy") healthy++;
    else if (n.status === "degraded") degraded++;
    else offline++;
  }
  return { healthy, degraded, offline };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Add an anomaly event to the ring buffer. */
export function recordAnomaly(event: AnomalyEvent): void {
  _anomalies.push(event);
  if (_anomalies.length > 200) _anomalies.splice(0, _anomalies.length - 200);
}

/** Resolve an anomaly by id. */
export function resolveAnomaly(id: string): void {
  const ev = _anomalies.find((a) => a.id === id);
  if (ev) {
    ev.resolved   = true;
    ev.resolvedAt = Date.now();
  }
}

/** Add a scaling proposal. */
export function recordProposal(proposal: ScalingProposal): void {
  _proposals.push(proposal);
  if (_proposals.length > 50) _proposals.splice(0, _proposals.length - 50);
}

/** Return a copy of the latest snapshot. */
export function getSnapshot(): OrchestratorSnapshot {
  return { ..._snapshot };
}

/**
 * Run one full orchestration cycle.
 * Collects chain health, infra report, validator status and merges them into
 * the global snapshot.  Safe to call concurrently (JS single-thread).
 */
export async function runOrchestratorTick(): Promise<OrchestratorSnapshot> {
  _tick++;

  const [chainResult, infra, validators] = await Promise.allSettled([
    refreshChainHealth(),
    buildInfraReport(),
    fetchValidators(),
  ]);

  const { chains, nodes } =
    chainResult.status === "fulfilled"
      ? chainResult.value
      : { chains: [], nodes: [] };

  const infraReport =
    infra.status === "fulfilled"
      ? infra.value
      : { containers: [], totalUp: 0, totalDown: 0, scannedAt: Date.now() };

  const validatorList: ValidatorStatus[] =
    validators.status === "fulfilled" ? validators.value : [];

  const { healthy, degraded, offline } = countByStatus(nodes);

  _snapshot = {
    tick:            _tick,
    timestamp:       Date.now(),
    chains,
    nodes,
    validators:      validatorList,
    infra:           infraReport,
    anomalies:       [..._anomalies].filter((a) => !a.resolved).slice(-50),
    recentProposals: [..._proposals].slice(-20),
    nodesHealthy:    healthy,
    nodesDegraded:   degraded,
    nodesOffline:    offline,
  };

  return _snapshot;
}
