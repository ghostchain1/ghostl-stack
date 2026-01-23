import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import type { ApiError } from '../../../src/lib/api';
import { fetchPil, jurisdictionsResponseSchema, legalSignalsResponseSchema } from '../../../src/lib/pil-client';

export default async function ProtocolRiskPage() {
  const [jurRes, signalsRes] = await Promise.all([
    fetchPil('/v1/jurisdictions', jurisdictionsResponseSchema),
    fetchPil('/v1/legal-signals', legalSignalsResponseSchema)
  ]);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!jurRes.ok) {
    errors.push({ title: 'Jurisdictions', error: { ...jurRes.error, endpoint: '/v1/jurisdictions', method: 'GET' } });
  }
  if (!signalsRes.ok) {
    errors.push({ title: 'Legal signals', error: { ...signalsRes.error, endpoint: '/v1/legal-signals', method: 'GET' } });
  }

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        <div className="card">
          <h2>Jurisdiction Risk Profile</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Region</th>
                  <th>Risk Tier</th>
                </tr>
              </thead>
              <tbody>
                {jurRes.ok && jurRes.data.jurisdictions.length > 0 ? (
                  jurRes.data.jurisdictions.map((jur) => (
                    <tr key={jur.code}>
                      <td className="mono">{jur.code}</td>
                      <td>{jur.name}</td>
                      <td>{jur.region}</td>
                      <td>{jur.riskTier}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="muted">No jurisdiction data available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>Legal Signals</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Jurisdiction</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Confidence</th>
                  <th>Detected</th>
                </tr>
              </thead>
              <tbody>
                {signalsRes.ok && signalsRes.data.signals.length > 0 ? (
                  signalsRes.data.signals.map((signal) => (
                    <tr key={signal.id}>
                      <td>{signal.jurisdictionCode}</td>
                      <td>{signal.category}</td>
                      <td>{signal.severity}</td>
                      <td>{signal.confidence.toFixed(2)}</td>
                      <td>{new Date(signal.detectedAt).toLocaleDateString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="muted">No legal signals ingested yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
