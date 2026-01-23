import type { FastifyInstance } from 'fastify';
import { query } from '../db';

export const registerJurisdictionRoutes = (app: FastifyInstance) => {
  app.get('/v1/jurisdictions', async () => {
    const rows = await query<{
      code: string;
      name: string;
      region: string;
      risk_tier: string;
      regulatory_profile: unknown;
      updated_at: string;
    }>('SELECT code, name, region, risk_tier, regulatory_profile, updated_at FROM pil_jurisdictions ORDER BY code');

    return {
      jurisdictions: rows.map((row) => ({
        code: row.code,
        name: row.name,
        region: row.region,
        riskTier: row.risk_tier,
        regulatoryProfile: row.regulatory_profile,
        updatedAt: row.updated_at
      }))
    };
  });
};
