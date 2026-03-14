import { z } from 'zod';
import type { ApiError } from '../../../src/lib/api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import { fetchJson, bundleSchema } from '../../../src/lib/compliance-client';

const activeSchema = z.object({ bundle: bundleSchema });

export default async function ControlsPage() {
  const res = await fetchJson('/v1/policies/active', activeSchema);
  const controlIds = new Set<string>();
  res.data?.bundle.policies.forEach((policy) => {
    const effect = policy.effect as { require?: { controls?: string[] } } | undefined;
    effect?.require?.controls?.forEach((control) => controlIds.add(control));
  });
  const controls = Array.from(controlIds);
  const errors: ApiError[] = res.error
    ? [{ message: res.error, endpoint: '/v1/policies/active', method: 'GET' }]
    : [];

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((error, idx) => (
          <DataFetchErrorCard key={`controls-${idx}`} title="Controls" error={error} />
        ))}
        <div className="card">
          <h3>Required Controls</h3>
          <ul>
            {controls.map((control) => (
              <li key={control} className="muted">
                {control}
              </li>
            ))}
          </ul>
          {!controls.length && !res.error && <div className="muted">No controls defined.</div>}
        </div>
      </div>
    </div>
  );
}
