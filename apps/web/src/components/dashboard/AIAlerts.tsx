'use client';

/**
 * AIAlerts.tsx — Compact dashboard widget showing GhostBrain AI alert state.
 * Uses useAI() (lightweight status hook) and shows pending recommendations.
 */

import Link from 'next/link';
import { useAI } from '../../hooks/useAI';
import { useAIStore } from '../../store/aiStore';

const LEVEL_STYLE: Record<'green' | 'yellow' | 'red', { color: string; label: string; bg: string }> = {
  green:  { color: '#22c55e', label: 'All Clear',    bg: 'rgba(34,197,94,0.1)'  },
  yellow: { color: '#f59e0b', label: 'Warning',      bg: 'rgba(245,158,11,0.1)' },
  red:    { color: '#ef4444', label: 'Alert Active', bg: 'rgba(239,68,68,0.1)'  },
};

export function AIAlerts() {
  const { alertLevel, swarm, networkHealth, loading } = useAI();
  const { pendingRecs } = useAIStore();

  const style = LEVEL_STYLE[alertLevel];

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>GhostBrain AI</span>
        <Link href="/ai" style={{ fontSize: 11, color: 'var(--accent, #6366f1)' }}>
          Detail →
        </Link>
      </div>

      {/* Alert level banner */}
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          background: style.bg,
          border: `1px solid ${style.color}40`,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: style.color,
              boxShadow: `0 0 8px ${style.color}`,
            }}
          />
          <span style={{ fontWeight: 700, color: style.color, fontSize: 13 }}>
            {loading ? '…' : style.label}
          </span>
        </div>
        {networkHealth && networkHealth.compositeScore != null && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9ca3af' }}>
            Composite score: {networkHealth.compositeScore.toFixed(0)}/100
          </p>
        )}
      </div>

      {/* Swarm summary */}
      {swarm && (
        <div className="stack" style={{ gap: 6, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 11 }}>Active agents</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{swarm.activeAgents ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 11 }}>Tasks (24h)</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{swarm.tasksCompleted24h ?? '—'}</span>
          </div>
          {swarm.anomaliesDetected24h != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 11 }}>Anomalies (24h)</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: swarm.anomaliesDetected24h > 0 ? '#f59e0b' : 'inherit' }}>
                {swarm.anomaliesDetected24h}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Pending recommendations */}
      {pendingRecs.length > 0 ? (
        <Link
          href="/ai/recommendations"
          style={{
            display: 'block',
            padding: '6px 10px',
            borderRadius: 6,
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid #ef444440',
            fontSize: 11,
            fontWeight: 700,
            color: '#ef4444',
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          {pendingRecs.length} recommendation{pendingRecs.length !== 1 ? 's' : ''} awaiting ratification
        </Link>
      ) : (
        <p className="muted" style={{ fontSize: 11, textAlign: 'center' }}>No pending recommendations</p>
      )}
    </div>
  );
}
