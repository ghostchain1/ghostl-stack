'use client';

import React, { useCallback, useEffect, useState } from 'react';

/* ── types (portal-side, matches AEE /status shape) ─────────────────────────── */

interface TreasuryState {
  walletAddress: string;
  balanceGst:    number;
  blockNumber:   number;
  ts:            number;
}

interface Allocation {
  operationsGst: number;
  validatorsGst: number;
  liquidityGst:  number;
  reserveGst:    number;
  operations:    number;
  validators:    number;
  liquidity:     number;
  reserve:       number;
}

interface MarketMetrics {
  tpsAvg:               number;
  tpsPeak:              number;
  blockTimeAvgMs:       number;
  treasuryFlowGstPerMin: number;
  ts:                   number;
}

interface EconomicForecast {
  projectedTps:               number;
  projectedTreasuryGst:       number;
  projectedParticipationRate: number;
  inflationRatePctPerYear:    number;
  recommendBurn:              boolean;
  recommendMoreValidators:    boolean;
  confidence:                 number;
  horizonMinutes:             number;
}

interface ValidatorMetrics {
  activeCount:       number;
  jailedCount:       number;
  totalBondedGst:    number;
  participationRate: number;
}

interface AeeStatus {
  running:     boolean;
  dryRun:      boolean;
  totalCycles: number;
  errors:      number;
  proposals:   number;
  lastCycleMs: number | null;
  uptime:      number;
  treasury:    TreasuryState | null;
  allocation:  Allocation | null;
  market:      MarketMetrics | null;
  forecast:    EconomicForecast | null;
  validators:  ValidatorMetrics | null;
}

interface Proposal {
  id:        string;
  ts:        number;
  target:    string;
  action:    string;
  amountGst?: number;
  reason:    string;
  advisory:  true;
}

/* ── helpers ────────────────────────────────────────────────────────────────── */

