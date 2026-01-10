'use client';

import { useState } from 'react';
import type { Node, NodeMetrics } from '@ghostl/types/nodes';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function NodeDetail({ node, metrics }: { node: Node; metrics?: NodeMetrics }) {
  const [statusMsg, setStatusMsg] = useState('');

  const callAction = async (action: 'restart' | 'upgrade') => {
    setStatusMsg('');
    let body: Record<string, unknown> | undefined;
    if (action === 'upgrade') {
      const version = typeof window !== 'undefined' ? window.prompt('Target version?') : '';
      if (!version) {
        setStatusMsg('Upgrade cancelled (no version)');
        return;
      }
      body = { version };
    }
    try {
      const res = await fetch(`${API_BASE}/nodes/${encodeURIComponent(node.id)}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMsg(json.error || `Action failed (${res.status})`);
        return;
      }
      setStatusMsg(`${action} ok${json.version ? ` -> ${json.version}` : ''}`);
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800 }}>{node.id}</div>
          <div className="muted">
            {node.type} · {node.host} · {node.version}
            {metrics?.versionDrift && (
              <span className="pill warn" style={{ marginLeft: 8 }}>
                drift vs {metrics.expectedVersion || 'expected'}
              </span>
            )}
          </div>
        </div>
        <div className={`badge ${node.status === 'online' ? 'ok' : node.status === 'syncing' ? 'warn' : 'bad'}`}>{node.status}</div>
      </div>
      <div className="stack" style={{ marginTop: 8 }}>
        <div className="muted">Last seen: {node.lastSeenAt || '—'}</div>
        {metrics ? (
          <>
            <div className="pill">CPU {metrics.cpu}% · MEM {metrics.mem}% · Disk {metrics.disk}%</div>
            <div className="pill">Peers {metrics.peers} · Lag {metrics.lag ?? '?'}</div>
            {metrics.iops !== undefined && <div className="pill">IOPS {metrics.iops}</div>}
          </>
        ) : (
          <div className="muted">No metrics available.</div>
        )}
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          <button className="button secondary" onClick={() => callAction('restart')}>
            Restart
          </button>
          <button className="button secondary" onClick={() => callAction('upgrade')}>
            Upgrade
          </button>
        </div>
        {statusMsg && <div className="muted">{statusMsg}</div>}
      </div>
    </div>
  );
}
