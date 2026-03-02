/**
 * GhostBrain Core — Brain Engine (main tick loop)
 *
 * The autonomous control loop:
 *   Tick → Ingest signals → Update health graph → Detect anomalies
 *       → Open incidents → Diagnose → Generate plans → Policy gate
 *       → Execute (canary → ramp) → Verify SLOs → Record evidence
 *
 * Runs every BRAIN_TICK_SECONDS (default: 30s).
 */

import { detectUnhealthyContainers } from "../connectors/docker.js";
import { openIncident, updateIncidentStatus, getOpenIncidents } from "../memory/incident-store.js";
import { evaluatePlan } from "../policy/gatekeeper.js";
import { Planner } from "../planner/planner.js";
import { Orchestrator } from "./engine.js";
import { DependencyGraph } from "../planner/dependency-graph.js";
import { query } from "../connectors/db.js";
import type { HealthSignal, AgentRegistration } from "../types.js";
import {
  brainTickTotal,
  brainTickDuration,
  incidentsOpened,
  activeIncidents,
  anomalySignals,
  healthGraphNodes,
} from "../metrics.js";
import { subscribeAnomalySignals, subscribeAgentRegistrations } from "../connectors/nats.js";
import { logger } from "../logger.js";
import { TICK_INTERVAL_SECONDS } from "../config.js";

// ─── Agent registry ───────────────────────────────────────────────────────────
const _agents = new Map<string, AgentRegistration>();
const _capabilityMap = new Map<string, string>();  // capability → agentId

export function getAgentRegistry(): Map<string, string> {
  return _capabilityMap;
}

// ─── Health signal queue ──────────────────────────────────────────────────────
const _signalQueue: HealthSignal[] = [];

// ─── Graph ────────────────────────────────────────────────────────────────────
const _graph = DependencyGraph.buildDefault();
const _planner = new Planner(_graph);
const _orchestrator = new Orchestrator();

// ─── Brain init ───────────────────────────────────────────────────────────────
export function startBrain(): void {
  // Subscribe to NATS for agent registrations and anomaly signals
  subscribeAgentRegistrations(reg => {
    _agents.set(reg.agentId, reg);
    for (const cap of reg.capabilities) {
      _capabilityMap.set(cap, reg.agentId);
    }
    logger.info("Agent indexed", { agentId: reg.agentId, capabilities: reg.capabilities });
  });

  subscribeAnomalySignals(signal => {
    _signalQueue.push(signal);
    anomalySignals.inc({ source: signal.source, layer: signal.layer ?? "unknown" });
  });

  // Start tick loop
  const intervalMs = TICK_INTERVAL_SECONDS * 1000;

  void _runTick();  // immediate first tick
  setInterval(() => void _runTick(), intervalMs);

  logger.info("GhostBrain tick loop started", { intervalSeconds: TICK_INTERVAL_SECONDS });
}

// ─── Tick ─────────────────────────────────────────────────────────────────────
async function _runTick(): Promise<void> {
  const end = brainTickDuration.startTimer();
  brainTickTotal.inc();

  try {
    // 1. Ingest signals from Docker
    await _ingestDockerHealth();

    // 2. Drain signal queue
    const signals = _signalQueue.splice(0);

    // 3. Update health graph nodes
    _updateHealthGraph(signals);

    // 4. Detect new anomalies → open incidents
    await _detectAndOpenIncidents(signals);

    // 5. For each open incident (not yet planned): generate plan → gate → execute
    const openIncidentsList = await getOpenIncidents(10);

    for (const incident of openIncidentsList) {
      if (incident.status !== "open" && incident.status !== "diagnosing") continue;

      logger.info("Processing incident", { incidentId: incident.incidentId, title: incident.title });

      // Mark diagnosing
      await updateIncidentStatus(incident.incidentId, "diagnosing");

      // Generate plan
      const plan = await _planner.generatePlan(incident);

      // Policy gate
      const gateResult = evaluatePlan(plan);
      await query(
          `UPDATE change_plans SET policy_decision=$1, policy_conditions=$2 WHERE plan_id=$3`,
          [gateResult.decision, JSON.stringify(gateResult.conditions), plan.planId]
      );

      if (gateResult.decision === "DENY") {
        logger.warn("Plan blocked by policy", {
          planId: plan.planId,
          violations: gateResult.violations,
        });
        // Leave incident in "diagnosing" for human review
        continue;
      }

      if (gateResult.decision === "ALLOW_WITH_CONDITIONS" && gateResult.conditions.some(c => c.includes("BREAK_GLASS"))) {
        logger.warn("Plan requires break-glass approval — halting auto-execution", { planId: plan.planId });
        continue;
      }

      // Approve plan
      plan.status = "approved";
      plan.policyDecision = gateResult.decision;
      plan.policyConditions = gateResult.conditions;

      await updateIncidentStatus(incident.incidentId, "planned", { planId: plan.planId });

      // Execute
      await _orchestrator.executePlan(plan, _capabilityMap);
    }

    // 6. Update metrics
    const allNodes = _graph.getAllNodes();
    const healthCounts = _countByHealth(allNodes.map(n => n.health));
    for (const [health, count] of Object.entries(healthCounts)) {
      healthGraphNodes.labels(health).set(count);
    }

    logger.debug("Tick complete", { openIncidents: openIncidentsList.length });
  } catch (err) {
    logger.error("Brain tick error", { err: String(err) });
  } finally {
    end();
  }
}

// ─── Docker health ingestion ──────────────────────────────────────────────────
async function _ingestDockerHealth(): Promise<void> {
  const unhealthy = await detectUnhealthyContainers();
  for (const { name, issue } of unhealthy) {
    const signal: HealthSignal = {
      signalId:    `docker-${name}-${Date.now()}`,
      source:      "docker",
      service:     name,
      layer:       "L2",
      observedAt:  new Date().toISOString(),
      anomaly:     true,
      logLine:     `Container ${name}: ${issue}`,
    };
    _signalQueue.push(signal);
  }
}

// ─── Health graph update ──────────────────────────────────────────────────────
function _updateHealthGraph(signals: HealthSignal[]): void {
  for (const sig of signals) {
    if (sig.service) {
      _graph.updateHealth(sig.service, sig.anomaly ? "degraded" : "healthy");
    }
  }
}

// ─── Anomaly → Incident ───────────────────────────────────────────────────────
async function _detectAndOpenIncidents(signals: HealthSignal[]): Promise<void> {
  const anomalySignalsList = signals.filter(s => s.anomaly);
  if (anomalySignalsList.length === 0) return;

  // Group by service to avoid duplicate incidents
  const grouped = new Map<string, HealthSignal[]>();
  for (const sig of anomalySignalsList) {
    const key = sig.service ?? sig.source;
    const existing = grouped.get(key) ?? [];
    existing.push(sig);
    grouped.set(key, existing);
  }

  for (const [service, sigs] of grouped) {
    const title = `${service}: ${sigs[0]?.logLine ?? "anomaly detected"}`;
    const incident = await openIncident("medium", title, sigs.map(s => s.logLine ?? "").join("; "), sigs);
    incidentsOpened.inc({ severity: incident.severity });
    activeIncidents.inc({ severity: incident.severity });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _countByHealth(healths: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const h of healths) {
    counts[h] = (counts[h] ?? 0) + 1;
  }
  return counts;
}
