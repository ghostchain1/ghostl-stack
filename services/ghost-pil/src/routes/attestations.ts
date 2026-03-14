import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/index.js';
import { buildVerifier } from '../zk/index.js';
import { attestationsRegistered } from '../telemetry/metrics.js';

const proofSchema = z.object({
  subjectHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  issuerId: z.string().min(1),
  statement: z.enum(['KYC_APPROVED', 'NOT_SANCTIONED', 'TX_THRESHOLD_OK', 'JURISDICTION_ALLOWED']),
  proofHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  jurisdictionCode: z.string().min(2).max(10),
  expiresAt: z.string().datetime().optional()
});

export const registerAttestationRoutes = (app: FastifyInstance) => {
  app.post('/v1/attestations', async (req, reply) => {
    const parsed = proofSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'invalid_request', details: parsed.error.flatten() };
    }

    const verifier = buildVerifier();
    const verification = await verifier.verify(parsed.data);
    const status = verification.status;
    attestationsRegistered.labels(status).inc();

    const rows = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO pil_compliance_proofs (subject_hash, issuer_id, statement, proof_hash, jurisdiction_code, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [
          parsed.data.subjectHash,
          parsed.data.issuerId,
          parsed.data.statement,
          parsed.data.proofHash,
          parsed.data.jurisdictionCode.toUpperCase(),
          parsed.data.expiresAt || null,
          status
        ]
      );
      return result.rows[0];
    });

    return {
      attestationId: rows.id,
      status,
      reason: verification.reason,
      createdAt: rows.created_at
    };
  });

  app.get('/v1/attestations', async () => {
    const rows = await query<{
      id: string;
      subject_hash: string;
      issuer_id: string;
      statement: string;
      proof_hash: string;
      jurisdiction_code: string;
      expires_at: string | null;
      status: string;
      created_at: string;
    }>(
      `SELECT id, subject_hash, issuer_id, statement, proof_hash, jurisdiction_code, expires_at, status, created_at
       FROM pil_compliance_proofs
       ORDER BY created_at DESC
       LIMIT 100`
    );

    return {
      attestations: rows.map((row) => ({
        id: row.id,
        subjectHash: row.subject_hash,
        issuerId: row.issuer_id,
        statement: row.statement,
        proofHash: row.proof_hash,
        jurisdictionCode: row.jurisdiction_code,
        expiresAt: row.expires_at,
        status: row.status,
        createdAt: row.created_at
      }))
    };
  });
};
