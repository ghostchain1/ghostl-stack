import { z } from 'zod';
import type { ApiError } from '../../../src/lib/api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import { PolicyBundleViewer } from '../../../src/components/compliance/PolicyBundleViewer';
import { fetchJson, bundleSchema } from '../../../src/lib/compliance-client';

const activeSchema = z.object({ bundle: bundleSchema });

export default async function PoliciesPage() {
  const res = await fetchJson('/v1/policies/active', activeSchema);
  const errors: ApiError[] = res.error
    ? [{ message: res.error, endpoint: '/v1/policies/active', method: 'GET' }]
    : [];

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((error, idx) => (
          <DataFetchErrorCard key={`policies-${idx}`} title="Active policies" error={error} />
        ))}
        {res.data?.bundle && <PolicyBundleViewer bundle={res.data.bundle} />}
        {!res.data?.bundle && !res.error && <div className="card">No active bundle.</div>}
      </div>
    </div>
  );
}
