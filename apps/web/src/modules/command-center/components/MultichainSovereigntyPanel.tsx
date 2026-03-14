'use client';

import { useEffect, useState } from 'react';

type BridgeStatus = {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'offline';
  riskScore: number;
  pendingTx: number;
};

type MultichainState = {
  sovereigntyPath: string[];
  bridges: BridgeStatus[];
  activeTreaties: number;
  lastSettlementBlock: number;
  overallHealth: 'ok' | 'degraded' | 'unknown';
} | null;

const CANONICAL_PATH = ['L3', 'L2', 'GhostChain L1', 'External'];

export function MultichainSovereigntyPanel() {
  const [state, setState] = useState<MultichainState>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/command-center/multichain', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as MultichainState;
        if (!cancelled) {
          setState(json);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unreachable');
        }
      }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const path = state?.sovereigntyPath ?? CANONICAL_PATH;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700 }}>Sovereignty Routing</span>
        {state && (
          <HealthBadge health={state.overallHealth} />
        )}
      </div>

      {/* Sovereignty path visualisation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 12 }}>
        {path.map((hop, i) => (
          <span key={hop} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                background: '#1e3a5f', color: '#93c5fd',
                padding: '2px 8px', borderRadius: 6, fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              {hop}
            </span>
            {i < path.length - 1 && (
              <span className="muted">→</span>
            )}
          </span>
        ))}
      </div>

      {error && (
        <div className="badge bad" style={{ fontSize: 12 }}>Multichain controller offline — {error}</div>
      )}

      {state && (
        <>
          <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Treaties</div>
              <div>{state.activeTreaties}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Last Settlement</div>
              <div style={{ fontFamily: 'monospace' }}>#{state.lastSettlementBlock.toLocaleString()}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>Bridges</div>
            {state.bridges.map((b) => (
              <div
                key={b.id}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}
              >
                <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <BridgeDot status={b.status} />
                  <span>{b.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {b.pendingTx > 0 && (
                    <span className="muted">{b.pendingTx} pending</span>
                  )}
                  <RiskPill score={b.riskScore} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!state && !error && (
        <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
      )}

      {lastUpdated && (
        <div className="muted" style={{ fontSize: 11, textAlign: 'right' }}>
          Updated {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

function BridgeDot({ status }: { status: BridgeStatus['status'] }) {
  const colour =
    status === 'active' ? '#22c55e' :
    status === 'paused' ? '#f59e0b' :
                          '#ef4444';
  return (
    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: colour, flexShrink: 0 }} />
  );
}

function RiskPill({ score }: { score: number }) {
  const colour = score < 30 ? '#166534' : score < 70 ? '#92400e' : '#991b1b';
  const bg     = score < 30 ? '#dcfce7' : score < 70 ? '#fef3c7' : '#fee2e2';
  return (
    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: bg, color: colour, fontWeight: 600 }}>
      risk {score}
    </span>
  );
}

function HealthBadge({ health }: { health: 'ok' | 'degraded' | 'unknown' }) {
  const label = health === 'ok' ? 'Healthy' : health === 'degraded' ? 'Degraded' : 'Unknown';
  const colour = health === 'ok' ? '#166534' : health === 'degraded' ? '#991b1b' : '#374151';
  const bg     = health === 'ok' ? '#dcfce7' : health === 'degraded' ? '#fee2e2' : '#f3f4f6';
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: bg, color: colour, fontWeight: 600 }}>
      {label}
    </span>
  );
}
