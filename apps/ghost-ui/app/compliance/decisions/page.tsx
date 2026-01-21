import { fetchJson, decisionSchema } from '../../../lib/compliance-client';
import { DecisionTable } from '../../../components/compliance/DecisionTable';
import { z } from 'zod';

const decisionsSchema = z.object({ decisions: z.array(decisionSchema) });

export default async function DecisionsPage() {
  const res = await fetchJson('/v1/audit/decisions?limit=50', decisionsSchema);

  return (
    <div className="content">
      {res.error && <div className="card">Error: {res.error}</div>}
      <DecisionTable decisions={res.data?.decisions || []} />
    </div>
  );
}
