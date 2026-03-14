'use client';

/**
 * AIRecommendationsPanel.tsx — GhostBrain AI recommendation control panel.
 *
 * Displays pending AI-drafted actions and provides Approve / Reject /
 * Auto-execute controls.  All mutations are queued to the signing relay;
 * no autonomous on-chain execution without human ratification.
 */

import { useState } from 'react';
import { useAIRecommendations } from '../../../hooks/useAIRecommendations';
import type { AIRecommendation, AIActionType, RecommendationSeverity } from '../../../services/ai';

// ── Styling helpers ─────────────────────────────────────────────────────────

const severityColor: Record<RecommendationSeverity, string> = {
  info:     'var(--color-ok, #22c55e)',
  warning:  'var(--color-warn, #f59e0b)',
  critical: 'var(--color-err, #ef4444)',
};

const actionTypeBadge: Record<AIActionType, string> = {
  rebalance:  '#6366f1',
  restart:    '#f59e0b',
  upgrade:    '#3b82f6',
  alert:      '#ef4444',
  governance: '#8b5cf6',
  treasury:   '#22c55e',
};

function ConfidenceBar({ value }: { value: number }) {
  const pct   = Math.round(value * 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ color, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

// ── Single recommendation card ───────────────────────────────────────────────

interface RecCardProps {
  rec:     AIRecommendation;
  onApprove: (id: string) => void;
  onReject:  (id: string, reason?: string) => void;
  busy:    boolean;
}

function RecommendationCard({ rec, onApprove, onReject, busy }: RecCardProps) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason]       = useState('');

  const expiredAt  = new Date(rec.expiresAt);
  const isExpired  = expiredAt < new Date();
  const timeLeft   = !isExpired
    ? `Expires ${expiredAt.toLocaleTimeString()}`
    : 'Expired';

  return (
    <div
      style={{
        border: `1px solid ${severityColor[rec.severity]}40`,
        borderLeft: `4px solid ${severityColor[rec.severity]}`,
        borderRadius: 8,
        padding: '14px 16px',
        background: 'var(--color-surface, rgba(255,255,255,0.03))',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                background: `${actionTypeBadge[rec.actionType]}30`,
                color: actionTypeBadge[rec.actionType],
                padding: '2px 8px',
                borderRadius: 4,
              }}
            >
              {rec.actionType}
            </span>
            <span
              style={{
                fontSize: 11,
                color: severityColor[rec.severity],
                fontWeight: 600,
              }}
            >
              {rec.severity.toUpperCase()}
            </span>
            {rec.autoExecuteEligible && (
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(99,102,241,0.2)',
                  color: '#a5b4fc',
                }}
              >
                AUTO-ELIGIBLE
              </span>
            )}
          </div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{rec.title}</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-muted, #999)', whiteSpace: 'nowrap' }}>
          {timeLeft}
        </span>
      </div>

      {/* Target + model */}
      <div style={{ fontSize: 12, color: 'var(--color-muted, #999)' }}>
        Target: <strong style={{ color: 'inherit' }}>{rec.target}</strong>
        &ensp;·&ensp;
        <span>{rec.model.name} {rec.model.version}</span>
      </div>

      {/* Reasoning */}
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{rec.reasoning}</p>

      {/* Evidence */}
      {rec.evidence.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {rec.evidence.map((ev, i) => (
            <span
              key={i}
              title={ev.detail}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.07)',
                cursor: 'default',
              }}
            >
              {ev.kind}: {ev.ref}
            </span>
          ))}
        </div>
      )}

      {/* Confidence */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--color-muted, #999)', marginBottom: 4 }}>
          AI Confidence
        </div>
        <ConfidenceBar value={rec.confidence} />
      </div>

      {/* Reject reason input */}
      {rejecting && (
        <textarea
          rows={2}
          placeholder="Rejection reason (optional)"
          value={reason}
          onChange={e => setReason(e.target.value)}
          style={{
            width: '100%',
            resize: 'vertical',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.15)',
            padding: '6px 10px',
            background: 'rgba(255,255,255,0.05)',
            color: 'inherit',
            fontSize: 12,
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Actions */}
      {!isExpired && rec.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <button
            disabled={busy}
            onClick={() => onApprove(rec.id)}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: 'none',
              background: busy ? 'rgba(34,197,94,0.3)' : '#22c55e',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Processing…' : '✓ Approve'}
          </button>

          {!rejecting ? (
            <button
              disabled={busy}
              onClick={() => setRejecting(true)}
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                border: '1px solid rgba(239,68,68,0.6)',
                background: 'transparent',
                color: '#ef4444',
                fontWeight: 600,
                fontSize: 13,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              ✕ Reject
            </button>
          ) : (
            <>
              <button
                disabled={busy}
                onClick={() => { onReject(rec.id, reason || undefined); setRejecting(false); }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                Confirm Reject
              </button>
              <button
                onClick={() => { setRejecting(false); setReason(''); }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent',
                  color: 'var(--color-muted, #999)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {rec.status !== 'pending' && (
        <div style={{ fontSize: 12, color: 'var(--color-muted, #999)', fontStyle: 'italic' }}>
          Status: {rec.status}
        </div>
      )}
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

interface Props {
  maxShown?: number;
}

export function AIRecommendationsPanel({ maxShown = 5 }: Props) {
  const { recommendations, loading, error, refresh, approve, reject, mutating } =
    useAIRecommendations('pending');

  const shown = recommendations.slice(0, maxShown);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>GhostBrain Recommendations</div>
          <div className="muted" style={{ fontSize: 12 }}>
            AI-drafted actions awaiting ratification
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {recommendations.length > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: '#ef4444',
                color: '#fff',
                borderRadius: 10,
                padding: '2px 8px',
              }}
            >
              {recommendations.length} pending
            </span>
          )}
          <button
            onClick={refresh}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: 'inherit',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            background: 'rgba(239,68,68,0.15)',
            color: '#fca5a5',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="muted" style={{ fontSize: 13 }}>Loading AI recommendations…</div>
      )}

      {/* Empty state */}
      {!loading && !error && shown.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '24px 0',
            color: 'var(--color-muted, #999)',
            fontSize: 13,
          }}
        >
          No pending recommendations — GhostBrain reports all clear.
        </div>
      )}

      {/* Cards */}
      {shown.map(rec => (
        <RecommendationCard
          key={rec.id}
          rec={rec}
          onApprove={approve}
          onReject={reject}
          busy={mutating.has(rec.id)}
        />
      ))}

      {recommendations.length > maxShown && (
        <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
          +{recommendations.length - maxShown} more — view all in AI Control Center
        </div>
      )}
    </div>
  );
}
