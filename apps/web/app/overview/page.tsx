'use client';

/**
 * app/overview/page.tsx — GhostStack Live Overview Dashboard.
 *
 * Surfaces the most critical chain, validator, treasury, and AI metrics in a
 * single scannable screen.  All data is live via WebSocket + SSE.
 */

import { useEffect, useState } from 'react';
import { useRealtime } from '../../lib/ws';
import { useGhostStore } from '../../store/useStore';
import { apiRequest } from '../../src/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverviewStats {
  blockNumber:      number | null;
  gasPriceGwei:     number | null;
  validatorsActive: number | null;
  validatorsTotal:  number | null;
  treasuryBalance:  string | null;
  pendingProposals: number | null;
  aiAlerts:         number | null;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="cyber-panel">
      <div className="metric-block">
        <span className="metric-block__label">{label}</span>
        <span
          className="metric-block__value"
          style={accent ? { color: accent } : undefined}
        >
          {value ?? <span style={{ opacity: 0.3 }}>—</span>}
        </span>
        {sub && <span className="metric-block__sub">{sub}</span>}
      </div>
    </div>
  );
}

function ChainRow({
  label,
  chainKey,
  blockByChain,
  healthByChain,
  color,
}: {
  label: string;
  chainKey: string;
  blockByChain: Record<string, number>;
  healthByChain: Record<string, string>;
  color: string;
}) {
  const block  = blockByChain[chainKey];
  const health = healthByChain[chainKey] ?? 'unknown';
  const healthy = health === 'ok' || health === 'synced';

  return (
    <div className="health-row">
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span className="health-row__name">{label}</span>
      <span className="health-row__value" style={{ fontFamily: 'var(--font-display)' }}>
        {block != null ? `#${block.toLocaleString()}` : '—'}
      </span>
      <span style={{
        fontSize: '0.72rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        color: healthy ? 'var(--success)' : 'var(--danger)',
        marginLeft: 8,
      }}>
        {health}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { connected, blockByChain, healthByChain, ai } = useRealtime();
  const { chain } = useGhostStore();

  const [stats, setStats]     = useState<OverviewStats>({
    blockNumber:      null,
    gasPriceGwei:     null,
    validatorsActive: null,
    validatorsTotal:  null,
    treasuryBalance:  null,
    pendingProposals: null,
    aiAlerts:         null,
  });
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchStats = async () => {
    // Fetch stats from BFF endpoints; each can fail independently
    const [validatorsRes, treasuryRes, govRes] = await Promise.allSettled([
      apiRequest('/api/validators/summary'),
      apiRequest('/api/treasury/summary'),
      apiRequest('/api/governance/proposals?status=active'),
    ]);

    const validatorData =
      validatorsRes.status === 'fulfilled' && validatorsRes.value.ok
        ? (validatorsRes.value.data as { active?: number; total?: number })
        : null;

    const treasuryData =
      treasuryRes.status === 'fulfilled' && treasuryRes.value.ok
        ? (treasuryRes.value.data as { balanceGST?: string })
        : null;

    const govData =
      govRes.status === 'fulfilled' && govRes.value.ok
        ? (govRes.value.data as { proposals?: unknown[] })
        : null;

    // Chain-level gas / block from chain store
    const l1 = chain.status?.l1;

    setStats({
      blockNumber:      l1?.blockNumber ?? null,
      gasPriceGwei:     l1?.gasPriceGwei ?? null,
      validatorsActive: validatorData?.active ?? null,
      validatorsTotal:  validatorData?.total ?? null,
      treasuryBalance:  treasuryData?.balanceGST ?? null,
      pendingProposals: govData?.proposals?.length ?? null,
      aiAlerts:         ai?.anomaliesDetected24h ?? null,
    });
    setLastFetch(new Date());
  };

  useEffect(() => {
    void fetchStats();
    const iv = setInterval(() => { void fetchStats(); }, 15_000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain.status, ai]);

  return (
    <div className="page-wrap">
      {/* Page header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
            GhostStack Overview
          </h1>
          <span className={`status-dot ${connected ? 'status-dot--live' : 'status-dot--danger'}`} />
          <span style={{ fontSize: '0.8rem', color: connected ? 'var(--accent)' : 'var(--danger)', fontWeight: 600 }}>
            {connected ? 'LIVE' : 'DISCONNECTED'}
          </span>
        </div>
        {lastFetch && (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.8rem' }}>
            Last updated {lastFetch.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* AI alert banner */}
      {ai && (ai.alertLevel === 'critical' || ai.alertLevel === 'elevated') && (
        <div className={`ghost-alert ghost-alert--${ai.alertLevel === 'critical' ? 'danger' : 'warning'}`}>
          <span style={{ fontSize: 18 }}>{ai.alertLevel === 'critical' ? '⚡' : '⚠'}</span>
          <div>
            <strong>GhostBrain: {ai.alertLevel.toUpperCase()} alert —</strong>
            {' '}{ai.anomaliesDetected24h} anomalies detected in the last 24 h.
            {' '}{ai.activeAgents} AI agents active.
          </div>
        </div>
      )}

      {/* Top metric tiles */}
      <div className="cyber-grid">
        <MetricTile
          label="L1 Block Number"
          value={stats.blockNumber != null ? `#${stats.blockNumber.toLocaleString()}` : null}
          sub="GhostChain L1 latest block"
          accent="var(--accent)"
        />
        <MetricTile
          label="Gas Price"
          value={stats.gasPriceGwei != null ? `${stats.gasPriceGwei} gwei` : null}
          sub="L1 · GST"
          accent="var(--accent-2)"
        />
        <MetricTile
          label="Active Validators"
          value={
            stats.validatorsActive != null
              ? `${stats.validatorsActive} / ${stats.validatorsTotal ?? '?'}`
              : null
          }
          sub="GhostChain consensus set"
          accent={
            stats.validatorsActive != null && stats.validatorsTotal != null
              ? stats.validatorsActive / stats.validatorsTotal < 0.67
                ? 'var(--danger)'
                : 'var(--success)'
              : undefined
          }
        />
        <MetricTile
          label="Treasury Balance"
          value={stats.treasuryBalance ? `${stats.treasuryBalance} GST` : null}
          sub="SovereignTreasuryEngine"
          accent="var(--accent-3)"
        />
        <MetricTile
          label="Pending Proposals"
          value={stats.pendingProposals}
          sub="GhostChainGovernor"
          accent={
            stats.pendingProposals != null && stats.pendingProposals > 0
              ? 'var(--accent-2)'
              : undefined
          }
        />
        <MetricTile
          label="AI Anomalies (24h)"
          value={ai?.anomaliesDetected24h ?? stats.aiAlerts}
          sub={`${ai?.activeAgents ?? '?'} GhostBrain agents active`}
          accent={
            (ai?.anomaliesDetected24h ?? 0) > 5 ? 'var(--danger)' : 'var(--accent)'
          }
        />
      </div>

      {/* Chain health */}
      <div>
        <h2 className="section-title">Chain Health</h2>
        <div className="cyber-panel">
          <ChainRow
            label="GhostChain L1"
            chainKey="l1"
            blockByChain={blockByChain}
            healthByChain={healthByChain}
            color="var(--accent)"
          />
          <ChainRow
            label="GhostL2"
            chainKey="l2"
            blockByChain={blockByChain}
            healthByChain={healthByChain}
            color="var(--accent-3)"
          />
          <ChainRow
            label="GhostL3"
            chainKey="l3"
            blockByChain={blockByChain}
            healthByChain={healthByChain}
            color="var(--accent-2)"
          />
        </div>
      </div>

      {/* Quick links */}
      <div>
        <h2 className="section-title">Quick Access</h2>
        <div className="cyber-grid cyber-grid--sm">
          {[
            { href: '/monitor',    label: 'Infrastructure Monitor', icon: '⬡' },
            { href: '/logs',       label: 'Log Aggregator',         icon: '≡' },
            { href: '/alerts',     label: 'Active Alerts',          icon: '⚡' },
            { href: '/validators', label: 'Validator Set',          icon: '✓' },
            { href: '/treasury',   label: 'Treasury',               icon: '◆' },
            { href: '/governance', label: 'Governance',             icon: '⚖' },
            { href: '/ai',         label: 'GhostBrain AI',          icon: '🧠' },
            { href: '/explorer',   label: 'GhostScan Explorer',     icon: '⌕' },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="cyber-panel"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textDecoration: 'none',
                color: 'var(--text)',
                fontWeight: 600,
                fontSize: '0.9rem',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            >
              <span style={{ fontSize: 20 }}>{link.icon}</span>
              <span>{link.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