async function fetchAee<T>(view: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/economic?view=${view}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function gst(val: number | null | undefined): string {
  if (val == null) return '—';
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M GST`;
  if (val >= 1_000)     return `${(val / 1_000).toFixed(1)}K GST`;
  return `${val.toFixed(0)} GST`;
}

function pct(val: number): string { return `${(val * 100).toFixed(1)}%`; }

function fmtMs(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/* ── component ──────────────────────────────────────────────────────────────── */

export function EconomicPage() {
  const [status, setStatus]       = useState<AeeStatus | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [lastPoll, setLastPoll]   = useState<Date | null>(null);

  const poll = useCallback(async () => {
    const s = await fetchAee<AeeStatus>('status');
    if (s) setStatus(s);
    setLastPoll(new Date());
    setLoading(false);
  }, []);

  const pollProposals = useCallback(async () => {
    const p = await fetchAee<{ proposals: Proposal[] }>('proposals');
    if (p?.proposals) setProposals(p.proposals.slice(0, 20));
  }, []);

  useEffect(() => {
    void poll();
    void pollProposals();
    const t1 = setInterval(poll, 30_000);
    const t2 = setInterval(pollProposals, 60_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [poll, pollProposals]);

  const treasury  = status?.treasury  ?? null;
  const alloc     = status?.allocation ?? null;
  const market    = status?.market    ?? null;
  const forecast  = status?.forecast  ?? null;
  const validators = status?.validators ?? null;

  return (
    <div className="space-y-8 p-6">
      {/* header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Autonomous Economic Engine</h1>
          <p className="mt-1 text-sm text-gray-400">
            Treasury intelligence, GST burn mechanics, validator rewards &amp; yield optimization.
          </p>
        </div>
        <div className="text-right text-xs text-gray-500">
          {lastPoll ? `Last updated: ${lastPoll.toLocaleTimeString()}` : 'Loading…'}
          {status?.dryRun && (
            <span className="ml-3 rounded bg-amber-800/40 px-2 py-0.5 text-amber-300">DRY-RUN</span>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400">Connecting to Economic Engine…</p>}

      {!loading && !status && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 p-4 text-sm text-red-300">
          AEE service is offline. Start it with{' '}
          <code className="font-mono text-red-200">cd services/ghost-economic-ai && npm start</code>
        </div>
      )}

      {/* system health tiles */}
      {status && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile label="Status"    value={status.running ? 'Running' : 'Stopped'}
                accent={status.running ? 'green' : 'red'} />
          <Tile label="Cycles"   value={String(status.totalCycles)} />
          <Tile label="Proposals" value={String(status.proposals)} />
          <Tile label="Last Cycle" value={fmtMs(status.lastCycleMs)} />
        </div>
      )}

      {/* treasury */}
      {treasury && (
        <Section title="Treasury">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Tile label="Balance"    value={gst(treasury.balanceGst)}   accent="green" />
            <Tile label="Operations" value={gst(alloc?.operationsGst)} />
            <Tile label="Validators" value={gst(alloc?.validatorsGst)} />
            <Tile label="Liquidity"  value={gst(alloc?.liquidityGst)}  />
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Allocation: Ops {pct(alloc?.operations ?? 0)} | Validators {pct(alloc?.validators ?? 0)} |
            Liquidity {pct(alloc?.liquidity ?? 0)} | Reserve {pct(alloc?.reserve ?? 0)}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-gray-600">
            Wallet: {treasury.walletAddress || '—'}
          </p>
        </Section>
      )}

      {/* market + validators row */}
      <div className="grid gap-6 md:grid-cols-2">
        {market && (
          <Section title="Market Metrics">
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Avg TPS"      value={market.tpsAvg.toFixed(2)} />
              <Tile label="Peak TPS"     value={market.tpsPeak.toFixed(2)} />
              <Tile label="Block Time"   value={fmtMs(market.blockTimeAvgMs)} />
              <Tile label="Treasury Flow"
                    value={`${market.treasuryFlowGstPerMin >= 0 ? '+' : ''}${market.treasuryFlowGstPerMin.toFixed(1)} GST/min`}
                    accent={market.treasuryFlowGstPerMin >= 0 ? 'green' : 'amber'} />
            </div>
          </Section>
        )}
        {validators && (
          <Section title="Validator Network">
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Active"        value={String(validators.activeCount)} accent="green" />
              <Tile label="Jailed"        value={String(validators.jailedCount)}
                    accent={validators.jailedCount > 0 ? 'red' : 'green'} />
              <Tile label="Participation" value={pct(validators.participationRate)}
                    accent={validators.participationRate >= 0.8 ? 'green' : 'amber'} />
              <Tile label="Bonded GST"    value={gst(validators.totalBondedGst)} />
            </div>
          </Section>
        )}
      </div>

      {/* economic forecast */}
      {forecast && (
        <Section title="Economic Forecast (60 min horizon)">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Tile label="Proj. TPS"    value={forecast.projectedTps.toFixed(1)} />
            <Tile label="Proj. Treasury" value={gst(forecast.projectedTreasuryGst)} />
            <Tile label="Inflation / yr" value={`${forecast.inflationRatePctPerYear.toFixed(2)}%`}
                  accent={forecast.inflationRatePctPerYear > 15 ? 'amber' : 'green'} />
            <Tile label="Confidence"   value={pct(forecast.confidence)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {forecast.recommendBurn && (
              <RecoTag color="amber">⚠ Burn recommended — high TPS projected</RecoTag>
            )}
            {forecast.recommendMoreValidators && (
              <RecoTag color="red">⚠ More validators needed — participation dropping</RecoTag>
            )}
            {!forecast.recommendBurn && !forecast.recommendMoreValidators && (
              <RecoTag color="green">✓ Economic parameters within target range</RecoTag>
            )}
          </div>
        </Section>
      )}

      {/* proposals */}
      {proposals.length > 0 && (
        <Section title="Advisory Proposals (last 20)">
          <p className="mb-3 text-xs text-gray-500">
            All proposals require signing-relay ratification before any on-chain action.
          </p>
          <div className="space-y-2">
            {proposals.map((p) => (
              <div key={p.id}
                   className="flex flex-col gap-1 rounded border border-gray-700/60
                              bg-gray-800/40 p-3 text-sm sm:flex-row sm:items-center sm:gap-4">
                <span className="font-mono text-xs text-gray-400">
                  {new Date(p.ts).toLocaleString()}
                </span>
                <span className="rounded bg-indigo-900/50 px-2 py-0.5 text-xs text-indigo-300">
                  {p.target}
                </span>
                <span className="text-gray-300">{p.reason}</span>
                {p.amountGst != null && (
                  <span className="ml-auto text-xs text-emerald-400">{gst(p.amountGst)}</span>
                )}
                <span className="rounded bg-yellow-900/40 px-2 py-0.5 text-xs text-yellow-300">
                  advisory
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <p className="text-xs text-gray-600">
        AEE is read-only from this portal. All treasury operations require governance ratification
        via the signing relay (port 7910). AI proposes; humans execute.
      </p>
    </div>
  );
}

/* ── sub-components ─────────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-300">{title}</h2>
      {children}
    </div>
  );
}

function Tile({ label, value, accent }: {
  label: string; value: string; accent?: 'green' | 'red' | 'amber';
}) {
  const color = accent === 'green' ? 'text-green-400'
    : accent === 'red'   ? 'text-red-400'
    : accent === 'amber' ? 'text-amber-400'
    : 'text-white';
  return (
    <div className="rounded-lg border border-gray-700/40 bg-gray-800/50 p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${color} leading-tight`}>{value}</p>
    </div>
  );
}

function RecoTag({ color, children }: { color: 'green' | 'amber' | 'red'; children: React.ReactNode }) {
  const cls = color === 'green' ? 'bg-green-900/40 text-green-300'
    : color === 'amber' ? 'bg-amber-900/40 text-amber-300'
    : 'bg-red-900/40 text-red-300';
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}
