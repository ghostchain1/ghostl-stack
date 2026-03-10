'use client';

/**
 * SystemHealthPanel — shows real-time status of all GhostStack services.
 *
 * Polls /api/system every 15 s and renders a compact grid of service
 * health badges with latency indicators.
 */

import { useCallback, useEffect, useState } from 'react';

interface ServiceResult {
  name: string;
  status: 'up' | 'down';
  latencyMs: number;
}

interface SystemStatus {
  overall: 'healthy' | 'degraded' | 'down';
  servicesUp: number;
  servicesDown: number;
  services: ServiceResult[];
  timestamp: string;
}

function statusColor(s: 'up' | 'down'): string {
  return s === 'up' ? '#22c55e' : '#ef4444';
}

function overallColor(o: 'healthy' | 'degraded' | 'down'): string {
  if (o === 'healthy')  return '#22c55e';
  if (o === 'degraded') return '#f59e0b';
  return '#ef4444';
}

function latencyLabel(ms: number): string {
  if (ms < 100)  return `${ms}ms`;
  if (ms < 1000) return `${ms}ms ⚠`;
  return `${ms}ms ✕`;
}

export function SystemHealthPanel() {
  const [snap, setSnap]     = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/system', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSnap(await res.json() as SystemStatus);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), 15_000);
    return () => clearInterval(id);
  }, [poll]);

  if (loading) {
    return (
      <div style={{ padding: 20, color: 'var(--color-muted, #9ca3af)', fontSize: 13 }}>
        Loading system health…
      </div>
    );
  }

  if (error || !snap) {
    return (
      <div style={{ padding: 20, color: '#ef4444', fontSize: 13 }}>
        System health unavailable: {error}
      </div>
    );
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>System Health</span>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 20,
          background: `${overallColor(snap.overall)}22`,
          color: overallColor(snap.overall),
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {snap.overall}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-muted, #9ca3af)' }}>
          {snap.servicesUp}/{snap.services.length} up
        </span>
      </div>

      {/* Service grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {snap.services.map(svc => (
          <div
            key={svc.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${statusColor(svc.status)}33`,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(svc.status), flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {svc.name}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-muted, #9ca3af)', whiteSpace: 'nowrap' }}>
              {svc.status === 'up' ? latencyLabel(svc.latencyMs) : 'down'}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--color-muted, #9ca3af)' }}>
        Last checked {new Date(snap.timestamp).toLocaleTimeString()} · refreshes every 15 s
      </div>
    </div>
  );
}
