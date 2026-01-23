import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import type { ApiError } from '../../../src/lib/api';
import { fetchPil, legalSignalsResponseSchema, metricsSummarySchema } from '../../../src/lib/pil-client';

export default async function ProtocolSecurityPage() {
  const [signalsRes, metricsRes] = await Promise.all([
    fetchPil('/v1/legal-signals', legalSignalsResponseSchema),
    fetchPil('/v1/metrics/summary', metricsSummarySchema)
  ]);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!signalsRes.ok) {
    errors.push({ title: 'Legal signals', error: { ...signalsRes.error, endpoint: '/v1/legal-signals', method: 'GET' } });
  }
  if (!metricsRes.ok) {
    errors.push({ title: 'Metrics', error: { ...metricsRes.error, endpoint: '/v1/metrics/summary', method: 'GET' } });
  }

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        <div className="card">
          <h2>Security Signals</h2>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div className="badge">Decisions logged: {metricsRes.ok ? metricsRes.data.totals.complianceDecisions : '0'}</div>
          </div>
        </div>
        <div className="card">
          <h3>Active Legal Signals</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Jurisdiction</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {signalsRes.ok && signalsRes.data.signals.length > 0 ? (
                  signalsRes.data.signals.map((signal) => (
                    <tr key={signal.id}>
                      <td>{signal.jurisdictionCode}</td>
                      <td>{signal.category}</td>
                      <td>{signal.severity}</td>
                      <td>{signal.summary}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="muted">No active signals.</td>
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
