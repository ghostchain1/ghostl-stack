import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/index.js';
import { evaluateDecision } from '../engine/evaluator.js';
import type { Jurisdiction, LegalSignal } from '../engine/types.js';

const preflightSchema = z.object({
  action: z.string(),
  subjectHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  jurisdictionHints: z.array(z.string()).optional(),
  context: z.record(z.unknown()).optional(),
  proofs: z.array(z.object({
    statement: z.enum(['KYC_APPROVED', 'NOT_SANCTIONED', 'TX_THRESHOLD_OK', 'JURISDICTION_ALLOWED']),
    proofHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  })).optional()
});

const highRiskActions = new Set(['TRANSFER', 'BRIDGE', 'SWAP', 'GOV_ACTION', 'TREASURY_PAYOUT']);

export const registerPreflightRoutes = (app: FastifyInstance) => {
  app.post('/v1/preflight/evaluate', async (req, reply) => {
    const parsed = preflightSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'invalid_request', details: parsed.error.flatten() };
    }

    const jurisdictions = await query<Jurisdiction>(
      `SELECT code, name, region, risk_tier AS "riskTier", regulatory_profile AS "regulatoryProfile"
       FROM pil_jurisdictions`
    );
    const signals = await query<LegalSignal>(
      `SELECT id, jurisdiction_code AS "jurisdictionCode", category, severity, confidence,
              detected_at AS "detectedAt", summary, source_refs AS "sourceRefs"
       FROM pil_legal_signals`
    );

    const decisionInput = {
      action: parsed.data.action,
      subject: { subjectHash: parsed.data.subjectHash, residencyCountry: parsed.data.jurisdictionHints?.[0] },
      context: parsed.data.context || {}
    };
    const baseDecision = evaluateDecision(decisionInput, jurisdictions, signals, null);

    const proofs = parsed.data.proofs || [];
    const proofRows = await query<{
      statement: string;
      proof_hash: string;
      expires_at: string | null;
      status: string;
    }>(
      `SELECT statement, proof_hash, expires_at, status
       FROM pil_compliance_proofs
       WHERE subject_hash = $1`,
      [parsed.data.subjectHash]
    );

    const proofMap = new Map<string, { proofHash: string; expiresAt: string | null; status: string }>();
    for (const row of proofRows) {
      proofMap.set(row.statement, { proofHash: row.proof_hash, expiresAt: row.expires_at, status: row.status });
    }

    const requiredStatements = highRiskActions.has(parsed.data.action)
      ? ['KYC_APPROVED', 'NOT_SANCTIONED']
      : [];

    const missingProofs = requiredStatements.filter((statement) => !proofMap.has(statement));
    const expiredProofs = requiredStatements.filter((statement) => {
      const entry = proofMap.get(statement);
      if (!entry?.expiresAt) return false;
      return new Date(entry.expiresAt).getTime() < Date.now();
    });

    let finalDecision = baseDecision.decision;
    const reasons = [...baseDecision.reasons];

    if (baseDecision.decision !== 'BLOCK' && (missingProofs.length || expiredProofs.length)) {
      finalDecision = 'WARN';
      if (missingProofs.length) reasons.push('PROOF_MISSING');
      if (expiredProofs.length) reasons.push('PROOF_EXPIRED');
    }

    const explainabilityGraph = {
      ...baseDecision.explainabilityGraph,
      proofsChecked: requiredStatements,
      missingProofs,
      expiredProofs
    };

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO pil_compliance_decisions (correlation_id, decision, reasons, jurisdiction_applied, policy_pack_id, explainability_graph)
         VALUES ($1, $2, $3, $4, $5, $6)` ,
        [
          baseDecision.correlationId,
          finalDecision,
          reasons,
          baseDecision.jurisdictionApplied,
          baseDecision.policyPackId,
          JSON.stringify(explainabilityGraph)
        ]
      );
    });

    return {
      ...baseDecision,
      decision: finalDecision,
      reasons,
      explainabilityGraph
    };
  });
};
