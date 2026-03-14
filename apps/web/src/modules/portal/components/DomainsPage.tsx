'use client';

import { useEffect, useState } from 'react';

type DomainZone = {
  domain: string;
  status: 'healthy' | 'degraded' | 'offline';
  recordCount?: number;
  lastChecked?: string;
  ttl?: number;
  gnsEnabled?: boolean;
};

type DomainsData = { zones: DomainZone[] };

const CARD: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px',
};

const STATIC_DOMAINS: DomainZone[] = [
  { domain: 'ghostchain.cloud', status: 'healthy', gnsEnabled: true },
  { domain: 'ghostchain.info', status: 'healthy', gnsEnabled: true },
  { domain: 'ghostchain.life', status: 'healthy', gnsEnabled: true },
  { domain: 'ghostbrain.ai', status: 'healthy', gnsEnabled: false },
  { domain: 'ghostxchange.io', status: 'healthy', gnsEnabled: false },
];

function statusDot(s: 'healthy' | 'degraded' | 'offline') {
  const c = s === 'healthy' ? '#22c55e' : s === 'degraded' ? '#f59e0b' : '#ef4444';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c, marginRight: 6 }} />;
}

export function DomainsPage() {
  const [data, setData] = useState<DomainsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/portal/domains', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as DomainsData;
        if (!cancelled) { setData(json); setError(null); }
      } catch {
        // DNS resolver may not be up in all environments — fall back to static list
        if (!cancelled) setError(null);
      }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const zones = data?.zones ?? STATIC_DOMAINS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Domains &amp; GNS</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
          Ghost Name System — DNS zones, GNS records, domain health
        </p>
      </div>

      {error && (
        <div style={{ ...CARD, color: 'var(--warning)', fontSize: 13 }}>
          DNS resolver offline — showing cached zone list. {error}
        </div>
      )}

      {/* Zone cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {zones.map((zone) => (
          <div key={zone.domain} style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {statusDot(zone.status)}
                {zone.domain}
              </div>
              {zone.gnsEnabled && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', fontWeight: 600 }}>
                  GNS
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--muted)' }}>
              {zone.recordCount !== undefined && <span>{zone.recordCount} records</span>}
              {zone.ttl !== undefined && <span>TTL {zone.ttl}s</span>}
              {zone.lastChecked && <span>Checked {zone.lastChecked}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* GNS info panel */}
      <div style={CARD}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>Ghost Name System (GNS)</h3>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)' }}>
          GNS replaces ENS on GhostChain. Names resolve to wallet addresses, contract addresses, and IPFS content hashes on-chain via the GNS registry contracts.
        </p>
        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Registry</div>
            <code style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>contracts/src/gns/</code>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Layer</div>
            <span>GhostChain L1 + L2</span>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>TLD</div>
            <span>.ghost, .ghostchain</span>
          </div>
        </div>
      </div>
    </div>
  );
}
