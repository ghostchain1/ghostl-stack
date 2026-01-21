import { fetchJson, bundleSchema } from '../../../lib/compliance-client';
import { z } from 'zod';

const activeSchema = z.object({ bundle: bundleSchema });

export default async function ControlsPage() {
  const res = await fetchJson('/v1/policies/active', activeSchema);
  const controlIds = new Set<string>();
  res.data?.bundle.policies.forEach((policy) => {
    const effect = policy.effect as { require?: { controls?: string[] } } | undefined;
    effect?.require?.controls?.forEach((control) => controlIds.add(control));
  });
  const controls = Array.from(controlIds);

  return (
    <div className="content">
      <div className="card">
        <h3>Required Controls</h3>
        {res.error && <div className="muted">Error: {res.error}</div>}
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
  );
}
