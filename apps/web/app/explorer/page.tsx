'use client';

/**
 * GhostChain Explorer — L1 / L2 / L3 block explorer.
 *
 * Polls /api/explorer/blocks?chain= for the active chain tab.
 * Falls back gracefully when nodes are unreachable.
 */

import { useCallback, useEffect, useState } from 'react';

type ChainLayer = 'l1' | 'l2' | 'l3';

interface BlockEntry {
  number:    number;
  hash:      string;
  timestamp: number;
  txCount:   number;
  gasUsed:   string;
  miner:     string;
  size:      number;
  chain:     string;
}

interface BlocksResponse {
  blocks:    BlockEntry[];
  chain:     string;
  source:    string;
  timestamp: string;
}

const CHAIN_META: Record<ChainLayer, { label: string; id: string; color: string }> = {
  l1: { label: 'GhostChain L1', id: 'chain_id 14000101', color: '#a78bfa' },
  l2: { label: 'GhostL2',       id: 'chain_id 901',      color: '#60a5fa' },
  l3: { label: 'GhostL3',       id: 'chain_id 903',      color: '#34d399' },
};

function timeAgo(ts: number): string {
  const sec = Math.floor(Date.now() / 1000) - ts;
  if (sec < 0)    return 'just now';
  if (sec < 60)   return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function shortHash(h: string): string {
  if (!h || h.length < 12) return h;
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

function shortAddr(a: string): string {
  if (!a || a.length < 12) return a || '—';
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

export default function ExplorerPage() {
  const [chain, setChain]     = useState<ChainLayer>('l1');
  const [data,  setData]      = useState<BlocksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState('');

  const load = useCallback(async (c: ChainLayer) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/explorer/blocks?chain=${c}&count=25`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as BlocksResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(chain); }, [chain, load]);

  // Auto-refresh every 12 s
  useEffect(() => {
    const id = setInterval(() => void load(chain), 12_000);
    return () => clearInterval(id);
  }, [chain, load]);

  const blocks = (data?.blocks ?? []).filter(b => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      b.number.toString().includes(s) ||
      b.hash.toLowerCase().includes(s) ||
      b.miner.toLowerCase().includes(s)
    );
  });

  const meta = CHAIN_META[chain];

  const tabStyle = (active: boolean, color: string): React.CSSProperties => ({
    padding: '6px 18px',
    borderRadius: 8,
    border: `1px solid ${active ? color : 'rgba(255,255,255,0.12)'}`,
    background: active ? `${color}22` : 'transparent',
    color: active ? color : 'var(--color-muted, #9ca3af)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  });

  const thStyle: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: 'var(--color-muted, #9ca3af)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    padding: '9px 12px',
    fontSize: 13,
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    whiteSpace: 'nowrap',
  };

  return (
    <div className="content">
      {/* Header */}
      <div style={{ paddingBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>GhostScan Explorer</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-muted, #9ca3af)' }}>
          Real-time block explorer for GhostChain L1 · L2 · L3
        </p>
      </div>

      {/* Chain tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(Object.entries(CHAIN_META) as [ChainLayer, typeof meta][]).map(([key, m]) => (
          <button key={key} style={tabStyle(chain === key, m.color)} onClick={() => setChain(key)}>
            {m.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-muted, #9ca3af)', alignSelf: 'center' }}>
          {meta.id} {data ? `· ${data.source}` : ''}
        </span>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search block number, hash, or validator address…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', maxWidth: 520, padding: '8px 14px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8, color: 'inherit', fontSize: 13,
          }}
        />
      </div>

      {/* Stats bar */}
      {data && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Latest Block', value: data.blocks[0]?.number.toLocaleString() ?? '—' },
            { label: 'Showing',      value: `${blocks.length} blocks` },
            { label: 'Total TXs',   value: data.blocks.reduce((s, b) => s + b.txCount, 0).toLocaleString() },
            { label: 'Data source', value: data.source },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: meta.color }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'var(--color-muted, #9ca3af)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted, #9ca3af)', fontSize: 13 }}>
            Loading blocks…
          </div>
        ) : error ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
            {error}
            <br />
            <span style={{ fontSize: 11, color: 'var(--color-muted, #9ca3af)' }}>
              Ensure the {meta.label} node is running and GHOSTSCOUT / RPC URLs are configured.
            </span>
          </div>
        ) : blocks.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted, #9ca3af)', fontSize: 13 }}>
            No blocks match your search.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Block</th>
                  <th style={thStyle}>Age</th>
                  <th style={thStyle}>Txns</th>
                  <th style={thStyle}>Gas Used</th>
                  <th style={thStyle}>Validator / Miner</th>
                  <th style={thStyle}>Hash</th>
                  <th style={thStyle}>Size</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map(b => (
                  <tr key={b.number} style={{ transition: 'background 0.15s' }}>
                    <td style={{ ...tdStyle, color: meta.color, fontWeight: 700 }}>
                      {b.number.toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--color-muted, #9ca3af)' }}>
                      {timeAgo(b.timestamp)}
                    </td>
                    <td style={tdStyle}>{b.txCount}</td>
                    <td style={{ ...tdStyle, color: 'var(--color-muted, #9ca3af)' }}>{b.gasUsed}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>
                      {shortAddr(b.miner)}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, color: 'var(--color-muted, #9ca3af)' }}>
                      {shortHash(b.hash)}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--color-muted, #9ca3af)' }}>
                      {b.size > 0 ? `${(b.size / 1024).toFixed(1)} KB` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--color-muted, #9ca3af)' }}>
        Auto-refreshes every 12 s
        {data ? ` · Last updated ${new Date(data.timestamp).toLocaleTimeString()}` : ''}
      </div>
    </div>
  );
}
