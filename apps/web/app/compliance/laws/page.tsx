import { z } from 'zod';
import type { ApiError } from '../../../src/lib/api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import { LawTimeline } from '../../../src/components/compliance/LawTimeline';
import { fetchJson, lawSchema } from '../../../src/lib/compliance-client';

const lawsSchema = z.object({ laws: z.array(lawSchema) });

export default async function LawsPage() {
  const res = await fetchJson('/v1/laws', lawsSchema);
  const errors: ApiError[] = res.error ? [{ message: res.error, endpoint: '/v1/laws', method: 'GET' }] : [];

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((error, idx) => (
          <DataFetchErrorCard key={`laws-${idx}`} title="Laws" error={error} />
        ))}
        <LawTimeline laws={res.data?.laws || []} />
      </div>
    </div>
  );
}
