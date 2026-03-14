'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ApiError } from '../../../../src/lib/api';
import { DataFetchErrorCard } from '../../../../src/components/DataFetchErrorCard';
import { hgopRequest } from '../../../../src/modules/hyperghost/hgopApi';

type ProposalRow = {
  proposal_id: string;
  incident_id: string;
  created_ts: number;
  status: string;
  incident?: { env?: string; scope?: string; severity?: string };
};

type ProposalsResponse = { ok: boolean; proposals: ProposalRow[] };

export default function HyperghostProposalsPage() {
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [errors, setErrors] = useState<Array<{ title: string; error: ApiError }>>([]);

  useEffect(() => {
    const load = async () => {
      const res = await hgopRequest<ProposalsResponse>('/proposals');
      if (!res.ok) {
        setErrors([{ title: 'HGOP proposals', error: res.error }]);
        return;
      }
      setErrors([]);
      setProposals(res.data.proposals || []);
    };
    load().catch(() => undefined);
  }, []);

  return (
    <div className="content">
      <div className="spread" style={{ alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Proposals</div>
          <div className="muted">Ranked fix bundles (proposal-first)</div>
        </div>
        <div className="inline-form" style={{ gap: 8 }}>
          <Link className="button secondary" href="/ai/hyperghost">
            Overview
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

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          {!proposals.length ? (
            <div className="muted">No proposals found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th align="left">ID</th>
                    <th align="left">Status</th>
                    <th align="left">Incident scope</th>
                    <th align="left">Severity</th>
                    <th align="right">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((p) => (
                    <tr key={p.proposal_id}>
                      <td>
                        <Link href={`/ai/hyperghost/proposals/${p.proposal_id}`}>{p.proposal_id}</Link>
                      </td>
                      <td>{p.status}</td>
                      <td>{p.incident?.scope || p.incident_id}</td>
                      <td>{p.incident?.severity || ''}</td>
                      <td align="right" className="muted">
                        {new Date(p.created_ts * 1000).toISOString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

