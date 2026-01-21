import { fetchJson, bundleSchema } from '../../../lib/compliance-client';
import { PolicyBundleViewer } from '../../../components/compliance/PolicyBundleViewer';
import { z } from 'zod';

const activeSchema = z.object({ bundle: bundleSchema });

export default async function PoliciesPage() {
  const res = await fetchJson('/v1/policies/active', activeSchema);

  return (
    <div className="content">
      {res.error && <div className="card">Error: {res.error}</div>}
      {res.data?.bundle && <PolicyBundleViewer bundle={res.data.bundle} />}
      {!res.data?.bundle && !res.error && <div className="card">No active bundle.</div>}
    </div>
  );
}
