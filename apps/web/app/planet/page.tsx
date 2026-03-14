'use client';

import { useEffect, useState } from 'react';

// ── Types mirrored from service (JSON-serialised bigints → strings) ───────────

type RegionStatus = 'healthy' | 'degraded' | 'critical' | 'offline';

interface RegionHealth {
  regionId: string;
  status: RegionStatus;
  activeValidators: number;
  totalValidators: number;
  latencyMs: number;
  blockHeight: number;
}

interface ConsensusSnapshot {
  totalNodes: number;
  onlineNodes: number;
  offlineNodes: number;
  satelliteNodes: number;
  globalParticipationPct: number;
  pendingSyncs: Array<{
    nodeId: string;
    regionId: string;
    chainId: number;
    blocksToSync: number;
    estimatedSyncMs: number;
  }>;
}

interface MeshImbalance {
  surplus: string;
  deficit: string;
  chainId: number;
  deltaGst: string;
  imbalancePct: number;
}

interface LiquidityMeshSnapshot {
  totalGstLocked: string;
  globalUtilisation: number;
  imbalances: MeshImbalance[];
}

interface PlanetProposalLight {
  id: string;
  type: string;
  description: string;
  urgency: string;
}

interface RebalanceAction {
  from: string;
  to: string;
  chainId: number;
  amountGst: string;
  priority: string;
}

interface AISyncEvent {
  eventId: string;
  originRegion: string;
  eventType: string;
  ts: number;
}

