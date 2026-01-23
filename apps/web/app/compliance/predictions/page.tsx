import { z } from 'zod';
import type { ApiError } from '../../../src/lib/api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import { PredictionCards } from '../../../src/components/compliance/PredictionCards';
import { fetchJson, predictionSchema } from '../../../src/lib/compliance-client';

const predictionsSchema = z.object({ predictions: z.array(predictionSchema) });

export default async function PredictionsPage() {
  const res = await fetchJson('/v1/predictions', predictionsSchema);
  const errors: ApiError[] = res.error ? [{ message: res.error, endpoint: '/v1/predictions', method: 'GET' }] : [];

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((error, idx) => (
          <DataFetchErrorCard key={`predictions-${idx}`} title="Predictions" error={error} />
        ))}
        <PredictionCards predictions={res.data?.predictions || []} />
      </div>
    </div>
  );
}
