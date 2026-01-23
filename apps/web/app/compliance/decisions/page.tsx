import { fetchJson, decisionSchema } from '../../../src/lib/compliance-client';
import { DecisionTable } from '../../../src/components/compliance/DecisionTable';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import type { ApiError } from '../../../src/lib/api';
import { z } from 'zod';

const decisionsSchema = z.object({ decisions: z.array(decisionSchema) });

export default async function DecisionsPage() {
  const res = await fetchJson('/v1/audit/decisions?limit=50', decisionsSchema);
  const errors: ApiError[] = res.error
    ? [{ message: res.error, endpoint: '/v1/audit/decisions?limit=50', method: 'GET' }]
    : [];

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((error, idx) => (
          <DataFetchErrorCard key={`decisions-${idx}`} title="Decisions" error={error} />
        ))}
        <DecisionTable decisions={res.data?.decisions || []} />
      </div>
    </div>
  );
}