interface PlanetStatus {
  cycleAt: number;
  regions: RegionHealth[];
  consensus: ConsensusSnapshot;
  liquidityMesh: LiquidityMeshSnapshot;
  pendingRebalances: RebalanceAction[];
  activeProposals: number;
  recentEvents: AISyncEvent[];
  dryRun: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(s: RegionStatus): string {
  if (s === 'healthy')  return '#22c55e';
  if (s === 'degraded') return '#f59e0b';
  if (s === 'critical') return '#ef4444';
  return '#6b7280';
}

function participationColor(pct: number): string {
  if (pct >= 80) return '#22c55e';
  if (pct >= 67) return '#f59e0b';
  return '#ef4444';
}

function shortGst(raw: string): string {
  try {
    const val = BigInt(raw);
    const gst = Number(val) / 1e18;
    if (gst >= 1_000_000) return `${(gst / 1_000_000).toFixed(2)}M GST`;
    if (gst >= 1_000)     return `${(gst / 1_000).toFixed(2)}k GST`;
    return `${gst.toFixed(4)} GST`;
  } catch {
    return raw;
  }
}

function chainLabel(id: number): string {
  if (id === 901)      return 'L2';
  if (id === 903)      return 'L3';
  return 'L1';
}

function urgencyBadge(u: string): string {
  if (u === 'critical') return '#ef4444';
  if (u === 'high')     return '#f59e0b';
  if (u === 'medium')   return '#6366f1';
  return '#6b7280';
}

// ── Page component ────────────────────────────────────────────────────────────

export default function PlanetPage() {
  const [status, setStatus] = useState<PlanetStatus | 'loading' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch('/api/planet/status');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as PlanetStatus;
        if (active) setStatus(data);
      } catch {
        if (active) setStatus('error');
      }
    }
    poll();
    const id = setInterval(poll, 15_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (status === 'loading') return <div style={styles.centered}>Connecting to Planet-Scale Architecture…</div>;
  if (status === 'error')   return <div style={styles.centered}>GhostBrain Planet service offline — retrying every 15 s</div>;

  const { regions, consensus, liquidityMesh, pendingRebalances, activeProposals, recentEvents, cycleAt, dryRun } = status;
  const healthyRegions  = regions.filter((r) => r.status === 'healthy').length;
  const offlineRegions  = regions.filter((r) => r.status === 'offline').length;

  return (
    <div style={styles.page}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🌍 GhostBrain Planet-Scale Architecture</h1>
          <p style={styles.subtitle}>
            Multi-region validator coordination, offline consensus nodes, global GST liquidity mesh, inter-chain AI — Phase 101
          </p>
        </div>
        <div style={styles.meta}>
          {dryRun && <span style={styles.dryRunBadge}>DRY RUN</span>}
          <span style={styles.timestamp}>
            Last cycle: {new Date(cycleAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Summary strip */}
      <div style={styles.strip}>
        <StatPill label="Regions healthy"         value={`${healthyRegions}/${regions.length}`} color={healthyRegions === regions.length ? '#22c55e' : '#f59e0b'} />
        <StatPill label="Regions offline"         value={String(offlineRegions)}                  color={offlineRegions > 0 ? '#ef4444' : '#22c55e'} />
        <StatPill label="Consensus nodes"         value={`${consensus.onlineNodes}/${consensus.totalNodes}`} color={participationColor(consensus.globalParticipationPct)} />
        <StatPill label="Participation"           value={`${consensus.globalParticipationPct}%`}  color={participationColor(consensus.globalParticipationPct)} />
        <StatPill label="GST locked (global)"     value={shortGst(liquidityMesh.totalGstLocked)} color="#a78bfa" />
        <StatPill label="Proposals this cycle"    value={String(activeProposals)}                 color={activeProposals > 0 ? '#f59e0b' : '#6b7280'} />
      </div>

      {/* Region grid */}
      <Section title="Regional Validator Status">
        <div style={styles.regionGrid}>
          {regions.map((r) => (
            <div key={r.regionId} style={{ ...styles.regionCard, borderColor: statusColor(r.status) }}>
              <div style={{ ...styles.regionBadge, background: statusColor(r.status) }}>{r.status}</div>
              <div style={styles.regionName}>{r.regionId}</div>
              <div style={styles.regionStat}>Validators: {r.activeValidators}/{r.totalValidators}</div>
              <div style={styles.regionStat}>Latency: {r.latencyMs} ms</div>
              <div style={styles.regionStat}>Block: {r.blockHeight.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Consensus */}
      <Section title="Consensus Nodes">
        <div style={styles.twoCol}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Global Participation</h3>
            <div style={{ fontSize: 40, fontWeight: 700, color: participationColor(consensus.globalParticipationPct) }}>
              {consensus.globalParticipationPct}%
            </div>
            <div style={styles.dimText}>BFT safety floor: 67%</div>
            <div style={styles.dimText}>Satellite nodes: {consensus.satelliteNodes}</div>
            <div style={styles.dimText}>Offline nodes: {consensus.offlineNodes}</div>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Sync Backlog ({consensus.pendingSyncs.length})</h3>
            {consensus.pendingSyncs.length === 0 ? (
              <div style={styles.dimText}>All nodes in sync ✓</div>
            ) : (
              <table style={styles.table}>
                <thead><tr>
                  <th style={styles.th}>Node</th><th style={styles.th}>Region</th>
                  <th style={styles.th}>Chain</th><th style={styles.th}>Behind</th>
                  <th style={styles.th}>Est.</th>
                </tr></thead>
                <tbody>
                  {consensus.pendingSyncs.slice(0, 8).map((s) => (
                    <tr key={s.nodeId}>
                      <td style={styles.td}>{s.nodeId.slice(0, 10)}</td>
                      <td style={styles.td}>{s.regionId}</td>
                      <td style={styles.td}>{chainLabel(s.chainId)}</td>
                      <td style={styles.td}>{s.blocksToSync.toLocaleString()}</td>
                      <td style={styles.td}>{Math.round(s.estimatedSyncMs / 1_000)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Section>

      {/* Liquidity Mesh */}
      <Section title="Global Liquidity Mesh">
        <div style={styles.twoCol}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Mesh Overview</h3>
            <div style={styles.statRow}><span style={styles.statLabel}>Total GST locked</span><span>{shortGst(liquidityMesh.totalGstLocked)}</span></div>
            <div style={styles.statRow}><span style={styles.statLabel}>Global utilisation</span><span>{(liquidityMesh.globalUtilisation * 100).toFixed(1)}%</span></div>
            <div style={styles.statRow}><span style={styles.statLabel}>Imbalances detected</span><span style={{ color: liquidityMesh.imbalances.length > 0 ? '#f59e0b' : '#22c55e' }}>{liquidityMesh.imbalances.length}</span></div>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Pending Rebalances ({pendingRebalances.length})</h3>
            {pendingRebalances.length === 0 ? (
              <div style={styles.dimText}>Mesh balanced ✓</div>
            ) : (
              <table style={styles.table}>
                <thead><tr>
                  <th style={styles.th}>From</th><th style={styles.th}>To</th>
                  <th style={styles.th}>Chain</th><th style={styles.th}>Amount</th>
                  <th style={styles.th}>Priority</th>
                </tr></thead>
                <tbody>
                  {pendingRebalances.slice(0, 6).map((r, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{r.from}</td>
                      <td style={styles.td}>{r.to}</td>
                      <td style={styles.td}>{chainLabel(r.chainId)}</td>
                      <td style={styles.td}>{shortGst(r.amountGst)}</td>
                      <td style={{ ...styles.td, color: r.priority === 'high' ? '#ef4444' : r.priority === 'medium' ? '#f59e0b' : '#6b7280' }}>{r.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Section>

      {/* AI Sync Bus events */}
      <Section title="AI Sync Bus — Recent Events">
        {recentEvents.length === 0 ? (
          <div style={styles.dimText}>No events yet</div>
        ) : (
          <table style={{ ...styles.table, width: '100%' }}>
            <thead><tr>
              <th style={styles.th}>Event</th><th style={styles.th}>Origin</th>
              <th style={styles.th}>Type</th><th style={styles.th}>Time</th>
            </tr></thead>
            <tbody>
              {recentEvents.slice(-15).reverse().map((e) => (
                <tr key={e.eventId}>
                  <td style={styles.td}>{e.eventId.slice(0, 8)}</td>
                  <td style={styles.td}>{e.originRegion}</td>
                  <td style={styles.td}>{e.eventType}</td>
                  <td style={styles.td}>{new Date(e.ts).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={styles.pill}>
      <div style={{ ...styles.pillValue, color }}>{value}</div>
      <div style={styles.pillLabel}>{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page:        { fontFamily: 'monospace', background: '#09090b', color: '#f4f4f5', minHeight: '100vh', padding: '24px 32px' },
  centered:    { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#a1a1aa' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title:       { fontSize: 26, fontWeight: 700, margin: 0, color: '#e4e4e7' },
  subtitle:    { fontSize: 13, color: '#71717a', marginTop: 6 },
  meta:        { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' },
  timestamp:   { fontSize: 12, color: '#52525b' },
  dryRunBadge: { background: '#854d0e', color: '#fef3c7', fontSize: 11, padding: '2px 8px', borderRadius: 4 },
  strip:       { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 },
  pill:        { background: '#18181b', border: '1px solid #27272a', borderRadius: 8, padding: '12px 18px', minWidth: 140 },
  pillValue:   { fontSize: 22, fontWeight: 700 },
  pillLabel:   { fontSize: 11, color: '#71717a', marginTop: 4 },
  section:     { marginBottom: 36 },
  sectionTitle:{ fontSize: 16, fontWeight: 600, color: '#a1a1aa', marginBottom: 14, borderBottom: '1px solid #27272a', paddingBottom: 6 },
  regionGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 },
  regionCard:  { background: '#18181b', border: '2px solid', borderRadius: 8, padding: 14, position: 'relative' },
  regionBadge: { position: 'absolute', top: 8, right: 8, fontSize: 10, color: '#09090b', fontWeight: 700, padding: '2px 6px', borderRadius: 4 },
  regionName:  { fontWeight: 700, fontSize: 14, marginBottom: 8 },
  regionStat:  { fontSize: 12, color: '#a1a1aa', marginBottom: 3 },
  twoCol:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  card:        { background: '#18181b', border: '1px solid #27272a', borderRadius: 10, padding: '16px 20px' },
  cardTitle:   { fontSize: 14, fontWeight: 600, color: '#e4e4e7', marginBottom: 12, marginTop: 0 },
  dimText:     { color: '#71717a', fontSize: 13 },
  statRow:     { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #27272a' },
  statLabel:   { color: '#a1a1aa' },
  table:       { borderCollapse: 'collapse', fontSize: 12, width: '100%' },
  th:          { textAlign: 'left', color: '#52525b', padding: '4px 8px', borderBottom: '1px solid #27272a', fontWeight: 600 },
  td:          { padding: '4px 8px', borderBottom: '1px solid #1c1c1e', color: '#d4d4d8' },
};
