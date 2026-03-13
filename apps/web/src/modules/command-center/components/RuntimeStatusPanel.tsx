'use client';

import { useEffect, useState } from 'react';
import type { RuntimeStatus, LayerRuntime } from '../../../../app/api/command-center/runtime/route';

// ── Helpers ────────────────────────────────────────────────────────────────────

function healthDot(healthy: boolean | null) {
  const color = healthy == null ? '#6b7280' : healthy ? '#22c55e' : '#ef4444';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        flexShrink: 0,
        background: color,
      }}
    />
  );
}

function lagColor(lag: number | null): string {
  if (lag == null) return 'inherit';
  if (lag > 50) return '#ef4444';
  if (lag > 10) return '#f59e0b';
  return '#22c55e';
}

function formatBlock(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

const LAYER_LABELS: Record<string, string> = {
  L1: 'GhostChain L1',
  L2: 'GhostL2',
  L3: 'GhostL3',
};

const CHAIN_ID_LABELS: Record<string, string> = {
  L1: '14000101',
  L2: '901',
  L3: '903',
};

// ── LayerRow ───────────────────────────────────────────────────────────────────

function LayerRow({ layer }: { layer: LayerRuntime }) {
  const healthyRpc = layer.rpcEndpoints.filter(e => e.healthy).length;
  const totalRpc   = layer.rpcEndpoints.length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.18)',
        fontSize: 12,
      }}
    >
      {/* Top row: health dot + layer name + chain ID */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          {healthDot(layer.healthy)}
          <span style={{ fontWeight: 600 }}>{LAYER_LABELS[layer.layer] ?? layer.layer}</span>
          <span className="muted" style={{ fontSize: 10 }}>
            chain&nbsp;{CHAIN_ID_LABELS[layer.layer] ?? layer.chainId}
          </span>
        </div>
        {layer.error && (
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 99,
            background: '#fee2e2', color: '#991b1b', fontWeight: 600,
          }}>
            error
          </span>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Block</div>
          <div style={{ fontFamily: 'monospace' }}>{formatBlock(layer.blockNumber)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Peers</div>
          <div>{layer.peers ?? '—'}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Syncing</div>
          <div>{layer.syncing == null ? '—' : layer.syncing ? 'yes' : 'no'}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Block lag</div>
          <div style={{ color: lagColor(layer.blockLag), fontFamily: 'monospace' }}>
            {layer.blockLag == null ? '—' : layer.blockLag === 0 ? 'anchored' : `+${layer.blockLag}`}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>RPC nodes</div>
          <div style={{ color: totalRpc > 0 && healthyRpc === 0 ? '#ef4444' : 'inherit' }}>
            {totalRpc === 0 ? '—' : `${healthyRpc}/${totalRpc}`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── RuntimeStatusPanel ─────────────────────────────────────────────────────────

export function RuntimeStatusPanel() {
  const [data, setData]               = useState<RuntimeStatus | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch('/api/command-center/runtime', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as RuntimeStatus;
        if (!cancelled) {
          setData(json);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unreachable');
      }
    }

    void poll();
    const id = setInterval(() => { void poll(); }, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const healthyCount = data?.layers.filter(l => l.healthy).length ?? 0;
  const totalCount   = data?.layers.length ?? 3;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700 }}>Runtime / RPC Health</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {data && (
            <span
              className="muted"
              style={{ fontSize: 12, color: healthyCount < totalCount ? '#f59e0b' : undefined }}
            >
              {healthyCount}/{totalCount} layers healthy
            </span>
          )}
          {lastUpdated && (
            <span className="muted" style={{ fontSize: 10 }}>
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="badge bad" style={{ fontSize: 12 }}>
          Runtime probe failed — {error}
        </div>
      )}

      {/* Loading */}
      {!data && !error && (
        <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
      )}

      {/* Layer rows */}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.layers.map(layer => (
            <LayerRow key={layer.layer} layer={layer} />
          ))}
        </div>
      )}

      {/* Summary */}
      {data && (
        <div className="muted" style={{ fontSize: 11, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
          {data.summary}
        </div>
      )}
    </div>
  );
}
