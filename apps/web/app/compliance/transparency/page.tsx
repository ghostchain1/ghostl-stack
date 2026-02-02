import { z } from 'zod';
import type { ApiError } from '../../../src/lib/api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import { resolveComplianceBase } from '../../../src/lib/runtime';
import { bundleSchema, lawSchema, predictionSchema } from '../../../src/lib/compliance-client';

const activeBundleSchema = z.object({ bundle: bundleSchema });
const policiesSchema = z.object({
  bundles: z.array(
    z.object({
      id: z.string(),
      bundle_id: z.string(),
      version: z.string(),
      status: z.string(),
      created_at: z.string(),
      activated_at: z.string().nullable()
    })
  )
});
const lawsSchema = z.object({ laws: z.array(lawSchema) });
const predictionsSchema = z.object({ predictions: z.array(predictionSchema) });

type FetchResult<T> = { data?: T; error?: string };

const fetchPublic = async <T,>(path: string, schema: z.ZodSchema<T>): Promise<FetchResult<T>> => {
  const url = `${resolveComplianceBase()}${path}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return { error: `${path} failed: HTTP ${res.status}` };
    }
    const payload = await res.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return { error: `${path} failed: invalid_response_shape` };
    }
    return { data: parsed.data };
  } catch (err) {
    return { error: `${path} failed: ${err instanceof Error ? err.message : 'network_error'}` };
  }
};

export default async function ComplianceTransparencyPage() {
  const [activeRes, policiesRes, lawsRes, predictionsRes] = await Promise.all([
    fetchPublic('/v1/policies/active', activeBundleSchema),
    fetchPublic('/v1/policies', policiesSchema),
    fetchPublic('/v1/laws', lawsSchema),
    fetchPublic('/v1/predictions', predictionsSchema)
  ]);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (activeRes.error) {
    errors.push({ title: 'Active policy bundle', error: { message: activeRes.error, endpoint: '/v1/policies/active', method: 'GET' } });
  }
  if (policiesRes.error) {
    errors.push({ title: 'Policy bundles', error: { message: policiesRes.error, endpoint: '/v1/policies', method: 'GET' } });
  }
  if (lawsRes.error) {
    errors.push({ title: 'Laws', error: { message: lawsRes.error, endpoint: '/v1/laws', method: 'GET' } });
  }
  if (predictionsRes.error) {
    errors.push({ title: 'Predictions', error: { message: predictionsRes.error, endpoint: '/v1/predictions', method: 'GET' } });
  }

  const activeBundle = activeRes.data?.bundle;
  const bundles = policiesRes.data?.bundles || [];
  const laws = lawsRes.data?.laws || [];
  const predictions = predictionsRes.data?.predictions || [];

  const artifacts = [
    {
      title: 'Constitution status',
      path: 'docs/ghostchain/charter.md',
      detail: 'Clause summary and amendment log'
    },
    {
      title: 'Supply and burn ledger',
      path: 'docs/ghostchain/burn_reconciliation_report.md',
      detail: 'L1/L2/L3 reconciliation'
    },
    {
      title: 'Governance proposals and votes',
      path: 'docs/ghostchain/ratification-package.md',
      detail: 'Proposal registry and votes'
    },
    {
      title: 'Sequencer revenue and slashing',
      path: 'docs/ghostchain/sequencer_payout_proof.md',
      detail: 'Revenue routing evidence'
    },
    {
      title: 'ZK proof verification panel',
      path: 'docs/ghostchain/ledger_verification_guide.md',
      detail: 'Proof verification workflow'
    },
    {
      title: 'Evidence pack downloads',
      path: 'docs/ghostchain/regulator-whitepaper.md',
      detail: 'Evidence manifest and regulator notes'
    }
  ];

  return (
    <div className="content">
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Transparency Portal (Regulator Mode)</div>
        <div className="muted">
          Read-only transparency views derived from deterministic sources. Live compliance metadata is pulled from the compliance service.
        </div>
      </div>
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Live compliance metadata</div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <div className="badge">Active bundle: {activeBundle?.metadata.version || 'n/a'}</div>
              <div className="badge">Bundles tracked: {bundles.length}</div>
              <div className="badge">Laws tracked: {laws.length}</div>
              <div className="badge">Predictions: {predictions.length}</div>
            </div>
            {!activeBundle && <div className="muted">No active bundle published.</div>}
          </div>
        </div>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Regulator artifacts</div>
          <div className="stack" style={{ gap: 8 }}>
            {artifacts.map((item) => (
              <div key={item.title} className="stack" style={{ gap: 4 }}>
                <div>{item.title}</div>
                <div className="muted">{item.detail}</div>
                <div className="mono muted">{item.path}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Access notes</div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="muted">Audit decisions and evidence bundles remain protected by analyst/admin policy.</div>
            <div className="muted">For deeper access, use governance-approved analyst tokens and the compliance console.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
