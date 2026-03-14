import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { decisionCounter, decisionLatency } from '../telemetry/metrics';
import { query, redis } from '../db';
import { parsePolicyBundle } from '../engine/parser';
import { evaluatePolicy } from '../engine/evaluator';
import type { DecisionInput, PolicyBundle } from '../engine/types';
import { buildAttestation } from '../attest/attestation';
import { createHash } from 'crypto';

const requestSchema = z.object({
  requestId: z.string().min(1),
  subject: z.object({
    type: z.string().min(1),
    walletAddress: z.string().min(1),
    chainId: z.string().min(1),
    userId: z.string().optional(),
    residencyCountry: z.string().optional(),
    kycLevel: z.string().optional()
  }),
  action: z.string().min(1),
  resource: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional()
});

const ACTIVE_POLICY_CACHE_KEY = 'compliance:policy:active';
const ACTIVE_POLICY_TTL = 30;

export async function registerDecisionRoutes(app: FastifyInstance) {
  app.post('/v1/decision', async (req, reply) => {
    const start = Date.now();
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const input = {
      ...parsed.data,
      resource: parsed.data.resource || {},
      context: parsed.data.context || {}
    } as DecisionInput;

    const cachedDecision = await query<{ id: string; decision: string; reasons: string[]; required_controls: string[]; disclosures: string[]; matched_rules: string[]; policy_bundle_id: string; evidence_bundle_id: string; attestation: unknown }>(
      'SELECT id, decision, reasons, required_controls, disclosures, matched_rules, policy_bundle_id, evidence_bundle_id, attestation FROM compliance_decisions WHERE request_id = $1',
      [input.requestId]
    );
    if (cachedDecision.length) {
      const row = cachedDecision[0];
      return reply.send({
        decision: row.decision,
        reasons: row.reasons,
        requiredControls: row.required_controls,
        disclosures: row.disclosures,
        matchedRules: row.matched_rules,
        policyBundle: await policyBundleMeta(row.policy_bundle_id),
        evidenceBundleId: row.evidence_bundle_id,
        attestation: row.attestation
      });
    }

    const bundle = await getActiveBundle();
    if (!bundle) {
      return reply.status(409).send({ error: 'policy_bundle_missing', service: 'ghost-compliance', hint: 'Activate a policy bundle first.' });
    }

    const decision = evaluatePolicy(bundle.bundle, input);
    const attestation = decision.decision === 'allow' || decision.decision === 'allow_with_controls'
      ? await buildAttestation(input, input.resource)
      : null;

    const subjectId = await upsertSubject(input);
    const evidenceBundle = await createEvidenceBundle(subjectId, input, decision, attestation);

    const decisionRow = await query<{ id: string }>(
      `INSERT INTO compliance_decisions (request_id, subject_id, action, resource, context, decision, reasons, required_controls, disclosures, matched_rules, policy_bundle_id, evidence_bundle_id, attestation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        input.requestId,
        subjectId,
        input.action,
        input.resource || {},
        input.context || {},
        decision.decision,
        decision.reasons,
        decision.requiredControls,
        decision.disclosures,
        JSON.stringify(decision.matchedRules),
        bundle.meta.id,
        evidenceBundle.id,
        attestation
      ]
    );

    await query('UPDATE evidence_bundles SET decision_id = $1 WHERE id = $2', [decisionRow[0].id, evidenceBundle.id]);

    decisionCounter.inc({ decision: decision.decision, action: input.action });
    decisionLatency.observe({ action: input.action }, Date.now() - start);

    return reply.send({
      decision: decision.decision,
      reasons: decision.reasons,
      requiredControls: decision.requiredControls,
      disclosures: decision.disclosures,
      matchedRules: decision.matchedRules,
      policyBundle: { bundleId: bundle.bundle.metadata.bundleId, version: bundle.bundle.metadata.version },
      evidenceBundleId: evidenceBundle.id,
      attestation
    });
  });
}

const getActiveBundle = async (): Promise<{ bundle: PolicyBundle; meta: { id: string } } | null> => {
  const cached = await redis.get(ACTIVE_POLICY_CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached) as { bundle: PolicyBundle; id: string };
    return { bundle: parsed.bundle, meta: { id: parsed.id } };
  }

  const rows = await query<{ id: string; yaml: string }>(
    'SELECT id, yaml FROM policy_bundles WHERE status = $1 ORDER BY activated_at DESC NULLS LAST, created_at DESC LIMIT 1',
    ['active']
  );
  if (!rows.length) return null;

  const bundle = parsePolicyBundle(rows[0].yaml);
  await redis.set(ACTIVE_POLICY_CACHE_KEY, JSON.stringify({ bundle, id: rows[0].id }), 'EX', ACTIVE_POLICY_TTL);
  return { bundle, meta: { id: rows[0].id } };
};

const upsertSubject = async (input: DecisionInput): Promise<string> => {
  const existing = await query<{ id: string }>(
    'SELECT id FROM compliance_subjects WHERE wallet_address = $1 AND chain_id = $2',
    [input.subject.walletAddress, input.subject.chainId]
  );
  if (existing.length) {
    await query(
      'UPDATE compliance_subjects SET user_id = $1, residency_country = $2, kyc_level = $3, updated_at = now() WHERE id = $4',
      [input.subject.userId || null, input.subject.residencyCountry || null, input.subject.kycLevel || null, existing[0].id]
    );
    return existing[0].id;
  }
  const created = await query<{ id: string }>(
    `INSERT INTO compliance_subjects (wallet_address, chain_id, user_id, residency_country, kyc_level)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [input.subject.walletAddress, input.subject.chainId, input.subject.userId || null, input.subject.residencyCountry || null, input.subject.kycLevel || null]
  );
  return created[0].id;
};

const createEvidenceBundle = async (
  subjectId: string,
  input: DecisionInput,
  decision: ReturnType<typeof evaluatePolicy>,
  attestation: Awaited<ReturnType<typeof buildAttestation>> | null
): Promise<{ id: string }> => {
  const prev = await query<{ hash: string }>(
    'SELECT hash FROM evidence_bundles WHERE subject_id = $1 ORDER BY created_at DESC LIMIT 1',
    [subjectId]
  );
  const prevHash = prev.length ? prev[0].hash : null;
  const artifacts = {
    requestId: input.requestId,
    action: input.action,
    subject: input.subject,
    resource: input.resource || {},
    context: input.context || {},
    decision
  };
  const hash = sha256(`${prevHash || ''}:${JSON.stringify(artifacts)}`);
  const rows = await query<{ id: string }>(
    `INSERT INTO evidence_bundles (subject_id, prev_hash, hash, artifacts)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [subjectId, prevHash, hash, artifacts]
  );
  return { id: rows[0].id };
};

const policyBundleMeta = async (bundleId: string) => {
  const rows = await query<{ bundle_id: string; version: string }>('SELECT bundle_id, version FROM policy_bundles WHERE id = $1', [bundleId]);
  if (!rows.length) return { bundleId: 'unknown', version: 'unknown' };
  return { bundleId: rows[0].bundle_id, version: rows[0].version };
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
