'use client';

import { useState, useEffect, useCallback } from 'react';

type ServiceStatus = {
  name: string;
  port?: number;
  url?: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  latencyMs?: number;
  uptimePct?: number;
  lastCheck: string;
  category: string;
};

type ChainMetric = {
  layer: string;
  chainId: number;
  blockNumber: number | null;
  gasPriceGwei: number | null;
  peers: number | null;
  ok: boolean;
  latencyMs?: number;
};

const STATUS_COLOR: Record<string, string> = {
  up: 'var(--success)', down: 'var(--danger)', degraded: 'var(--warning)', unknown: 'var(--muted)',
};

const CATEGORIES = ['Chain Nodes', 'Microservices', 'AI Systems', 'Infrastructure', 'Databases'];

export default function MonitoringPage() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [chains, setChains] = useState<ChainMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState('all');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [sRes, cRes] = await Promise.all([
        fetch('/api/status/services', { cache: 'no-store' }),
        fetch('/api/chain/status', { cache: 'no-store' }),
      ]);
      if (sRes.ok) {
        const d = await sRes.json();
        setServices(Array.isArray(d) ? d : (d.services ?? []));
      }
      if (cRes.ok) {
        const d = await cRes.json();
        setChains(d.chains ?? []);
      }
      setLastRefresh(new Date());
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = catFilter === 'all' ? services : services.filter(s => s.category === catFilter);
  const upCount = services.filter(s => s.status === 'up').length;
  const downCount = services.filter(s => s.status === 'down').length;
  const degradedCount = services.filter(s => s.status === 'degraded').length;

  return (
    <div className="portal-page">
      <div className="portal-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 className="portal-title">Monitoring</h1>
          {lastRefresh && (
            <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
        <p className="portal-subtitle">Real-time health of all GhostChain services, nodes, and infrastructure</p>
      </div>

      {/* Overall status banner */}
      <div className="card" style={{
        background: downCount > 0 ? 'rgba(255,107,107,0.06)' : degradedCount > 0 ? 'rgba(242,193,78,0.06)' : 'rgba(114,242,167,0.06)',
        borderColor: downCount > 0 ? 'rgba(255,107,107,0.25)' : degradedCount > 0 ? 'rgba(242,193,78,0.25)' : 'rgba(114,242,167,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            background: downCount > 0 ? 'var(--danger)' : degradedCount > 0 ? 'var(--warning)' : 'var(--success)',
          }} />
          <div>
            <div style={{ fontWeight: 700 }}>
              {downCount > 0 ? `${downCount} Service${downCount > 1 ? 's' : ''} Down` :
               degradedCount > 0 ? `${degradedCount} Service${degradedCount > 1 ? 's' : ''} Degraded` :
               'All Systems Operational'}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
              {upCount} up · {degradedCount} degraded · {downCount} down · {services.length} total services
            </div>
          </div>
        </div>
      </div>

      {/* Chain metrics */}
      <div className="portal-section">
        <div className="portal-section-title">Chain Nodes</div>
        <div className="monitoring-grid">
          {chains.length === 0 && !loading && (
            <div className="card" style={{ color: 'var(--muted)' }}>No chain data available</div>
          )}
          {chains.map(c => (
            <div key={c.layer} className="card" style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className={`service-dot ${c.ok ? 'up' : 'down'}`} />
                <span style={{ fontWeight: 700 }}>{c.layer}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>chain_id {c.chainId}</span>
                <span className={`status-tag ${c.ok ? 'active' : 'open'}`} style={{ marginLeft: 'auto' }}>
                  {c.ok ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {[
                  { label: 'Block', value: c.blockNumber?.toLocaleString() ?? '—' },
                  { label: 'Gas Price', value: c.gasPriceGwei ? `${c.gasPriceGwei} Gwei` : '—' },
                  { label: 'Peers', value: c.peers ?? '—' },
                  { label: 'Latency', value: c.latencyMs ? `${c.latencyMs}ms` : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="info-row" style={{ padding: '4px 0' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{label}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Services */}
      <div className="portal-section">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <div className="portal-section-title" style={{ marginBottom: 0 }}>Services</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['all', ...CATEGORIES].map(c => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                style={{
                  padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)',
                  background: catFilter === c ? 'rgba(35,214,166,0.12)' : 'rgba(255,255,255,0.03)',
                  color: catFilter === c ? 'var(--accent)' : 'var(--muted)',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: catFilter === c ? 700 : 400,
                }}
              >{c === 'all' ? 'All' : c}</button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>Loading services…</div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No services found</div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {filtered.map((svc, idx) => (
              <div key={svc.name} className="service-row" style={{
                borderRadius: 0,
                borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div className={`service-dot ${svc.status}`} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{svc.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                    {svc.category}{svc.port ? ` · :${svc.port}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.82rem' }}>
                  <div style={{ color: STATUS_COLOR[svc.status], fontWeight: 700 }}>{svc.status.toUpperCase()}</div>
                  {svc.latencyMs && <div style={{ color: 'var(--muted)' }}>{svc.latencyMs}ms</div>}
                  {svc.uptimePct && <div style={{ color: 'var(--muted)' }}>{svc.uptimePct.toFixed(2)}% uptime</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
