'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest, type ApiError } from '../../lib/api';
import { resolveApiBase } from '../../lib/runtime';
import { DataFetchErrorCard } from '../../components/DataFetchErrorCard';

type TreasuryStatus = {
  ok?: boolean;
  treasury?: {
    totalValueWei?: string;
    deployedCapitalWei?: string;
    yieldReturnedWei?: string;
    availableWei?: string;
    riskExposureBps?: number;
  };
  flags?: {
    emergencyHalt?: boolean;
    allocationPaused?: boolean;
    withdrawalFreeze?: boolean;
  };
};

type RevenueL3 = {
  ok?: boolean;
  totalWei?: string;
  eventCount?: number;
  bySource?: Array<{ source?: string; eventCount?: number; totalWei?: string }>;
};

type RevenueL2 = {
  ok?: boolean;
  totalWei?: string;
  liquidityFeeWei?: string;
  bridgeVolumeWei?: string;
  eventCount?: number;
  pendingCount?: number;
  recentBatches?: Array<{
    batch_id?: string;
    created_at?: string;
    event_count?: number;
    net_wei?: string;
    forward_status?: string;
  }>;
};

type AllocationHistory = {
  ok?: boolean;
  allocations?: Array<{
    allocationId?: string;
    governanceProposalId?: string;
    deployedAmountWei?: string;
    expectedApyBps?: number;
    riskScoreBps?: number;
    destinationType?: string;
    status?: string;
    createdAt?: string;
  }>;
};

type RewardCycles = {
  ok?: boolean;
  cycles?: Array<{
    cycleId?: string;
    governanceProposalId?: string;
    status?: string;
    netYieldWei?: string;
    executeAfter?: string;
  }>;
};

type FederationStatus = {
  ok?: boolean;
  policyVersion?: string | null;
  membersActive?: number;
  violationsTotal?: number;
  exposureByMember?: Array<{
    memberId?: string;
    policyVersion?: string;
    exposureWei?: string;
    updatedAt?: string;
  }>;
};

type SolvencyLatest = {
  ok?: boolean;
  latest?: {
    epoch?: number;
    assetsRoot?: string;
    liabilitiesRoot?: string;
    netPositionRoot?: string;
    solvent?: boolean;
    assetsTotalWei?: string;
    liabilitiesTotalWei?: string;
    createdAt?: string;
    artifactPath?: string;
  } | null;
};

const API_BASE = resolveApiBase();

const toEth = (wei?: string) => {
  const value = Number(wei || '0');
  if (!Number.isFinite(value)) return 0;
  return value / 1e18;
};

const fmtEth = (wei?: string) => `${toEth(wei).toFixed(4)} GST`;

const riskTone = (riskBps: number) => {
  if (riskBps >= 8000) return '#d14b4b';
  if (riskBps >= 6000) return '#c6891d';
  return '#1e8f6c';
};

