import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import type { ApiError } from '../../../src/lib/api';
import { fetchPil, policyPacksResponseSchema } from '../../../src/lib/pil-client';

export default async function ProtocolGovernancePage() {
  const [allRes, activeRes] = await Promise.all([
    fetchPil('/v1/policy-packs', policyPacksResponseSchema),
    fetchPil('/v1/policy-packs/active', policyPacksResponseSchema)
  ]);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!allRes.ok) {
    errors.push({ title: 'Policy packs', error: { ...allRes.error, endpoint: '/v1/policy-packs', method: 'GET' } });
  }
  if (!activeRes.ok) {
    errors.push({ title: 'Active policy packs', error: { ...activeRes.error, endpoint: '/v1/policy-packs/active', method: 'GET' } });
  }

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        <div className="card">
          <h2>Policy Packs</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Jurisdiction</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Effective</th>
                </tr>
              </thead>
              <tbody>
                {allRes.ok && allRes.data.policyPacks.length > 0 ? (
                  allRes.data.policyPacks.map((pack) => (
                    <tr key={pack.id}>
                      <td>{pack.jurisdictionCode}</td>
                      <td>{pack.version}</td>
                      <td>{pack.status}</td>
                      <td>{pack.confidenceScore}</td>
                      <td>{new Date(pack.effectiveFrom).toLocaleDateString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="muted">No policy packs created yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>Active Packs</h3>
          <div className="stack" style={{ gap: 8 }}>
            {activeRes.ok && activeRes.data.policyPacks.length > 0 ? (
              activeRes.data.policyPacks.map((pack) => (
                <div key={pack.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <div className="badge">{pack.jurisdictionCode}</div>
                  <div className="muted">{pack.version}</div>
                  <div className="muted">Confidence {pack.confidenceScore}</div>
                </div>
              ))
            ) : (
              <div className="muted">No active packs.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
