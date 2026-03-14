import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import type { ApiError } from '../../../src/lib/api';
import { fetchPil, simulationsResponseSchema } from '../../../src/lib/pil-client';

export default async function ProtocolSimulationsPage() {
  const simulationsRes = await fetchPil('/v1/simulations', simulationsResponseSchema);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!simulationsRes.ok) {
    errors.push({ title: 'Simulations', error: { ...simulationsRes.error, endpoint: '/v1/simulations', method: 'GET' } });
  }

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        <div className="card">
          <h2>Protocol Simulations</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Chain</th>
                  <th>Horizon</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {simulationsRes.ok && simulationsRes.data.simulations.length > 0 ? (
                  simulationsRes.data.simulations.map((sim) => (
                    <tr key={sim.id}>
                      <td className="mono">{sim.id.slice(0, 10)}…</td>
                      <td>{sim.chain_id}</td>
                      <td>{sim.horizon}</td>
                      <td>{sim.status}</td>
                      <td>{new Date(sim.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="muted">No simulations recorded yet.</td>
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