export function SovereignEngineDashboard() {
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Array<{ title: string; error: ApiError }>>([]);
  const [treasury, setTreasury] = useState<TreasuryStatus>({});
  const [l3, setL3] = useState<RevenueL3>({});
  const [l2, setL2] = useState<RevenueL2>({});
  const [allocations, setAllocations] = useState<AllocationHistory>({});
  const [cycles, setCycles] = useState<RewardCycles>({});
  const [federation, setFederation] = useState<FederationStatus>({});
  const [solvency, setSolvency] = useState<SolvencyLatest>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const results = await Promise.all([
        apiRequest<TreasuryStatus>('/v1/api/treasury/status', { baseUrl: API_BASE }),
        apiRequest<RevenueL3>('/v1/api/revenue/l3', { baseUrl: API_BASE }),
        apiRequest<RevenueL2>('/v1/api/revenue/l2', { baseUrl: API_BASE }),
        apiRequest<AllocationHistory>('/v1/api/allocation/history', { baseUrl: API_BASE }),
        apiRequest<RewardCycles>('/v1/api/reward/cycles', { baseUrl: API_BASE }),
        apiRequest<FederationStatus>('/v1/api/federation/status', { baseUrl: API_BASE }),
        apiRequest<SolvencyLatest>('/v1/api/solvency/latest', { baseUrl: API_BASE })
      ]);

      if (!active) return;

      const nextErrors: Array<{ title: string; error: ApiError }> = [];
      if (!results[0].ok) nextErrors.push({ title: 'Treasury status', error: results[0].error });
      if (!results[1].ok) nextErrors.push({ title: 'L3 revenue', error: results[1].error });
      if (!results[2].ok) nextErrors.push({ title: 'L2 revenue', error: results[2].error });
      if (!results[3].ok) nextErrors.push({ title: 'Allocation history', error: results[3].error });
      if (!results[4].ok) nextErrors.push({ title: 'Reward cycles', error: results[4].error });
      if (!results[5].ok) nextErrors.push({ title: 'Federation status', error: results[5].error });
      if (!results[6].ok) nextErrors.push({ title: 'Solvency latest', error: results[6].error });

      setErrors(nextErrors);
      setTreasury(results[0].ok ? results[0].data : {});
      setL3(results[1].ok ? results[1].data : {});
      setL2(results[2].ok ? results[2].data : {});
      setAllocations(results[3].ok ? results[3].data : {});
      setCycles(results[4].ok ? results[4].data : {});
      setFederation(results[5].ok ? results[5].data : {});
      setSolvency(results[6].ok ? results[6].data : {});
      setLoading(false);
    };

    load().catch(() => {
      if (!active) return;
      setLoading(false);
    });

    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const bySource = l3.bySource || [];
  const l3Total = Math.max(1, ...bySource.map((entry) => toEth(entry.totalWei)));

  const l2Breakdown = useMemo(
    () => [
      { label: 'Total', wei: l2.totalWei || '0' },
      { label: 'LP Fees', wei: l2.liquidityFeeWei || '0' },
      { label: 'Bridge Volume', wei: l2.bridgeVolumeWei || '0' }
    ],
    [l2.totalWei, l2.liquidityFeeWei, l2.bridgeVolumeWei]
  );

  const l2Max = Math.max(1, ...l2Breakdown.map((entry) => toEth(entry.wei)));
  const riskExposureBps = Number(treasury.treasury?.riskExposureBps || 0);

  return (
    <>
      {errors.map((entry, idx) => (
        <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
      ))}

      <div className="card">
        <h3>Treasury dashboard</h3>
        <div className="kpi-grid" style={{ marginTop: 12 }}>
          <div className="kpi-card">
            <div className="muted">Total value</div>
            <div style={{ fontWeight: 700 }}>{fmtEth(treasury.treasury?.totalValueWei)}</div>
          </div>
          <div className="kpi-card">
            <div className="muted">Deployed capital</div>
            <div style={{ fontWeight: 700 }}>{fmtEth(treasury.treasury?.deployedCapitalWei)}</div>
          </div>
          <div className="kpi-card">
            <div className="muted">Available balance</div>
            <div style={{ fontWeight: 700 }}>{fmtEth(treasury.treasury?.availableWei)}</div>
          </div>
          <div className="kpi-card">
            <div className="muted">Risk exposure</div>
            <div style={{ fontWeight: 700, color: riskTone(riskExposureBps) }}>{(riskExposureBps / 100).toFixed(2)}%</div>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          Flags: emergency={String(Boolean(treasury.flags?.emergencyHalt))} · allocationPaused={String(Boolean(treasury.flags?.allocationPaused))} ·
          withdrawalFreeze={String(Boolean(treasury.flags?.withdrawalFreeze))}
        </div>
        {loading && <div className="muted" style={{ marginTop: 8 }}>Refreshing metrics...</div>}
      </div>

      <div className="card">
        <h3>L3 revenue live chart</h3>
        <div className="stack" style={{ marginTop: 12, gap: 10 }}>
          {bySource.map((entry) => {
            const value = toEth(entry.totalWei);
            const width = Math.max(4, Math.round((value / l3Total) * 100));
            return (
              <div key={entry.source}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{entry.source}</span>
                  <span className="muted">{value.toFixed(4)} GST · {entry.eventCount || 0} events</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${width}%`, background: 'linear-gradient(90deg,var(--accent),var(--accent-2))' }} />
                </div>
              </div>
            );
          })}
          {!bySource.length && <div className="muted">No L3 revenue data yet.</div>}
        </div>
      </div>

      <div className="card">
        <h3>L2 exchange revenue chart</h3>
        <div className="stack" style={{ marginTop: 12, gap: 10 }}>
          {l2Breakdown.map((entry) => {
            const value = toEth(entry.wei);
            const width = Math.max(4, Math.round((value / l2Max) * 100));
            return (
              <div key={entry.label}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{entry.label}</span>
                  <span className="muted">{value.toFixed(4)} GST</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${width}%`, background: 'linear-gradient(90deg,var(--accent-3),var(--accent))' }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          Pending deterministic batches: {l2.pendingCount || 0}
        </div>
      </div>

      <div className="card">
        <h3>Allocation history + governance linkouts</h3>
        <div className="stack" style={{ marginTop: 12, gap: 10 }}>
          {(allocations.allocations || []).slice(0, 8).map((entry) => (
            <div key={entry.allocationId} className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{entry.allocationId}</div>
                <div className="muted">
                  {fmtEth(entry.deployedAmountWei)} · APY {(Number(entry.expectedApyBps || 0) / 100).toFixed(2)}% · Risk {(Number(entry.riskScoreBps || 0) / 100).toFixed(2)}%
                </div>
                <div className="muted">{entry.destinationType} · {entry.status} · {entry.createdAt || 'n/a'}</div>
              </div>
              <a href={`/governance?proposal=${encodeURIComponent(entry.governanceProposalId || '')}`} className="muted" style={{ textDecoration: 'underline' }}>
                {entry.governanceProposalId || 'proposal'}
              </a>
            </div>
          ))}
          {!(allocations.allocations || []).length && <div className="muted">No allocations executed yet.</div>}
        </div>
      </div>

      <div className="card">
        <h3>ZK solvency</h3>
        {solvency.latest ? (
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <div className="muted">
              Epoch {solvency.latest.epoch} · Solvent: {String(Boolean(solvency.latest.solvent))}
            </div>
            <div className="muted">
              Assets: {fmtEth(solvency.latest.assetsTotalWei)} · Liabilities: {fmtEth(solvency.latest.liabilitiesTotalWei)}
            </div>
            <div className="muted" style={{ wordBreak: 'break-all' }}>
              Roots: {solvency.latest.assetsRoot} / {solvency.latest.liabilitiesRoot}
            </div>
            <div className="muted">{solvency.latest.createdAt}</div>
          </div>
        ) : (
          <div className="muted">No solvency snapshot published yet.</div>
        )}
      </div>

      <div className="card">
        <h3>Federation policy + exposure</h3>
        <div className="muted" style={{ marginTop: 8 }}>
          Policy: {federation.policyVersion || 'n/a'} · Active members: {federation.membersActive || 0} · Violations: {federation.violationsTotal || 0}
        </div>
        <div className="stack" style={{ marginTop: 12, gap: 10 }}>
          {(federation.exposureByMember || []).slice(0, 8).map((member) => (
            <div key={member.memberId} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{member.memberId}</span>
              <span className="muted">{fmtEth(member.exposureWei)} · {member.policyVersion}</span>
            </div>
          ))}
          {!(federation.exposureByMember || []).length && <div className="muted">No federated member exposure recorded yet.</div>}
        </div>
      </div>

      <div className="card">
        <h3>Yield performance + reward cycles</h3>
        <div className="stack" style={{ marginTop: 12, gap: 10 }}>
          {(cycles.cycles || []).slice(0, 8).map((cycle) => (
            <div key={cycle.cycleId} className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{cycle.cycleId}</div>
                <div className="muted">Net yield: {fmtEth(cycle.netYieldWei)} · Status: {cycle.status}</div>
                <div className="muted">Execute after: {cycle.executeAfter || 'n/a'}</div>
              </div>
              <a href={`/governance?proposal=${encodeURIComponent(cycle.governanceProposalId || '')}`} className="muted" style={{ textDecoration: 'underline' }}>
                {cycle.governanceProposalId || 'proposal'}
              </a>
            </div>
          ))}
          {!(cycles.cycles || []).length && <div className="muted">No reward cycles queued.</div>}
        </div>
      </div>
    </>
  );
}
