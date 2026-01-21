import { fetchJson, predictionSchema } from '../../../lib/compliance-client';
import { PredictionCards } from '../../../components/compliance/PredictionCards';
import { z } from 'zod';

const predictionsSchema = z.object({ predictions: z.array(predictionSchema) });

export default async function PredictionsPage() {
  const res = await fetchJson('/v1/predictions', predictionsSchema);

  return (
    <div className="content">
      {res.error && <div className="card">Error: {res.error}</div>}
      <PredictionCards predictions={res.data?.predictions || []} />
    </div>
  );
}
