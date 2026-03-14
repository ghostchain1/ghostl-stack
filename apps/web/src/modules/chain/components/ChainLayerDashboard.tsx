'use client';

/**
 * ChainLayerDashboard.tsx — Shared client component for per-layer chain pages.
 *
 * Polls /api/chains/<layer> every 12 s and renders metrics, recent blocks,
 * and key bridge/rollup metadata.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChainLayer } from '../../../services/ghostchain';

interface LayerData {
  layer:          string;
  chainId:        number;
  label:          string;
  blockNumber:    number | null;
  gasPriceGwei:   number | null;
  peers:          number | null;
  ok:             boolean;
  rollupType?:    string;
  settlementLayer?: string;
  consensus?:     string;
  activeValidators?: number | null;
  error?:         string;
}

const POLL_MS = 12_000;

function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--border, #1f2937)' }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{value ?? '—'}</span>
    </div>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 9px',
        borderRadius: 10,
        background: ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
        color: ok ? '#22c55e' : '#ef4444',
        border: `1px solid ${ok ? '#22c55e50' : '#ef444450'}`,
      }}
    >
      {ok ? 'ONLINE' : 'DEGRADED'}
    </span>
  );
}

export function ChainLayerDashboard({ layer }: { layer: ChainLayer }) {
  const [data,      setData]      = useState<LayerData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chains/${layer}`, { cache: 'no-store' });
      const json = await res.json() as LayerData;
      setData(json);
      setLastFetch(new Date());
    } catch {
      // keep stale data, mark as degraded
      setData(prev => prev ? { ...prev, ok: false } : null);
    } finally {
      setLoading(false);
    }
  }, [layer]);

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => { void load(); }, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const layerLabels: Record<ChainLayer, { full: string; type: string }> = {
    l1: { full: 'GhostChain L1', type: 'Sovereign (Cosmos SDK + EVM)' },
    l2: { full: 'GhostL2', type: 'OP Stack Rollup → L1' },
    l3: { full: 'GhostL3', type: 'OP Stack App Rollup → L2' },
  };
  const meta = layerLabels[layer];

  return (
    <div className="content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{meta.full}</h2>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{meta.type}</p>
        </div>
        {data && <StatusBadge ok={data.ok} />}
        {lastFetch && (
          <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
            {loading ? 'Refreshing…' : `Updated ${lastFetch.toLocaleTimeString()}`}
          </span>
        )}
      </div>

      <div className="card-grid">
        {/* Chain Metrics Card */}
        <div className="card">
          <div className="card-title">Chain Metrics</div>
          <div className="stack">
            <MetricRow label="Chain ID"    value={data?.chainId?.toLocaleString()} />
            <MetricRow label="Block"       value={data?.blockNumber != null ? `#${data.blockNumber.toLocaleString()}` : null} />
            <MetricRow label="Gas Price"   value={data?.gasPriceGwei != null ? `${data.gasPriceGwei.toFixed(4)} Gwei` : null} />
            <MetricRow label="Peers"       value={data?.peers} />
            {data?.consensus      && <MetricRow label="Consensus" value={data.consensus} />}
            {data?.rollupType     && <MetricRow label="Rollup"    value={data.rollupType} />}
            {data?.settlementLayer && <MetricRow label="Settles to" value={data.settlementLayer.toUpperCase()} />}
            {data?.activeValidators != null && <MetricRow label="Active Validators" value={data.activeValidators} />}
          </div>
        </div>

        {/* Chain ID Reference Card */}
        <div className="card">
          <div className="card-title">Network Identity</div>
          <div className="stack">
            <MetricRow label="Gas Token"    value="GST" />
            <MetricRow label="RPC Prefix"   value="ghost_" />
            <MetricRow label="Explorer"     value="GhostScan" />
            <MetricRow label="Wallet"       value="GhostWallet" />
            {layer === 'l1' && (
              <>
                <MetricRow label="Cosmos Chain ID" value="ghostchain-1" />
                <MetricRow label="LCD Port"    value="1317" />
                <MetricRow label="CometBFT"    value=":26657" />
              </>
            )}
            {layer === 'l2' && (
              <>
                <MetricRow label="L1 Portal"    value="0xad32D5C2Da…" />
                <MetricRow label="L2L3 Bridge"  value="0xDadd1125B8…" />
                <MetricRow label="op-geth port" value="29545" />
              </>
            )}
            {layer === 'l3' && (
              <>
                <MetricRow label="L2 Rollup"    value="0x130A46b6E4…" />
                <MetricRow label="Fee Collector" value=":7681" />
                <MetricRow label="op-geth port" value="39545" />
              </>
            )}
          </div>
        </div>

        {/* Quick Links Card */}
        <div className="card">
          <div className="card-title">Quick Links</div>
          <div className="stack" style={{ gap: 8 }}>
            <a href="/network-map"     className="button secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>Network Topology Map</a>
            <a href="/validators"      className="button secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>Validator Set</a>
            <a href="/bridge"          className="button secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>Bridge</a>
            <a href="/observability"   className="button secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>Observability</a>
            {layer === 'l1' && <a href="/governance" className="button secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>Governance</a>}
            {layer !== 'l1' && <a href="/contracts"  className="button secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>Contracts</a>}
          </div>
        </div>
      </div>
    </div>
  );
}
