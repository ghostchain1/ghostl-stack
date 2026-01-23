import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import type { ApiError } from '../../../src/lib/api';
import { fetchPil, recommendationsResponseSchema } from '../../../src/lib/pil-client';

export default async function ProtocolRecommendationsPage() {
  const recommendationsRes = await fetchPil('/v1/recommendations', recommendationsResponseSchema);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!recommendationsRes.ok) {
    errors.push({ title: 'Recommendations', error: { ...recommendationsRes.error, endpoint: '/v1/recommendations', method: 'GET' } });
  }

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        <div className="card">
          <h2>Recommendations</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Summary</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recommendationsRes.ok && recommendationsRes.data.recommendations.length > 0 ? (
                  recommendationsRes.data.recommendations.map((rec) => (
                    <tr key={rec.id}>
                      <td>{rec.summary}</td>
                      <td>{rec.recommendation_type}</td>
                      <td>{rec.status}</td>
                      <td>{rec.confidence}</td>
                      <td>{new Date(rec.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="muted">No recommendations generated yet.</td>
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
