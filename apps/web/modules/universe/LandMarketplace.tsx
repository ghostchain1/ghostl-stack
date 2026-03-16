'use client';

import { useEffect, useState } from 'react';

interface LandParcel {
  parcelId:   string;
  x:          number;
  y:          number;
  type:       string;
  owner:      string;
  worldId:    string;
  forSale:    boolean;
  priceGST:   string | null;
  mintedAt:   number;
}

interface LandStats {
  totalParcels:  number;
  forSale:       number;
  totalValueGST: string;
}

const UNIVERSE_API = process.env.NEXT_PUBLIC_UNIVERSE_API ?? 'http://localhost:7700';
const GST_DENOM    = 10n ** 18n;

const TYPE_COLORS: Record<string, string> = {
  residential:   '#2a4a2a',
  commercial:    '#2a2a4a',
  'event-venue': '#4a2a4a',
  'game-arena':  '#4a1a1a',
  civic:         '#1a3a4a',
  wilderness:    '#1a2a1a',
};

export function LandMarketplace() {
  const [parcels, setParcels] = useState<LandParcel[]>([]);
  const [stats,   setStats]   = useState<LandStats | null>(null);
  const [buyer,   setBuyer]   = useState('');
  const [status,  setStatus]  = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [mkt, st] = await Promise.all([
      fetch(`${UNIVERSE_API}/land/market`).then(r => r.json()),
      fetch(`${UNIVERSE_API}/land/stats`).then(r => r.json()),
    ]);
    setParcels((mkt as { parcels: LandParcel[] }).parcels);
    setStats((st as { stats: LandStats }).stats);
  }

  async function buyParcel(p: LandParcel) {
    if (!buyer) { setStatus('Enter your GhostChain address first'); return; }
    setStatus('Processing…');
    try {
      const res  = await fetch(`${UNIVERSE_API}/land/buy`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ x: p.x, y: p.y, buyer }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      setStatus(data.ok ? `Purchased ${p.parcelId} ✓` : (data.error ?? 'Failed'));
      if (data.ok) load();
    } catch {
      setStatus('Request failed');
    }
  }

  function formatGST(wei: string | null): string {
    if (!wei) return '–';
    try { return (BigInt(wei) / GST_DENOM).toLocaleString() + ' GST'; }
    catch { return wei + ' GST'; }
  }

  return (
    <div style={{ fontFamily: 'monospace', color: '#e0e0e0' }}>
      <h2>GhostLand Marketplace</h2>

      {stats && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
          <Stat label="Total Parcels"  value={stats.totalParcels.toString()} />
          <Stat label="For Sale"       value={stats.forSale.toString()} />
          <Stat label="Total Value"    value={formatGST(stats.totalValueGST)} />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <input
          placeholder="Your GhostChain address (0x…)"
          value={buyer}
          onChange={e => setBuyer(e.target.value)}
          style={{
            background: '#1a1a2a', border: '1px solid #444',
            color: '#fff', padding: '6px 12px', width: 340, borderRadius: 4,
          }}
        />
      </div>

      {status && <p style={{ color: status.includes('✓') ? '#4caf50' : '#ff8a65' }}>{status}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {parcels.map(p => (
          <div
            key={p.parcelId}
            style={{
              background:   TYPE_COLORS[p.type] ?? '#1a1a2a',
              border:       '1px solid #333',
              borderRadius: 6, padding: 12,
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{p.parcelId}</div>
            <div style={{ fontSize: 12, color: '#aaa' }}>
              Type: {p.type}<br />
              Location: ({p.x}, {p.y})<br />
              Owner: {p.owner.slice(0, 10)}…<br />
              Price: {formatGST(p.priceGST)}
            </div>
            {p.forSale && (
              <button
                onClick={() => buyParcel(p)}
                style={{
                  marginTop: 8, width: '100%', padding: '6px 0',
                  background: '#5a0fd9', color: '#fff',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                }}
              >
                Buy with GST
              </button>
            )}
          </div>
        ))}
        {parcels.length === 0 && <p style={{ color: '#666' }}>No parcels listed for sale.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#1a1a2a', border: '1px solid #333', borderRadius: 6, padding: '8px 16px' }}>
      <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 'bold' }}>{value}</div>
    </div>
  );
}
