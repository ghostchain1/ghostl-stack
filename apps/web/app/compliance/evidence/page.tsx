import { z } from 'zod';
import type { ApiError } from '../../../src/lib/api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import { EvidenceViewer } from '../../../src/components/compliance/EvidenceViewer';
import { fetchJson, decisionSchema, evidenceSchema } from '../../../src/lib/compliance-client';

const decisionsSchema = z.object({ decisions: z.array(decisionSchema) });
const evidenceResponseSchema = z.object({ evidence: evidenceSchema });

export default async function EvidencePage() {
  const decisionsRes = await fetchJson('/v1/audit/decisions?limit=5', decisionsSchema);
  const evidenceId = decisionsRes.data?.decisions[0]?.evidence_bundle_id;
  const evidenceRes = evidenceId
    ? await fetchJson(`/v1/audit/evidence/${evidenceId}`, evidenceResponseSchema)
    : { data: undefined, error: evidenceId ? undefined : 'no_evidence_found' };
  const errors: ApiError[] = [];
  if (decisionsRes.error) {
    errors.push({ message: decisionsRes.error, endpoint: '/v1/audit/decisions?limit=5', method: 'GET' });
  }
  if (evidenceRes.error) {
    errors.push({ message: evidenceRes.error, endpoint: `/v1/audit/evidence/${evidenceId ?? 'unknown'}`, method: 'GET' });
  }

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((error, idx) => (
          <DataFetchErrorCard key={`evidence-${idx}`} title="Evidence" error={error} />
        ))}
        <EvidenceViewer evidence={evidenceRes.data?.evidence} />
      </div>
    </div>
  );
}
