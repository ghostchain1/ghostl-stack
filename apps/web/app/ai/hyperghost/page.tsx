'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ApiError } from '../../../src/lib/api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import { hgopRequest } from '../../../src/modules/hyperghost/hgopApi';
import { ApprovalTokenPanel } from '../../../src/modules/hyperghost/components/ApprovalTokenPanel';

type StatusResponse = {
  ok: boolean;
  env: string;
  gates: Record<string, unknown>;
  openIncidents: Record<string, number>;
  failedProbes: number;
  riskScore: number;
  lastSnapshotHash: string | null;
  probes: Array<{ probe: string; ok: boolean; latency_ms: number; reason?: string; ts: number }>;
};

export default function HyperghostOverviewPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [errors, setErrors] = useState<Array<{ title: string; error: ApiError }>>([]);

  useEffect(() => {
    const load = async () => {
      const nextErrors: Array<{ title: string; error: ApiError }> = [];
      const statusRes = await hgopRequest<StatusResponse>('/status');
      if (!statusRes.ok) nextErrors.push({ title: 'HGOP status', error: statusRes.error });
      else setStatus(statusRes.data);
      setErrors(nextErrors);
    };
    load().catch(() => undefined);
  }, []);

  return (
    <div className="content">
      <div className="spread" style={{ alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Hyper Ghost Supervisor</div>
          <div className="muted">HGOP v1.0 | L1 - L2 - L3 probes + incident DB + ranked fix proposals</div>
        </div>
        <div className="inline-form" style={{ gap: 10 }}>
          <Link className="button secondary" href="/ai/hyperghost/incidents">
            Incidents
          </Link>
          <Link className="button secondary" href="/ai/hyperghost/proposals">
            Proposals
          </Link>
          <Link className="button secondary" href="/ai/hyperghost/health">
            Health
          </Link>
          <Link className="button secondary" href="/ai/hyperghost/metrics">
            Metrics
          </Link>
          <Link className="button secondary" href="/ai/hyperghost/ghostdns">
            GhostDNS
          </Link>
          <Link className="button secondary" href="/ai/governor">
            AI Governor
          </Link>
        </div>
      </div>

      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}

        <ApprovalTokenPanel />

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Summary</div>
          {!status ? (
            <div className="muted">Loading...</div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <div className="spread">
                <span className="muted">Env</span>
                <strong>{status.env}</strong>
              </div>
              <div className="spread">
                <span className="muted">Risk</span>
                <strong>{status.riskScore}/100</strong>
              </div>
              <div className="spread">
                <span className="muted">Open incidents</span>
                <strong>{Object.values(status.openIncidents || {}).reduce((a, b) => a + b, 0)}</strong>
              </div>
              <div className="spread">
                <span className="muted">Failed probes</span>
                <strong>{status.failedProbes}</strong>
              </div>
              <div className="spread">
                <span className="muted">Last snapshot</span>
                <strong>{status.lastSnapshotHash || 'none'}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Gate State</div>
          {!status ? (
            <div className="muted">Loading...</div>
          ) : (
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(status.gates, null, 2)}</pre>
          )}
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Latest Probes</div>
          {!status ? (
            <div className="muted">Loading...</div>
          ) : status.probes?.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th align="left">Probe</th>
                    <th align="left">OK</th>
                    <th align="right">Latency (ms)</th>
                    <th align="left">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {status.probes.slice(0, 20).map((p) => (
                    <tr key={`${p.probe}-${p.ts}`}>
                      <td>{p.probe}</td>
                      <td>{p.ok ? 'yes' : 'no'}</td>
                      <td align="right">{Math.round(p.latency_ms)}</td>
                      <td className="muted">{p.reason || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted">No probes recorded yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
