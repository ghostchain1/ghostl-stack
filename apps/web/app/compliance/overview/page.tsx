import { z } from 'zod';
import type { ApiError } from '../../../src/lib/api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import { fetchJson, bundleSchema, lawSchema, predictionSchema, decisionSchema } from '../../../src/lib/compliance-client';

const decisionsSchema = z.object({ decisions: z.array(decisionSchema) });
const lawsSchema = z.object({ laws: z.array(lawSchema) });
const predictionsSchema = z.object({ predictions: z.array(predictionSchema) });
const activeBundleSchema = z.object({ bundle: bundleSchema });

export default async function ComplianceOverviewPage() {
  const [decisionsRes, lawsRes, predictionsRes, bundleRes] = await Promise.all([
    fetchJson('/v1/audit/decisions?limit=10', decisionsSchema),
    fetchJson('/v1/laws', lawsSchema),
    fetchJson('/v1/predictions', predictionsSchema),
    fetchJson('/v1/policies/active', activeBundleSchema)
  ]);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (decisionsRes.error) {
    errors.push({ title: 'Decisions', error: { message: decisionsRes.error, endpoint: '/v1/audit/decisions?limit=10', method: 'GET' } });
  }
  if (lawsRes.error) {
    errors.push({ title: 'Laws', error: { message: lawsRes.error, endpoint: '/v1/laws', method: 'GET' } });
  }
  if (predictionsRes.error) {
    errors.push({ title: 'Predictions', error: { message: predictionsRes.error, endpoint: '/v1/predictions', method: 'GET' } });
  }
  if (bundleRes.error) {
    errors.push({ title: 'Policy bundle', error: { message: bundleRes.error, endpoint: '/v1/policies/active', method: 'GET' } });
  }

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        <div className="card">
          <h2>Compliance Overview</h2>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="badge">Decisions: {decisionsRes.data?.decisions.length ?? 0}</div>
            <div className="badge">Laws: {lawsRes.data?.laws.length ?? 0}</div>
            <div className="badge">Predictions: {predictionsRes.data?.predictions.length ?? 0}</div>
            <div className="badge">Active bundle: {bundleRes.data?.bundle.metadata.version || 'n/a'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
