'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { ApiError } from '../../../../../src/lib/api';
import { DataFetchErrorCard } from '../../../../../src/components/DataFetchErrorCard';
import { hgopRequest } from '../../../../../src/modules/hyperghost/hgopApi';

type FixRow = {
  fix_id: string;
  rank: number;
  description: string;
  diff_summary: string;
  risk_score: number;
  blast_radius: 'low' | 'med' | 'high';
  uncertainty: number;
  expected_benefit: number;
  required_gates: string;
  score: number;
  rollback_plan_json: unknown;
  verification_steps_json: unknown;
};

type ProposalDetailResponse = {
  ok: boolean;
  proposal: { proposal_id: string; status: string; created_ts: number; incident_id: string; signatures_json: unknown };
  incident: { incident_id: string; scope: string; severity: string; title: string; status: string; ts: number } | null;
  evidence: unknown[];
  fixes: FixRow[];
};

export default function HyperghostProposalDetailPage() {
  const params = useParams();
  const id = String((params as any)?.id || '');
  const [data, setData] = useState<ProposalDetailResponse | null>(null);
  const [errors, setErrors] = useState<Array<{ title: string; error: ApiError }>>([]);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<{ manifestHash?: string; proposalId?: string } | null>(null);

  const downloads = useMemo(() => {
    const propId = data?.proposal?.proposal_id || id;
    if (!propId) return [];
    const base = `/api/hyperghost/artifacts/cmf/${propId}`;
    return [
      { label: 'change-manifest.json', href: `${base}/change-manifest.json` },
      { label: 'evidence-bundle.json', href: `${base}/evidence-bundle.json` },
      { label: 'governance/manifest_hash.json', href: `${base}/governance/manifest_hash.json` },
      { label: 'governance/activate_gip_calldata.json', href: `${base}/governance/activate_gip_calldata.json` },
      { label: 'governance/toggle_proofmode_calldata.json', href: `${base}/governance/toggle_proofmode_calldata.json` },
      { label: 'governance/federation_registry_update_calldata.json', href: `${base}/governance/federation_registry_update_calldata.json` },
      { label: 'governance/pause_domain_calldata.json', href: `${base}/governance/pause_domain_calldata.json` },
      { label: 'governance/unresolved_fields.json', href: `${base}/governance/unresolved_fields.json` }
    ];
  }, [data, id]);

  useEffect(() => {
    const load = async () => {
      const res = await hgopRequest<ProposalDetailResponse>(`/proposals/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setErrors([{ title: 'HGOP proposal', error: res.error }]);
        return;
      }
      setErrors([]);
      setData(res.data);
    };
    if (id) load().catch(() => undefined);
  }, [id]);

  return (
    <div className="content">
      <div className="spread" style={{ alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Proposal</div>
          <div className="muted">{id}</div>
        </div>
        <div className="inline-form" style={{ gap: 8 }}>
          <Link className="button secondary" href="/ai/hyperghost/proposals">
            Back
          </Link>
          <Link className="button secondary" href="/ai/hyperghost/incidents">
            Incidents
          </Link>
        </div>
      </div>

      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        {actionError && <DataFetchErrorCard title="Action" error={actionError} />}

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          {!data ? (
            <div className="muted">Loading...</div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <div className="spread">
                <span className="muted">Status</span>
                <strong>{data.proposal.status}</strong>
              </div>
              <div className="spread">
                <span className="muted">Created</span>
                <strong>{new Date(data.proposal.created_ts * 1000).toISOString()}</strong>
              </div>
              {data.incident && (
                <>
                  <div className="spread">
                    <span className="muted">Incident</span>
                    <Link href={`/ai/hyperghost/incidents/${data.incident.incident_id}`}>{data.incident.incident_id}</Link>
                  </div>
                  <div className="spread">
                    <span className="muted">Scope</span>
                    <strong>{data.incident.scope}</strong>
                  </div>
                  <div className="spread">
                    <span className="muted">Severity</span>
                    <strong>{data.incident.severity}</strong>
                  </div>
                </>
              )}
              <div className="inline-form" style={{ gap: 8, marginTop: 8 }}>
                <button
                  className="button"
                  type="button"
                  disabled={busy || !data}
                  onClick={async () => {
                    if (!data) return;
                    setBusy(true);
                    setActionError(null);
                    const res = await hgopRequest<{ ok: boolean; proposalId: string; manifestHash: string }>(
                      `/proposals/${encodeURIComponent(data.proposal.proposal_id)}/submit-governance`,
                      { init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) } }
                    );
                    setBusy(false);
                    if (!res.ok) {
                      setActionError(res.error);
                      return;
                    }
                    setSubmitted({ proposalId: res.data.proposalId, manifestHash: res.data.manifestHash });
                  }}
                >
                  {busy ? 'Generating...' : 'Generate Governance Bundle'}
                </button>
                <Link className="button secondary" href="/ai/hyperghost/metrics">
                  Metrics
                </Link>
              </div>
              {submitted && (
                <div className="muted" style={{ marginTop: 6 }}>
                  Bundle ready: proposal={submitted.proposalId} manifestHash={submitted.manifestHash}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Ranked Fixes</div>
          {!data ? (
            <div className="muted">Loading...</div>
          ) : !data.fixes?.length ? (
            <div className="muted">No fixes.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th align="right">Rank</th>
                    <th align="left">Fix</th>
                    <th align="left">Risk</th>
                    <th align="left">Blast</th>
                    <th align="right">Score</th>
                    <th align="left">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fixes
                    .slice()
                    .sort((a, b) => a.rank - b.rank)
                    .map((f) => (
                      <tr key={f.fix_id}>
                        <td align="right">{f.rank}</td>
                        <td>{f.fix_id}</td>
                        <td>{f.risk_score}</td>
                        <td>{f.blast_radius}</td>
                        <td align="right">{f.score}</td>
                        <td className="muted">{f.description}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Artifact Downloads</div>
          <div className="muted" style={{ marginBottom: 8 }}>
            Files are generated by the supervisor under `/var/lib/ghost/hgop/CMF/&lt;proposal_id&gt;/` inside the container.
          </div>
          <div className="stack" style={{ gap: 6 }}>
            {downloads.map((d) => (
              <a key={d.href} className="muted" href={d.href} target="_blank" rel="noreferrer">
                {d.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

