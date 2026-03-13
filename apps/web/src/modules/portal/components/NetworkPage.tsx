'use client';

import React, { useCallback, useEffect, useState } from 'react';

/* ── types ─────────────────────────────────────────────────────────────────── */

interface GniStatus {
  running: boolean;
  dryRun: boolean;
  totalCycles: number;
  errors: number;
  proposals: number;
  lastCycleMs: number | null;
  uptime: number;
  topology: TopologySnap | null;
  forecast: ForecastSnap | null;
}

interface TopologySnap {
  ts: number;
  totalPeers: number;
  avgPeers: number;
  minPeers: number;
  unhealthyCount: number;
  nodes: NodeRow[];
  gaps: RegionGap[];
}

interface NodeRow {
  endpoint: string;
  chain: string;
  peers: number;
  healthy: boolean;
  latencyMs: number;
  region?: string;
}

interface RegionGap {
  region: string;
  current: number;
  required: number;
  deficit: number;
}

interface ForecastSnap {
  forecastedTps: number;
  forecastedPeers: number;
  confidence: number;
  recommendExpansion: boolean;
}

interface LatencyRow {
  endpoint: string;
  p50: number;
  p95: number;
  max: number;
  alert: boolean;
}

interface Proposal {
  id: string;
  ts: number;
  target: string;
  region: string;
  chain: string;
  reason: string;
  advisory: true;
}

/* ── helpers ────────────────────────────────────────────────────────────────── */

