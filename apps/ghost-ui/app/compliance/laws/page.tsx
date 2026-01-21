import { fetchJson, lawSchema } from '../../../lib/compliance-client';
import { LawTimeline } from '../../../components/compliance/LawTimeline';
import { z } from 'zod';

const lawsSchema = z.object({ laws: z.array(lawSchema) });

export default async function LawsPage() {
  const res = await fetchJson('/v1/laws', lawsSchema);

  return (
    <div className="content">
      {res.error && <div className="card">Error: {res.error}</div>}
      <LawTimeline laws={res.data?.laws || []} />
    </div>
  );
}
