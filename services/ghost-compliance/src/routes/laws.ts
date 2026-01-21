import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { query } from '../db';

const ingestSchema = z.object({
  jurisdiction: z.object({
    code: z.string().min(1),
    name: z.string().min(1)
  }),
  law: z.object({
    topic: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().optional(),
    versions: z
      .array(
        z.object({
          version: z.string().min(1),
          effectiveFrom: z.string().min(1),
          effectiveTo: z.string().optional(),
          text: z.string().min(1)
        })
      )
      .min(1)
  })
});

export async function registerLawRoutes(
  app: FastifyInstance,
  deps: { requireAdmin: (req: FastifyRequest) => Promise<void> }
) {
  app.post('/v1/laws/ingest', async (req, reply) => {
    await deps.requireAdmin(req);
    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_law', details: parsed.error.flatten() });
    }

    const { jurisdiction, law } = parsed.data;
    await query(
      'INSERT INTO jurisdictions (code, name) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name',
      [jurisdiction.code, jurisdiction.name]
    );

    const lawRows = await query<{ id: string }>(
      `INSERT INTO laws (jurisdiction_code, topic, title, summary)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [jurisdiction.code, law.topic, law.title, law.summary || null]
    );

    for (const version of law.versions) {
      await query(
        `INSERT INTO law_versions (law_id, version, effective_from, effective_to, text)
         VALUES ($1,$2,$3,$4,$5)`,
        [lawRows[0].id, version.version, version.effectiveFrom, version.effectiveTo || null, version.text]
      );
    }

    return reply.status(201).send({ lawId: lawRows[0].id, versions: law.versions.length });
  });

  app.get('/v1/laws', async (req, reply) => {
    const { jurisdiction, topic } = req.query as { jurisdiction?: string; topic?: string };
    const filters: string[] = [];
    const values: unknown[] = [];
    if (jurisdiction) {
      values.push(jurisdiction);
      filters.push(`jurisdiction_code = $${values.length}`);
    }
    if (topic) {
      values.push(topic);
      filters.push(`topic = $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const laws = await query<{ id: string; jurisdiction_code: string; topic: string; title: string; summary: string | null }>(
      `SELECT id, jurisdiction_code, topic, title, summary FROM laws ${where} ORDER BY created_at DESC`,
      values
    );

    const enriched = [] as Array<Record<string, unknown>>;
    for (const law of laws) {
      const versions = await query<{ version: string; effective_from: string; effective_to: string | null; text: string }>(
        'SELECT version, effective_from, effective_to, text FROM law_versions WHERE law_id = $1 ORDER BY effective_from DESC',
        [law.id]
      );
      enriched.push({ ...law, versions });
    }

    return reply.send({ laws: enriched });
  });

  app.get('/v1/predictions', async (req, reply) => {
    const { jurisdiction, topic } = req.query as { jurisdiction?: string; topic?: string };
    const filters: string[] = [];
    const values: unknown[] = [];
    if (jurisdiction) {
      values.push(jurisdiction);
      filters.push(`jurisdiction = $${values.length}`);
    }
    if (topic) {
      values.push(topic);
      filters.push(`topic = $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = await query(
      `SELECT id, jurisdiction, topic, risk_delta, summary, features, created_at FROM compliance_predictions ${where} ORDER BY created_at DESC LIMIT 100`,
      values
    );
    return reply.send({ predictions: rows });
  });
}