async function fetchGni<T>(view: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/gni?view=${view}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function ms(val: number | null): string {
  if (val === null) return '—';
  return `${val.toFixed(0)} ms`;
}

function pct(val: number): string {
  return `${(val * 100).toFixed(0)}%`;
}

/* ── component ──────────────────────────────────────────────────────────────── */

export function NetworkPage() {
  const [status, setStatus]     = useState<GniStatus | null>(null);
  const [latency, setLatency]   = useState<LatencyRow[] | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);

  const poll = useCallback(async () => {
    const [s, l] = await Promise.all([
      fetchGni<GniStatus>('status'),
      fetchGni<{ latency: LatencyRow[] }>('latency'),
    ]);
    if (s) setStatus(s);
    if (l?.latency) setLatency(l.latency);
    setLastPoll(new Date());
    setLoading(false);
  }, []);

  const pollProposals = useCallback(async () => {
    const p = await fetchGni<{ proposals: Proposal[] }>('regions');
    if (p?.proposals) setProposals(p.proposals.slice(0, 20));
  }, []);

  useEffect(() => {
    void poll();
    void pollProposals();
    const t1 = setInterval(poll, 30_000);
    const t2 = setInterval(pollProposals, 60_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [poll, pollProposals]);

  const topo    = status?.topology ?? null;
  const forecast = status?.forecast ?? null;

  return (
    <div className="space-y-8 p-6">
      {/* header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Global Network Intelligence</h1>
          <p className="mt-1 text-sm text-gray-400">
            Autonomous topology analysis, region gap detection, and expansion planning.
          </p>
        </div>
        <div className="text-right text-xs text-gray-500">
          {lastPoll ? `Last updated: ${lastPoll.toLocaleTimeString()}` : 'Loading…'}
          {status?.dryRun && (
            <span className="ml-3 rounded bg-amber-800/40 px-2 py-0.5 text-amber-300">
              DRY-RUN
            </span>
          )}
        </div>
      </div>

      {loading && (
        <p className="text-sm text-gray-400">Connecting to GNI service…</p>
      )}

      {/* status not available */}
      {!loading && !status && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 p-4 text-sm text-red-300">
          GNI service is offline or unreachable. Start it with{' '}
          <code className="font-mono text-red-200">
            cd services/ghost-global-intelligence && npm start
          </code>
        </div>
      )}

      {/* health tiles */}
      {status && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile label="Status"  value={status.running ? 'Running' : 'Stopped'}
                accent={status.running ? 'green' : 'red'} />
          <Tile label="Cycles"  value={String(status.totalCycles)} />
          <Tile label="Proposals" value={String(status.proposals)} />
          <Tile label="Errors"  value={String(status.errors)}
                accent={status.errors > 0 ? 'amber' : 'green'} />
        </div>
      )}

      {/* topology summary */}
      {topo && (
        <Section title="Network Topology">
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Tile label="Total Peers"  value={String(topo.totalPeers)} />
            <Tile label="Avg Peers"    value={topo.avgPeers.toFixed(1)} />
            <Tile label="Min Peers"    value={String(topo.minPeers)} />
            <Tile label="Unhealthy"    value={String(topo.unhealthyCount)}
                  accent={topo.unhealthyCount > 0 ? 'red' : 'green'} />
          </div>

          {/* region gaps */}
          {topo.gaps.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                Region Gaps
              </p>
              <div className="flex flex-wrap gap-2">
                {topo.gaps.map((g) => (
                  <span key={g.region}
                        className="rounded-full bg-red-900/40 px-3 py-1 text-xs text-red-300">
                    {g.region}: needs {g.deficit} more node{g.deficit > 1 ? 's' : ''}
                    {' '}({g.current}/{g.required})
                  </span>
                ))}
              </div>
            </div>
          )}
          {topo.gaps.length === 0 && (
            <p className="text-xs text-green-400">All region targets met.</p>
          )}

          {/* node table */}
          {topo.nodes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400">
                    <Th>Endpoint</Th>
                    <Th>Chain</Th>
                    <Th>Peers</Th>
                    <Th>Latency</Th>
                    <Th>Healthy</Th>
                  </tr>
                </thead>
                <tbody>
                  {topo.nodes.map((n) => (
                    <tr key={n.endpoint}
                        className="border-t border-gray-800 hover:bg-gray-800/30">
                      <Td mono>{n.endpoint}</Td>
                      <Td>{n.chain.toUpperCase()}</Td>
                      <Td>{n.peers}</Td>
                      <Td>{ms(n.latencyMs)}</Td>
                      <Td>
                        <Badge ok={n.healthy}>{n.healthy ? 'OK' : 'WARN'}</Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* load forecast */}
      {forecast && (
        <Section title="Load Forecast">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Tile label="Est. TPS"    value={forecast.forecastedTps.toFixed(1)} />
            <Tile label="Est. Peers"  value={String(Math.round(forecast.forecastedPeers))} />
            <Tile label="Confidence"  value={pct(forecast.confidence)} />
            <Tile label="Expand?"
                  value={forecast.recommendExpansion ? 'Yes' : 'No'}
                  accent={forecast.recommendExpansion ? 'amber' : 'green'} />
          </div>
          {forecast.recommendExpansion && (
            <p className="mt-3 text-xs text-amber-300">
              ⚠ Expansion recommended — a proposal will be submitted to the signing relay for
              human ratification.
            </p>
          )}
        </Section>
      )}

      {/* latency table */}
      {latency && latency.length > 0 && (
        <Section title="Node Latency">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400">
                  <Th>Endpoint</Th>
                  <Th>p50</Th>
                  <Th>p95</Th>
                  <Th>Max</Th>
                  <Th>Alert</Th>
                </tr>
              </thead>
              <tbody>
                {latency.map((row) => (
                  <tr key={row.endpoint}
                      className="border-t border-gray-800 hover:bg-gray-800/30">
                    <Td mono>{row.endpoint}</Td>
                    <Td>{ms(row.p50)}</Td>
                    <Td>{ms(row.p95)}</Td>
                    <Td>{ms(row.max)}</Td>
                    <Td>
                      <Badge ok={!row.alert}>{row.alert ? 'HIGH' : 'OK'}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* expansion proposals */}
      {proposals.length > 0 && (
        <Section title="Expansion Proposals (last 20)">
          <p className="mb-3 text-xs text-gray-500">
            All proposals are advisory — humans must ratify via the signing relay before
            any node or validator is deployed.
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
                  {p.target} · {p.region} · {p.chain.toUpperCase()}
                </span>
                <span className="text-gray-300">{p.reason}</span>
                <span className="ml-auto rounded bg-yellow-900/40 px-2 py-0.5 text-xs text-yellow-300">
                  advisory
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* governance note */}
      <p className="text-xs text-gray-600">
        GNI is read-only from this portal. All infrastructure changes require governance
        ratification via the signing relay at port 7910. AI may propose; only humans execute.
      </p>
    </div>
  );
}

/* ── sub-components ─────────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-300">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'green' | 'red' | 'amber';
}) {
  const color =
    accent === 'green' ? 'text-green-400'
    : accent === 'red' ? 'text-red-400'
    : accent === 'amber' ? 'text-amber-400'
    : 'text-white';
  return (
    <div className="rounded-lg border border-gray-700/40 bg-gray-800/50 p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="pb-2 pr-4 font-medium">{children}</th>;
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`py-2 pr-4 text-gray-300 ${mono ? 'font-mono text-xs' : ''}`}>
      {children}
    </td>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        ok
          ? 'bg-green-900/50 text-green-300'
          : 'bg-red-900/50 text-red-300'
      }`}
    >
      {children}
    </span>
  );
}
