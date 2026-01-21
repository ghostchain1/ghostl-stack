import { fetchJson, decisionSchema, evidenceSchema } from '../../../lib/compliance-client';
import { EvidenceViewer } from '../../../components/compliance/EvidenceViewer';
import { z } from 'zod';

const decisionsSchema = z.object({ decisions: z.array(decisionSchema) });
const evidenceResponseSchema = z.object({ evidence: evidenceSchema });

export default async function EvidencePage() {
  const decisionsRes = await fetchJson('/v1/audit/decisions?limit=5', decisionsSchema);
  const evidenceId = decisionsRes.data?.decisions[0]?.evidence_bundle_id;
  const evidenceRes = evidenceId
    ? await fetchJson(`/v1/audit/evidence/${evidenceId}`, evidenceResponseSchema)
    : { data: undefined, error: evidenceId ? undefined : 'no_evidence_found' };

  return (
    <div className="content">
      {decisionsRes.error && <div className="card">Decisions error: {decisionsRes.error}</div>}
      {evidenceRes.error && <div className="card">Evidence error: {evidenceRes.error}</div>}
      <EvidenceViewer evidence={evidenceRes.data?.evidence} />
    </div>
  );
}
