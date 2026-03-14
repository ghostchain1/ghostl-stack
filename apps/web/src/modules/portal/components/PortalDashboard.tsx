'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type ChainCard = { id: string; label: string; chainId: number; status: 'ok' | 'degraded' | 'unknown'; blockNumber?: number };
type QuickStats = { validatorsActive: number; nodesOnline: number; containersRunning: number; vmsActive: number; treasuryBalance: string; aiStatus: string };
type NocAlert = { id: string; type: string; target: string; severity: string; timestamp: string };
type NocStatus = { status: string; alertsTotal: number; recentAlerts: NocAlert[] };

const SECTION: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 14,
};

const CARD: React.CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '18px 20px',
  display: 'flex', flexDirection: 'column', gap: 8,
};

const GRID2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14,
};

const GRID3: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14,
};

const GRID4: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14,
};

function Dot({ ok }: { ok: boolean | 'unknown' }) {
  const bg = ok === true ? '#22c55e' : ok === false ? '#ef4444' : '#6b7280';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: bg, flexShrink: 0 }} />;
}

export function PortalDashboard() {
  const [chains, setChains] = useState<ChainCard[]>([
    { id: 'l1', label: 'GhostChain L1', chainId: 14000101, status: 'unknown' },
    { id: 'l2', label: 'GhostL2',       chainId: 901,      status: 'unknown' },
    { id: 'l3', label: 'GhostL3',       chainId: 903,      status: 'unknown' },
  ]);
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [noc, setNoc] = useState<NocStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      // Chain health
      const chainResults = await Promise.all(
        ['l1', 'l2', 'l3'].map(async (chain, i) => {
          const label = ['GhostChain L1', 'GhostL2', 'GhostL3'][i]!;
          const chainId = [14000101, 901, 903][i]!;
          try {
            const res = await fetch(`/api/command-center/chain-health?chain=${chain}`, { cache: 'no-store' });
            const json = await res.json() as { status?: string; blockNumber?: number };
            return { id: chain, label, chainId, status: json.status === 'ok' ? 'ok' as const : 'degraded' as const, blockNumber: json.blockNumber };
          } catch {
            return { id: chain, label, chainId, status: 'degraded' as const };
          }
        })
      );

      // Quick stats: validators + nodes
      const [valRes, nodeRes, containerRes, aiRes, treasuryRes] = await Promise.allSettled([
        fetch('/api/command-center/validators', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/command-center/nodes', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/docker/containers', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/ai', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/command-center/treasury', { cache: 'no-store' }).then(r => r.json()),
      ]);

      const valData = valRes.status === 'fulfilled' ? valRes.value as { activeCount?: number } : null;
      const nodeData = nodeRes.status === 'fulfilled' ? nodeRes.value as { nodes?: Array<{ status: string }> } : null;
      const containerData = containerRes.status === 'fulfilled' ? containerRes.value as { running?: number; total?: number } : null;
      const aiData = aiRes.status === 'fulfilled' ? aiRes.value as { status?: string } : null;
      const treasuryData = treasuryRes.status === 'fulfilled' ? treasuryRes.value as { balanceFormatted?: string } : null;

      // NOC AI status
      const nocRes = await fetch('/api/portal/noc', { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<NocStatus> : null).catch(() => null);

      if (!cancelled) {
        setChains(chainResults);
        setStats({
          validatorsActive: valData?.activeCount ?? 0,
          nodesOnline:      (nodeData?.nodes ?? []).filter((n: { status: string }) => n.status === 'online').length,
          containersRunning: containerData?.running ?? 0,
          vmsActive:        0,
          treasuryBalance:  treasuryData?.balanceFormatted ?? '—',
          aiStatus:         aiData?.status ?? 'unknown',
        });
        setNoc(nocRes);
      }
    }

    void poll();
    const id = setInterval(() => { void poll(); }, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div style={SECTION}>
      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>GhostStack Control Portal</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
          Universal management — L1 · L2 · L3 · Validators · Nodes · Docker · Hypervisor · AI · Treasury
        </p>
      </div>

      {/* Chain health */}
      <div style={GRID3}>
        {chains.map((c) => (
          <Link key={c.id} href={`/portal/chains`} style={{ textDecoration: 'none' }}>
            <div style={{ ...CARD, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</span>
                <Dot ok={c.status === 'ok' ? true : c.status === 'degraded' ? false : 'unknown'} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>chain {c.chainId}</div>
              {c.blockNumber !== undefined && (
                <div style={{ fontSize: 12, fontFamily: 'monospace' }}>#{c.blockNumber.toLocaleString()}</div>
              )}
              <div style={{
                fontSize: 10, marginTop: 2, fontWeight: 600, letterSpacing: '0.06em',
                color: c.status === 'ok' ? 'var(--success)' : c.status === 'degraded' ? 'var(--danger)' : 'var(--muted)',
              }}>
                {c.status.toUpperCase()}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick stats */}
      {stats && (
        <div style={GRID4}>
          {[
            { label: 'Validators Active', value: stats.validatorsActive, href: '/portal/validators', accent: '#22c55e' },
            { label: 'Nodes Online',      value: stats.nodesOnline,      href: '/portal/nodes',      accent: '#7aa2ff' },
            { label: 'Containers',        value: stats.containersRunning, href: '/portal/docker',    accent: '#f2c14e' },
            { label: 'AI Status',         value: stats.aiStatus,         href: '/portal/ai',         accent: '#23d6a6' },
            { label: 'GST Reserve',       value: stats.treasuryBalance + ' GST', href: '/portal/treasury', accent: '#a78bfa' },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={{ ...CARD, cursor: 'pointer' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: item.accent, fontFamily: 'monospace' }}>{item.value}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* NOC AI + Quick links */}
      <div style={GRID2}>
        {/* NOC AI status */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>NOC AI Monitor</span>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
              background: noc?.status === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
              color: noc?.status === 'ok' ? '#22c55e' : 'var(--muted)',
            }}>
              {noc?.status ?? 'connecting…'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {noc?.alertsTotal ?? 0} proposals sent · detect-only mode
          </div>
          {noc?.recentAlerts && noc.recentAlerts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
              {noc.recentAlerts.slice(0, 4).map((a) => (
                <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#6b7280',
                  }} />
                  <span style={{ fontFamily: 'monospace', color: 'var(--muted)', fontSize: 11 }}>{a.target}</span>
                  <span style={{ color: 'var(--text)' }}>{a.type.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          )}
          {(!noc?.recentAlerts || noc.recentAlerts.length === 0) && (
            <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>All systems nominal</div>
          )}
        </div>

        {/* Quick actions */}
        <div style={CARD}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Quick Access</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Command Center', href: '/command-center' },
              { label: 'Observability', href: '/observability' },
              { label: 'GhostXchange', href: '/explorer' },
              { label: 'Contracts', href: '/contracts' },
              { label: 'Compliance', href: '/compliance' },
              { label: 'Governance', href: '/portal/governance' },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  fontSize: 12,
                  color: 'var(--muted)',
                  textDecoration: 'none',
                  textAlign: 'center',
                  transition: 'all 0.15s',
                }}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
