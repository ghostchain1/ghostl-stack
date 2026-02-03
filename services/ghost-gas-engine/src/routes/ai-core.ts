import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ethers } from 'ethers';
import { z } from 'zod';
import { config, loadChains } from '../config.js';
import { buildEvidenceBundle, fetchPolicyVersion, recordEvidence, writeEvidenceBundle } from '../ai-core/evidence.js';
import { buildPolicyUpdate, digestPolicyUpdate, hashPolicyUpdate, normalizeBytes32 } from '../ai-core/proposal.js';
import { signDigest, submitPolicyUpdate } from '../ai-core/signing.js';
import { query } from '../db/index.js';
import { getAutonomyOverrides } from '../autonomy/store.js';
import { resolveAutonomyConfig } from '../autonomy/engine.js';
import {
  getPolicyConstraints,
  listActions,
  listDecisions,
  listFingerprints,
  listGovernanceRecommendations,
  listObservations,
  listPlaybooks,
  listPredictions,
  listSuppressionRules,
  recordAiEvent,
  upsertPolicyConstraints,
  updateGovernanceRecommendation
} from '../ai-core/store.js';

const constraintsSchema = z.object({
  chainKey: z.string(),
  maxRisk: z.number().min(0).max(1).optional(),
  maxGasLimit: z.number().min(1).optional(),
  maxRetries: z.number().int().min(0).optional(),
  allowedActions: z.array(z.enum(['ALLOW', 'MODIFY', 'RETRY', 'DEFER', 'BLOCK', 'ESCALATE'])).optional()
});

const proposalSchema = z.object({
  chainKey: z.string(),
  policyKey: z.string(),
  value: z.union([z.string(), z.number()]),
  emergency: z.boolean().optional(),
  kind: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  simulation: z.record(z.any()).optional(),
  proposalId: z.number().int().nonnegative().optional(),
  policyVersion: z.number().int().nonnegative().optional(),
  issuedAt: z.number().int().nonnegative().optional(),
  validForSeconds: z.number().int().positive().optional(),
  nonce: z.string().optional()
});

const requireAdmin = (req: FastifyRequest, reply: FastifyReply): boolean => {
  if (!config.ADMIN_TOKEN) {
    reply.code(503).send({ error: 'admin_token_missing', hint: 'Set GAS_ENGINE_ADMIN_TOKEN to enable admin actions.' });
    return false;
  }
  const header = req.headers['x-admin-token'];
  const bearer = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const token = header || bearer.replace(/^Bearer\s+/i, '');
  if (!token || token !== config.ADMIN_TOKEN) {
    reply.code(401).send({ error: 'unauthorized', hint: 'Missing or invalid admin token.' });
    return false;
  }
  return true;
};

const parseListQuery = (req: FastifyRequest) => {
  const queryParams = req.query as { limit?: string; chainKey?: string; status?: string };
  const rawLimit = Number(queryParams.limit || 50);
  const limit = Number.isFinite(rawLimit) ? Math.min(rawLimit, 200) : 50;
  return { limit, chainKey: queryParams.chainKey, status: queryParams.status };
};

