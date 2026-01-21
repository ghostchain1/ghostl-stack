import { fetchJson, bundleSchema, lawSchema, predictionSchema, decisionSchema } from '../../../lib/compliance-client';
import { z } from 'zod';

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

  return (
    <div className="content">
      <div className="card">
        <h2>Compliance Overview</h2>
        <div className="filter-row">
          <div className="badge">Decisions: {decisionsRes.data?.decisions.length ?? 0}</div>
          <div className="badge">Laws: {lawsRes.data?.laws.length ?? 0}</div>
          <div className="badge">Predictions: {predictionsRes.data?.predictions.length ?? 0}</div>
          <div className="badge">Active bundle: {bundleRes.data?.bundle.metadata.version || 'n/a'}</div>
        </div>
        {(decisionsRes.error || lawsRes.error || predictionsRes.error || bundleRes.error) && (
          <div className="muted" style={{ marginTop: 12 }}>
            {decisionsRes.error && `Decisions error: ${decisionsRes.error}. `}
            {lawsRes.error && `Laws error: ${lawsRes.error}. `}
            {predictionsRes.error && `Predictions error: ${predictionsRes.error}. `}
            {bundleRes.error && `Bundle error: ${bundleRes.error}.`}
          </div>
        )}
      </div>
    </div>
  );
}
