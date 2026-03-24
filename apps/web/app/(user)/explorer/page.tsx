'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type Block = {
  number: number;
  hash: string;
  txCount: number;
  gasUsed: string;
  timestamp: string;
  layer: 'L1' | 'L2' | 'L3';
};

type Tx = {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  gasPrice: string;
  status: 'success' | 'failed' | 'pending';
  blockNumber: number;
  layer: string;
  timestamp: string;
};

type SearchResult = { type: 'block' | 'tx' | 'address'; data: unknown };

const LAYER_CONFIG = {
  L1: { color: 'var(--accent)', rpc: ':18545' },
  L2: { color: 'var(--accent-3)', rpc: ':29545' },
  L3: { color: 'var(--accent-2)', rpc: ':39545' },
} as const;

function short(s: string) {
  if (!s || s.length < 12) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

export default function ExplorerPage() {
  const [layer, setLayer] = useState<'L1' | 'L2' | 'L3'>('L1');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<'blocks' | 'transactions'>('blocks');

  const load = useCallback(async () => {
    try {
      const layerKey = layer.toLowerCase();
      const [bRes, tRes] = await Promise.all([
        fetch(`/api/explorer/${layerKey}/blocks?limit=10`, { cache: 'no-store' }),
        fetch(`/api/explorer/${layerKey}/txs?limit=20`, { cache: 'no-store' }),
      ]);
      if (bRes.ok) { const d = await bRes.json(); setBlocks(Array.isArray(d) ? d : (d.blocks ?? [])); }
      if (tRes.ok) { const d = await tRes.json(); setTxs(Array.isArray(d) ? d : (d.txs ?? [])); }
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, [layer]);

  useEffect(() => {
    setLoading(true);
    setBlocks([]); setTxs([]);
    void load();
    const t = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await fetch(`/api/explorer/${layer.toLowerCase()}/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
      if (res.ok) setSearchResult(await res.json());
      else setSearchResult({ type: 'tx', data: null });
    } catch {
      setSearchResult({ type: 'tx', data: null });
    } finally { setSearching(false); }
  }

  return (
    <div className="portal-page">
      <div className="portal-header">
        <h1 className="portal-title">GhostScan Explorer</h1>
        <p className="portal-subtitle">Browse blocks, transactions, and addresses on GhostChain L1 / L2 / L3</p>
      </div>

      {/* Layer switcher */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['L1', 'L2', 'L3'] as const).map(l => (
          <button
            key={l}
            onClick={() => setLayer(l)}
            style={{
              padding: '8px 18px', borderRadius: 10, border: '1px solid var(--border)',
              fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem',
              background: layer === l ? LAYER_CONFIG[l].color : 'rgba(255,255,255,0.04)',
              color: layer === l ? '#061014' : 'var(--muted)',
              transition: 'all 0.15s',
            }}
          >{l}</button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={search} style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          placeholder="Search block number, tx hash, or address…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" className="button" disabled={searching} style={{ whiteSpace: 'nowrap' }}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {searchResult && (
        <div className="card" style={{ background: 'rgba(35,214,166,0.06)', borderColor: 'rgba(35,214,166,0.2)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Search Result</div>
          {searchResult.data
            ? <pre className="code-preview">{JSON.stringify(searchResult.data, null, 2)}</pre>
            : <div style={{ color: 'var(--muted)' }}>No results found for <span className="mono">{query}</span></div>
          }
        </div>
      )}

      {/* Tabs */}
      <div className="portal-tabs">
        {(['blocks', 'transactions'] as const).map(t => (
          <button key={t} className={`portal-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Blocks */}
      {tab === 'blocks' && (
        <div className="portal-section">
          <div className="portal-section-title">Latest Blocks — {layer}</div>
          {loading ? (
            <div className="card" style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>Loading…</div>
          ) : blocks.length === 0 ? (
            <div className="card" style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>No blocks available</div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Block</th><th>Hash</th><th>Txs</th><th>Gas Used</th><th>Time</th></tr>
                  </thead>
                  <tbody>
                    {blocks.map(b => (
                      <tr key={b.number}>
                        <td style={{ fontWeight: 700, color: LAYER_CONFIG[layer].color }}>#{b.number.toLocaleString()}</td>
                        <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--accent-3)' }}>
                          <Link href={`/explorer/block/${b.number}`}>{short(b.hash)}</Link>
                        </td>
                        <td>{b.txCount}</td>
                        <td>{b.gasUsed}</td>
                        <td style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{b.timestamp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transactions */}
      {tab === 'transactions' && (
        <div className="portal-section">
          <div className="portal-section-title">Latest Transactions — {layer}</div>
          {loading ? (
            <div className="card" style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>Loading…</div>
          ) : txs.length === 0 ? (
            <div className="card" style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>No transactions available</div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Hash</th><th>From</th><th>To</th><th>Value (GST)</th><th>Status</th><th>Block</th></tr>
                  </thead>
                  <tbody>
                    {txs.map(tx => (
                      <tr key={tx.hash}>
                        <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--accent-3)' }}>
                          <Link href={`/explorer/tx/${tx.hash}`}>{short(tx.hash)}</Link>
                        </td>
                        <td className="mono" style={{ fontSize: '0.8rem' }}>{short(tx.from)}</td>
                        <td className="mono" style={{ fontSize: '0.8rem' }}>{tx.to ? short(tx.to) : <span style={{ color: 'var(--muted)' }}>contract create</span>}</td>
                        <td>{tx.value}</td>
                        <td>
                          <span className={`status-tag ${tx.status === 'success' ? 'resolved' : tx.status === 'pending' ? 'pending' : 'open'}`}>
                            {tx.status}
                          </span>
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>#{tx.blockNumber?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