export async function registerAiCoreRoutes(app: FastifyInstance) {
  app.get('/v1/ai-core/status', async () => {
    const overrides = await getAutonomyOverrides();
    const effective = resolveAutonomyConfig(overrides);
    const latestObservation = await query<{ chain_key: string; created_at: string }>(
      'SELECT chain_key, created_at FROM ai_chain_observations ORDER BY created_at DESC LIMIT 1'
    );
    const latestPrediction = await query<{ chain_key: string; created_at: string }>(
      'SELECT chain_key, created_at FROM ai_risk_predictions ORDER BY created_at DESC LIMIT 1'
    );
    const latestDecision = await query<{ chain_key: string; created_at: string }>(
      'SELECT chain_key, created_at FROM ai_core_decisions ORDER BY created_at DESC LIMIT 1'
    );
    return {
      autonomy: { effective, overrides },
      latest: {
        observation: latestObservation[0] || null,
        prediction: latestPrediction[0] || null,
        decision: latestDecision[0] || null
      }
    };
  });

  app.get('/v1/ai-core/observations', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const rows = await listObservations(chainKey, limit);
    return {
      observations: rows.map((row: any) => ({
        id: row.id,
        chainKey: row.chain_key,
        blockNumber: row.block_number ? Number(row.block_number) : null,
        gasLimit: row.gas_limit ? Number(row.gas_limit) : null,
        gasUsed: row.gas_used ? Number(row.gas_used) : null,
        baseFee: row.base_fee ? Number(row.base_fee) : null,
        blockTime: row.block_time,
        rpcLatencyMs: row.rpc_latency_ms ?? null,
        rpcNamespace: row.rpc_namespace ?? null,
        success: row.success,
        errorMessage: row.error_message ?? null,
        createdAt: row.created_at
      }))
    };
  });

  app.get('/v1/ai-core/predictions', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const rows = await listPredictions(chainKey, limit);
    return {
      predictions: rows.map((row: any) => ({
        id: row.id,
        chainKey: row.chain_key,
        riskScore: Number(row.risk_score),
        predictedFailureProbability: Number(row.predicted_failure_probability),
        confidence: Number(row.confidence),
        timeHorizonSeconds: row.time_horizon_seconds,
        affectedSubsystem: row.affected_subsystem,
        recommendedAction: row.recommended_action,
        features: row.features || {},
        createdAt: row.created_at
      }))
    };
  });

  app.get('/v1/ai-core/decisions', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const rows = await listDecisions(chainKey, limit);
    return {
      decisions: rows.map((row: any) => ({
        id: row.id,
        chainKey: row.chain_key,
        mode: row.mode,
        action: row.action,
        status: row.status,
        riskScore: Number(row.risk_score),
        confidence: Number(row.confidence),
        forecastId: row.forecast_id,
        deploymentId: row.deployment_id,
        rationale: row.rationale || {},
        createdAt: row.created_at
      }))
    };
  });

  app.get('/v1/ai-core/actions', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const rows = await listActions(chainKey, limit);
    return {
      actions: rows.map((row: any) => ({
        id: row.id,
        decisionId: row.decision_id,
        chainKey: row.chain_key,
        actionType: row.action_type,
        status: row.status,
        payload: row.payload || {},
        createdAt: row.created_at
      }))
    };
  });

  app.get('/v1/ai-core/fingerprints', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const rows = await listFingerprints(chainKey, limit);
    return {
      fingerprints: rows.map((row: any) => ({
        fingerprint: row.fingerprint,
        chainKey: row.chain_key,
        classification: row.classification,
        errorSignature: row.error_signature,
        occurrences: Number(row.occurrences),
        firstSeen: row.first_seen,
        lastSeen: row.last_seen
      }))
    };
  });

  app.get('/v1/ai-core/suppression-rules', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const rows = await listSuppressionRules(chainKey, limit);
    return {
      rules: rows.map((row: any) => ({
        id: row.id,
        fingerprint: row.fingerprint,
        chainKey: row.chain_key,
        active: row.active,
        reason: row.reason,
        createdAt: row.created_at
      }))
    };
  });

  app.get('/v1/ai-core/playbooks', async (req) => {
    const { limit } = parseListQuery(req);
    const rows = await listPlaybooks(limit);
    return {
      playbooks: rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        steps: row.steps || {},
        createdAt: row.created_at
      }))
    };
  });

  app.get('/v1/ai-core/governance', async (req) => {
    const { limit, chainKey, status } = parseListQuery(req);
    const rows = await listGovernanceRecommendations(chainKey, status, limit);
    return {
      recommendations: rows.map((row: any) => ({
        id: row.id,
        chainKey: row.chain_key,
        category: row.category,
        severity: row.severity,
        summary: row.summary,
        recommendation: row.recommendation,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    };
  });

  app.post('/v1/ai-core/governance/:id/ack', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    await updateGovernanceRecommendation(id, 'acknowledged');
    await recordAiEvent('system', 'govern', 'recommendation_ack', { recommendationId: id });
    return { id, status: 'acknowledged' };
  });

  app.get('/v1/ai-core/policy-constraints', async (req) => {
    const { chainKey } = parseListQuery(req);
    if (!chainKey) {
      return { constraints: null };
    }
    const constraints = await getPolicyConstraints(chainKey);
    return { constraints };
  });

  app.post('/v1/ai-core/policy-constraints', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = constraintsSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
      return;
    }
    await upsertPolicyConstraints(parsed.data);
    await recordAiEvent(parsed.data.chainKey, 'govern', 'policy_constraints_updated', parsed.data);
    return { constraints: parsed.data };
  });

  app.post('/v1/ai-core/policy-proposals', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = proposalSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
      return;
    }
    const chains = loadChains();
    const chain = chains.find((item) => item.key === parsed.data.chainKey);
    if (!chain) {
      reply.code(400).send({ error: 'unknown_chain', chainKey: parsed.data.chainKey });
      return;
    }
    const policyKey = normalizeBytes32(parsed.data.policyKey);
    const emergency = parsed.data.emergency ?? false;
    const kind = parsed.data.kind || config.AI_EVIDENCE_KIND;
    const issuedAt = parsed.data.issuedAt ?? Math.floor(Date.now() / 1000);
    const validFor = parsed.data.validForSeconds ?? config.AI_POLICY_UPDATE_TTL_SECONDS;
    const validUntil = issuedAt + validFor;

    const { bundle, evidenceHash, metadataHash } = buildEvidenceBundle({
      kind,
      chainKey: chain.key,
      chainId: chain.chainId,
      policyKey,
      policyValue: String(parsed.data.value),
      emergency,
      issuedAt: new Date(issuedAt * 1000).toISOString(),
      source: 'ghost-gas-engine',
      metadata: parsed.data.metadata ?? {},
      simulation: parsed.data.simulation ?? null
    });

    const evidencePath = writeEvidenceBundle(bundle, evidenceHash, config.AI_EVIDENCE_OUTPUT_DIR);
    let policyVersion = parsed.data.policyVersion;
    if (
      policyVersion === undefined &&
      config.AI_POLICY_REGISTRY_ADDRESS &&
      config.AI_POLICY_REGISTRY_RPC
    ) {
      try {
        const currentVersion = await fetchPolicyVersion(
          config.AI_POLICY_REGISTRY_RPC,
          config.AI_POLICY_REGISTRY_ADDRESS,
          policyKey
        );
        policyVersion = emergency ? currentVersion : currentVersion + 1;
      } catch (err) {
        policyVersion = undefined;
      }
    }

    let recordResult: Record<string, unknown> | null = null;
    if (config.AI_EVIDENCE_AUTO_COMMIT) {
      if (
        config.AI_EVIDENCE_VAULT_ADDRESS &&
        config.AI_EVIDENCE_VAULT_RPC &&
        config.AI_EVIDENCE_SUBMITTER_KEY
      ) {
        try {
          recordResult = await recordEvidence({
            vaultAddress: config.AI_EVIDENCE_VAULT_ADDRESS,
            rpcUrl: config.AI_EVIDENCE_VAULT_RPC,
            submitterKey: config.AI_EVIDENCE_SUBMITTER_KEY,
            kind,
            evidenceHash,
            policyKey,
            policyVersion: policyVersion ?? 0,
            proposalId: parsed.data.proposalId ?? 0,
            signerSetHash: config.AI_EVIDENCE_SIGNER_SET_HASH || ethers.ZeroHash,
            threshold: config.AI_EVIDENCE_THRESHOLD,
            metadataHash
          });
        } catch (err) {
          const message = (err as Error)?.message;
          recordResult = { error: message || String(err) };
        }
      } else {
        recordResult = { error: 'missing_evidence_vault_config' };
      }
    }

    const update = buildPolicyUpdate({
      policyKey,
      value: parsed.data.value,
      evidenceHash,
      metadataHash,
      nonce: parsed.data.nonce,
      issuedAt,
      validUntil,
      emergency
    });
    const updateHash = hashPolicyUpdate(update);
    const executor = config.AI_PROPOSAL_EXECUTOR_ADDRESS || null;
    const digest =
      executor && chain.chainId
        ? digestPolicyUpdate(updateHash, chain.chainId, executor)
        : null;

    let signatures: Array<{ signer: string; signature: string }> = [];
    const signerKeys =
      config.AI_PROPOSAL_SIGNER_KEYS?.split(',').map((key) => key.trim()).filter(Boolean) ?? [];
    if (digest && signerKeys.length) {
      signatures = signDigest(digest, signerKeys);
      const minRequired = config.AI_PROPOSAL_MIN_SIGNATURES || 0;
      if (minRequired > 0 && signatures.length < minRequired) {
        reply.code(400).send({
          error: 'insufficient_signatures',
          required: minRequired,
          provided: signatures.length
        });
        return;
      }
    }

    let submitResult: Record<string, unknown> | null = null;
    if (config.AI_PROPOSAL_AUTO_SUBMIT) {
      if (!executor || !config.AI_PROPOSAL_EXECUTOR_RPC || !config.AI_PROPOSAL_SUBMITTER_KEY) {
        submitResult = { error: 'missing_executor_submit_config' };
      } else if (!signatures.length) {
        submitResult = { error: 'missing_signatures' };
      } else {
        try {
          submitResult = await submitPolicyUpdate({
            rpcUrl: config.AI_PROPOSAL_EXECUTOR_RPC,
            executorAddress: executor,
            submitterKey: config.AI_PROPOSAL_SUBMITTER_KEY,
            update,
            signatures: signatures.map((sig) => sig.signature),
            evidenceKind: kind,
            proposalId: parsed.data.proposalId ?? 0
          });
        } catch (err) {
          const message = (err as Error)?.message;
          submitResult = { error: message || String(err) };
        }
      }
    }

    const proposal = {
      chainKey: chain.key,
      policyKey,
      policyValue: update.value.toString(),
      emergency,
      evidenceHash,
      metadataHash,
      update: {
        policyKey: update.policyKey,
        value: update.value.toString(),
        evidenceHash: update.evidenceHash,
        metadataHash: update.metadataHash,
        nonce: update.nonce.toString(),
        issuedAt: Number(update.issuedAt),
        validUntil: Number(update.validUntil),
        emergency: update.emergency
      },
      updateHash,
      digest,
      executor,
      signatures,
      issuedAt,
      validUntil
    };

    let proposalPath: string | null = null;
    if (config.AI_PROPOSAL_OUTPUT_DIR) {
      fs.mkdirSync(config.AI_PROPOSAL_OUTPUT_DIR, { recursive: true });
      proposalPath = path.join(config.AI_PROPOSAL_OUTPUT_DIR, `policy-proposal-${evidenceHash}.json`);
      fs.writeFileSync(proposalPath, JSON.stringify(proposal, null, 2), 'utf8');
    }

    await recordAiEvent(chain.key, 'govern', 'policy_proposal_built', {
      evidenceHash,
      updateHash,
      policyKey
    });

    return {
      proposal,
      evidence: bundle,
      output: {
        evidencePath,
        proposalPath
      },
      recordEvidence: recordResult,
      submitPolicyUpdate: submitResult
    };
  });
}
