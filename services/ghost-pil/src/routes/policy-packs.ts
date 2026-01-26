import type { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';

export const registerPolicyPackRoutes = (app: FastifyInstance) => {
  app.get('/v1/policy-packs', async () => {
    const rows = await query<{
      id: string;
      jurisdiction_code: string;
      version: string;
      generated_by: string;
      confidence_score: string;
      effective_from: string;
      sunset_at: string | null;
      status: string;
      created_at: string;
      rules: unknown;
      source_refs: unknown;
      simulation_report: unknown;
    }>(
      `SELECT id, jurisdiction_code, version, generated_by, confidence_score, effective_from, sunset_at, status, created_at, rules, source_refs, simulation_report
       FROM pil_policy_packs
       ORDER BY created_at DESC`
    );

    return {
      policyPacks: rows.map((row) => ({
        id: row.id,
        jurisdictionCode: row.jurisdiction_code,
        version: row.version,
        generatedBy: row.generated_by,
        confidenceScore: row.confidence_score,
        effectiveFrom: row.effective_from,
        sunsetAt: row.sunset_at,
        status: row.status,
        createdAt: row.created_at,
        rules: row.rules,
        sourceRefs: row.source_refs,
        simulationReport: row.simulation_report
      }))
    };
  });

  app.get('/v1/policy-packs/active', async () => {
    const rows = await query<{
      id: string;
      jurisdiction_code: string;
      version: string;
      generated_by: string;
      confidence_score: string;
      effective_from: string;
      sunset_at: string | null;
      status: string;
      created_at: string;
      rules: unknown;
      source_refs: unknown;
      simulation_report: unknown;
    }>(
      `SELECT id, jurisdiction_code, version, generated_by, confidence_score, effective_from, sunset_at, status, created_at, rules, source_refs, simulation_report
       FROM pil_policy_packs
       WHERE status = 'active'
       ORDER BY created_at DESC`
    );

    return {
      policyPacks: rows.map((row) => ({
        id: row.id,
        jurisdictionCode: row.jurisdiction_code,
        version: row.version,
        generatedBy: row.generated_by,
        confidenceScore: row.confidence_score,
        effectiveFrom: row.effective_from,
        sunsetAt: row.sunset_at,
        status: row.status,
        createdAt: row.created_at,
        rules: row.rules,
        sourceRefs: row.source_refs,
        simulationReport: row.simulation_report
      }))
    };
  });
};
