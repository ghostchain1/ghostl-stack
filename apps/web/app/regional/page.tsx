'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RegionMetrics {
  regionId: string;
  validatorLoad: number;
  rpcRequestsPerSec: number;
  latencyMs: number;
  activeValidators: number;
  totalValidators: number;
  onlinePct: number;
}

interface TrafficLoad {
  regionId: string;
  load: number;
  overflow: boolean;
  routeTo?: string;
}

interface ValidatorBalance {
  regionId: string;
  assigned: number;
  target: number;
  delta: number;
}

interface SecurityEvent {
  id: string;
  regionId: string;
  attackType: string;
  severity: string;
  detectedAt: number;
  description: string;
}

interface ScalingAction {
  regionId: string;
  layer: string;
  nodesRequested: number;
  reason: string;
  urgency: string;
}

interface GlobalStatus {
  cycleAt: number;
  totalNodes: number;
  activeRegions: number;
  validatorClusters: number;
  avgLatencyMs: number;
  regions: RegionMetrics[];
  trafficLoads: TrafficLoad[];
  validatorBalance: ValidatorBalance[];
  securityEvents: SecurityEvent[];
  scalingActions: ScalingAction[];
  activeProposals: number;
  dryRun: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadColor(pct: number): string {
  if (pct >= 90) return '#ef4444';
  if (pct >= 75) return '#f59e0b';
  return '#22c55e';
}

function severityColor(s: string): string {
  if (s === 'critical') return '#ef4444';
  if (s === 'high')     return '#f59e0b';
  if (s === 'medium')   return '#6366f1';
  return '#6b7280';
}

function regionLabel(id: string): string {
  if (id === 'north-america') return 'North America 🌎';
  if (id === 'europe')        return 'Europe 🌍';
  if (id === 'asia')          return 'Asia 🌏';
  return id;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RegionalPage() {
  const [status, setStatus] = useState<GlobalStatus | 'loading' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch('/api/regional/status');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as GlobalStatus;
        if (active) setStatus(data);
      } catch {
        if (active) setStatus('error');
      }
    }
    poll();
    const id = setInterval(poll, 10_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (status === 'loading') return <div style={styles.centered}>Connecting to Regional Controller…</div>;
  if (status === 'error')   return <div style={styles.centered}>Regional Controller offline — retrying every 10 s</div>;

  const { regions, trafficLoads, validatorBalance, securityEvents, scalingActions, cycleAt, dryRun,
          totalNodes, activeRegions, validatorClusters, avgLatencyMs, activeProposals } = status;

  return (
    <div style={styles.page}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🌐 GhostBrain Regional Control Layer</h1>
          <p style={styles.subtitle}>
            Global validator orchestration across North America · Europe · Asia — Phase 102
          </p>
        </div>
        <div style={styles.meta}>
          {dryRun && <span style={styles.dryBadge}>DRY RUN</span>}
          <span style={styles.ts}>Last cycle: {new Date(cycleAt).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* KPI strip — mirrors the Phase 113 monitoring spec */}
      <div style={styles.strip}>
        <Pill label="Global Nodes"       value={String(totalNodes)}          color="#a78bfa" />
        <Pill label="Regions Active"     value={`${activeRegions}/3`}        color={activeRegions === 3 ? '#22c55e' : '#f59e0b'} />
        <Pill label="Validator Clusters" value={String(validatorClusters)}   color="#38bdf8" />
        <Pill label="Avg Latency"        value={`${avgLatencyMs} ms`}        color={avgLatencyMs < 150 ? '#22c55e' : '#f59e0b'} />
        <Pill label="Security Events"    value={String(securityEvents.length)} color={securityEvents.length > 0 ? '#ef4444' : '#22c55e'} />
        <Pill label="Proposals"          value={String(activeProposals)}     color={activeProposals > 0 ? '#f59e0b' : '#6b7280'} />
      </div>

      {/* Region cards */}
      <Section title="Regional Validator Status">
        <div style={styles.regionGrid}>
          {regions.map((r) => {
            const traffic = trafficLoads.find((t) => t.regionId === r.regionId);
            const balance = validatorBalance.find((b) => b.regionId === r.regionId);
            return (
              <div key={r.regionId} style={styles.regionCard}>
                <h3 style={styles.regionTitle}>{regionLabel(r.regionId)}</h3>
                <Stat label="Validators"  value={`${r.activeValidators}/${r.totalValidators}`} />
                <Stat label="Load"        value={`${(r.validatorLoad * 100).toFixed(1)}%`} color={loadColor(r.validatorLoad * 100)} />
                <Stat label="RPC req/s"   value={r.rpcRequestsPerSec.toLocaleString()} />
                <Stat label="Latency"     value={`${r.latencyMs} ms`} />
                <Stat label="Online"      value={`${r.onlinePct}%`} color={r.onlinePct >= 90 ? '#22c55e' : '#f59e0b'} />
                {traffic?.overflow && (
                  <div style={styles.overflowBadge}>
                    ↔ Rerouting → {traffic.routeTo ?? 'none'}
                  </div>
                )}
                {balance && Math.abs(balance.delta) >= 2 && (
                  <div style={{ ...styles.deltaBadge, color: balance.delta > 0 ? '#f59e0b' : '#6b7280' }}>
                    {balance.delta > 0 ? `+${balance.delta}` : balance.delta} validators vs target
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Security events */}
      <Section title={`Security Mesh (${securityEvents.length} event${securityEvents.length !== 1 ? 's' : ''})`}>
        {securityEvents.length === 0 ? (
          <div style={styles.dim}>No security events detected ✓</div>
        ) : (
          <table style={styles.table}>
            <thead><tr>
              <th style={styles.th}>Region</th><th style={styles.th}>Type</th>
              <th style={styles.th}>Severity</th><th style={styles.th}>Description</th>
              <th style={styles.th}>Time</th>
            </tr></thead>
            <tbody>
              {securityEvents.map((e) => (
                <tr key={e.id}>
                  <td style={styles.td}>{e.regionId}</td>
                  <td style={styles.td}>{e.attackType}</td>
                  <td style={{ ...styles.td, color: severityColor(e.severity), fontWeight: 700 }}>{e.severity}</td>
                  <td style={styles.td}>{e.description}</td>
                  <td style={styles.td}>{new Date(e.detectedAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Scaling actions */}
      <Section title={`Global Scaling (${scalingActions.length} action${scalingActions.length !== 1 ? 's' : ''})`}>
        {scalingActions.length === 0 ? (
          <div style={styles.dim}>No scaling actions proposed ✓</div>
        ) : (
          <table style={styles.table}>
            <thead><tr>
              <th style={styles.th}>Region</th><th style={styles.th}>Layer</th>
              <th style={styles.th}>Nodes</th><th style={styles.th}>Urgency</th>
              <th style={styles.th}>Reason</th>
            </tr></thead>
            <tbody>
              {scalingActions.map((a, i) => (
                <tr key={i}>
                  <td style={styles.td}>{a.regionId}</td>
                  <td style={styles.td}>{a.layer}</td>
                  <td style={styles.td}>+{a.nodesRequested}</td>
                  <td style={{ ...styles.td, color: a.urgency === 'high' ? '#ef4444' : '#f59e0b' }}>{a.urgency}</td>
                  <td style={styles.td}>{a.reason}</td>
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

function Pill({ label, value, color = '#e4e4e7' }: { label: string; value: string; color?: string }) {
  return (
    <div style={styles.pill}>
      <div style={{ ...styles.pillVal, color }}>{value}</div>
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

function Stat({ label, value, color = '#d4d4d8' }: { label: string; value: string; color?: string }) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page:         { fontFamily: 'monospace', background: '#09090b', color: '#f4f4f5', minHeight: '100vh', padding: '24px 32px' },
  centered:     { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#a1a1aa' },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title:        { fontSize: 26, fontWeight: 700, margin: 0, color: '#e4e4e7' },
  subtitle:     { fontSize: 13, color: '#71717a', marginTop: 6 },
  meta:         { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' },
  ts:           { fontSize: 12, color: '#52525b' },
  dryBadge:     { background: '#854d0e', color: '#fef3c7', fontSize: 11, padding: '2px 8px', borderRadius: 4 },
  strip:        { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 },
  pill:         { background: '#18181b', border: '1px solid #27272a', borderRadius: 8, padding: '12px 18px', minWidth: 130 },
  pillVal:      { fontSize: 22, fontWeight: 700 },
  pillLabel:    { fontSize: 11, color: '#71717a', marginTop: 4 },
  section:      { marginBottom: 36 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: '#a1a1aa', marginBottom: 14, borderBottom: '1px solid #27272a', paddingBottom: 6 },
  regionGrid:   { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 },
  regionCard:   { background: '#18181b', border: '1px solid #27272a', borderRadius: 10, padding: '16px 20px' },
  regionTitle:  { fontSize: 15, fontWeight: 700, color: '#e4e4e7', marginBottom: 12, marginTop: 0 },
  statRow:      { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #1c1c1e' },
  statLabel:    { color: '#71717a' },
  overflowBadge:{ marginTop: 10, fontSize: 11, color: '#f59e0b', fontWeight: 700 },
  deltaBadge:   { marginTop: 4, fontSize: 11 },
  dim:          { color: '#71717a', fontSize: 13 },
  table:        { borderCollapse: 'collapse', width: '100%', fontSize: 12 },
  th:           { textAlign: 'left', color: '#52525b', padding: '5px 10px', borderBottom: '1px solid #27272a', fontWeight: 600 },
  td:           { padding: '5px 10px', borderBottom: '1px solid #1c1c1e', color: '#d4d4d8' },
};
