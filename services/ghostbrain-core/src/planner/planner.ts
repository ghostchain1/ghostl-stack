/**
 * GhostBrain Core — Planner
 *
 * Generates ChangePlans for open incidents by:
 *   1. Extracting keywords from the incident
 *   2. Querying memory for similar past incidents
 *   3. Consulting runbooks for deterministic procedures
 *   4. Building a sequenced, blast-radius-bounded Change Plan
 *   5. Adding canary step if disruptive capabilities are involved
 *
 * The Planner targets "fact-compliant" plans: every step references
 * the evidence that motivated it.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  ChangePlan,
  ChangeStep,
  Incident,
  ResourceScope,
  SuccessMetric,
  AgentCapability,
  EvidenceRef,
  Layer,
} from "../types.js";
import { findSimilarIncidents, getSuccessfulPlanForIncident } from "../memory/retrieval.js";
import { DependencyGraph } from "./dependency-graph.js";
import { query } from "../connectors/db.js";
import { logger } from "../logger.js";

// ─── Runbook templates ────────────────────────────────────────────────────────
// Production: load from YAML runbooks/ dir. Here: inline defaults.

interface RunbookTemplate {
  trigger: RegExp;          // matches incident title
  capability: AgentCapability;
  scope: { type: ResourceScope["type"]; layer: Layer };
  successMetrics: SuccessMetric[];
  rationale: string;
}

const RUNBOOK_TEMPLATES: RunbookTemplate[] = [
  {
    trigger: /crash.loop|restarting|oom.kill/i,
    capability: "docker.restart",
    scope: { type: "stack", layer: "L2" },
    successMetrics: [
      { metric: "up", operator: "eq", threshold: 1, windowSeconds: 60 },
    ],
    rationale: "Container crash-looping detected. Restart the container and verify it stays up for 60s.",
  },
  {
    trigger: /compose|config.drift|reconcile/i,
    capability: "compose.reconcile",
    scope: { type: "stack", layer: "L2" },
    successMetrics: [
      { metric: "ghostbrain_health_graph_nodes{health='healthy'}", operator: "gte", threshold: 1, windowSeconds: 120 },
    ],
    rationale: "Compose config drift detected. Reconcile to desired state with canary rollout.",
  },
  {
    trigger: /dns|tls|certificate|cert.expired/i,
    capability: "network.dns.update",
    scope: { type: "domain", layer: "L2" },
    successMetrics: [
      { metric: "probe_success", operator: "eq", threshold: 1, windowSeconds: 60 },
    ],
    rationale: "DNS/TLS issue detected. Update DNS record or renew TLS certificate.",
  },
  {
    trigger: /replication|database.lag|db.down/i,
    capability: "db.replication.status",
    scope: { type: "db", layer: "L2" },
    successMetrics: [
      { metric: "pg_replication_lag_seconds", operator: "lt", threshold: 5, windowSeconds: 60 },
    ],
    rationale: "Database replication issue. Verify replication status; escalate if lag persists.",
  },
];

// ─── Planner ──────────────────────────────────────────────────────────────────
export class Planner {
  constructor(private readonly graph: DependencyGraph) {}

  async generatePlan(incident: Incident): Promise<ChangePlan> {
    logger.info("Generating change plan", { incidentId: incident.incidentId, title: incident.title });

    // 1. Extract keywords from incident
    const keywords = incident.title.split(/\W+/).filter(w => w.length > 3);

    // 2. Check memory for past solutions
    const [similar, pastPlan] = await Promise.all([
      findSimilarIncidents(keywords),
      getSuccessfulPlanForIncident(incident.title),
    ]);

    // 3. Match runbook template
    const matchedRunbook = RUNBOOK_TEMPLATES.find(rb => rb.trigger.test(incident.title));

    // 4. Build steps
    const steps: ChangeStep[] = [];
    const evidenceRefs: EvidenceRef[] = [];

    if (matchedRunbook) {
      const step: ChangeStep = {
        stepId: uuidv4(),
        order: 1,
        description: matchedRunbook.rationale,
        capability: matchedRunbook.capability,
        target: {
          type: matchedRunbook.scope.type,
          name: this._inferTargetName(incident),
          layer: matchedRunbook.scope.layer,
        },
        params: { triggeredByIncident: incident.incidentId },
        successMetrics: matchedRunbook.successMetrics,
        rollbackStep: {
          description: `Rollback: revert change applied in step for ${incident.title}`,
          capability: matchedRunbook.capability,
          params: { rollback: true, triggeredByIncident: incident.incidentId },
        },
        timeoutSeconds: 300,
      };
      steps.push(step);

      evidenceRefs.push({
        evidenceId: uuidv4(),
        kind: "log_excerpt",
        description: `Runbook matched: "${matchedRunbook.rationale}" triggered by title pattern`,
        storedAt: new Date().toISOString(),
        payload: { trigger: matchedRunbook.trigger.toString(), matched: incident.title },
      });
    }

    if (similar.length > 0) {
      evidenceRefs.push({
        evidenceId: uuidv4(),
        kind: "metric_snapshot",
        description: `${similar.length} similar past incident(s) found: ${similar.map(i => i.incidentId).join(", ")}`,
        storedAt: new Date().toISOString(),
        payload: { similarIncidentIds: similar.map(i => i.incidentId) },
      });
    }

    // Fallback if no runbook matched
    if (steps.length === 0) {
      logger.warn("No runbook matched; generating diagnostic step", { incidentId: incident.incidentId });
      steps.push({
        stepId: uuidv4(),
        order: 1,
        description: "Run diagnostics and collect evidence before proposing a fix.",
        capability: "metrics.query",
        target: { type: "stack", name: "ghostl-stack", layer: "L2" },
        params: { incidentId: incident.incidentId },
        successMetrics: [],
        timeoutSeconds: 60,
      });
    }

    // 5. Compute blast radius
    const targetNodeIds = steps.map(s => s.target.name);
    const impacted = this.graph.impactedBy(targetNodeIds[0] ?? "");
    const blastRadius = Math.max(steps.length, impacted.length);

    // 6. Canary step (if disruptive)
    const DISRUPTIVE: Set<AgentCapability> = new Set(["docker.restart", "compose.apply", "compose.reconcile"]);
    const needsCanary = steps.some(s => DISRUPTIVE.has(s.capability));
    const canaryStep: ChangeStep | undefined = needsCanary ? {
      stepId: uuidv4(),
      order: 0,
      description: "Canary: apply to a single replica before full rollout.",
      capability: "compose.canary",
      target: steps[0]!.target,
      params: { canaryFraction: 0.1, triggeredByIncident: incident.incidentId },
      successMetrics: steps[0]!.successMetrics,
      rollbackStep: {
        description: "Rollback canary replica to previous state.",
        capability: "compose.canary",
        params: { rollback: true },
      },
      timeoutSeconds: 180,
    } : undefined;

    // 7. Rationale
    const rationale = pastPlan
      ? `Based on past resolution: "${pastPlan.rationale}"`
      : matchedRunbook?.rationale
        ?? "No prior pattern found. Diagnostic-first approach.";

    const plan: ChangePlan = {
      planId:       uuidv4(),
      incidentId:   incident.incidentId,
      createdAt:    new Date().toISOString(),
      status:       "draft",
      title:        `Fix: ${incident.title}`,
      rationale,
      steps,
      blastRadius,
      ...(canaryStep !== undefined ? { canaryStep } : {}),
      evidenceRefs,
    };

    // Persist plan
    await query(
      `INSERT INTO change_plans (plan_id, incident_id, status, title, rationale, steps, blast_radius, canary_step, evidence_refs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        plan.planId, plan.incidentId, plan.status, plan.title, plan.rationale,
        JSON.stringify(plan.steps), plan.blastRadius,
        plan.canaryStep ? JSON.stringify(plan.canaryStep) : null,
        JSON.stringify(plan.evidenceRefs),
      ]
    );

    logger.info("Change plan generated", { planId: plan.planId, steps: steps.length, blastRadius });
    return plan;
  }

  private _inferTargetName(incident: Incident): string {
    // Try to extract a service name from incident signals
    const signal = incident.signals.find(s => s.service);
    return signal?.service ?? "ghostl-stack";
  }
}
