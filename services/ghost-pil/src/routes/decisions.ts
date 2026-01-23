import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db';
import { evaluateDecision } from '../engine/evaluator';
import type { Jurisdiction, LegalSignal, DecisionInput } from '../engine/types';
import { complianceDecisions } from '../telemetry/metrics';

const inputSchema = z.object({
  requestId: z.string().optional(),
  action: z.string(),
  subject: z.record(z.unknown()).optional(),
  resource: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional()
});

export const registerDecisionRoutes = (app: FastifyInstance) => {
  app.post('/v1/decisions/evaluate', async (req, reply) => {
    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'invalid_request', details: parsed.error.flatten() };
    }

    const input = parsed.data as DecisionInput;
    const jurisdictions = await query<Jurisdiction>(
      `SELECT code, name, region, risk_tier AS "riskTier", regulatory_profile AS "regulatoryProfile"
       FROM pil_jurisdictions`
    );
    const signals = await query<LegalSignal>(
      `SELECT id, jurisdiction_code AS "jurisdictionCode", category, severity, confidence,
              detected_at AS "detectedAt", summary, source_refs AS "sourceRefs"
       FROM pil_legal_signals`
    );

    const baseDecision = evaluateDecision(input, jurisdictions, signals, null);
    const policyRows = await query<{ id: string }>(
      `SELECT id FROM pil_policy_packs WHERE jurisdiction_code = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [baseDecision.jurisdictionApplied]
    );
    const decision = { ...baseDecision, policyPackId: policyRows[0]?.id || null };
    complianceDecisions.labels(decision.decision, decision.jurisdictionApplied).inc();

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO pil_compliance_decisions (correlation_id, decision, reasons, jurisdiction_applied, policy_pack_id, explainability_graph)
         VALUES ($1, $2, $3, $4, $5, $6)` ,
        [
          decision.correlationId,
          decision.decision,
          decision.reasons,
          decision.jurisdictionApplied,
          decision.policyPackId,
          JSON.stringify(decision.explainabilityGraph)
        ]
      );
    });

    return decision;
  });
};
