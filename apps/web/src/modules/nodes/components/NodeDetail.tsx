'use client';

import { useState } from 'react';
import { resolveApiBase } from '../../../lib/runtime';
import { jsonWithCsrf } from '../../../lib/csrf';
import { apiRequest, formatApiError, type ApiError } from '../../../lib/api';
import type { Node, NodeMetrics } from '@ghostchain/types/nodes';

const API_BASE = resolveApiBase();
const formatStatus = (error: ApiError) => {
  const info = formatApiError(error);
  return `${info.method} ${info.endpoint} | ${info.status} | ${info.hint}`;
};

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
      const res = await apiRequest<{ version?: string }>(`/nodes/${encodeURIComponent(node.id)}/${action}`, {
        baseUrl: API_BASE,
        init: {
          method: 'POST',
          headers: jsonWithCsrf(),
          body: body ? JSON.stringify(body) : undefined
        }
      });
      if (!res.ok) {
        setStatusMsg(formatStatus(res.error));
        return;
      }
      setStatusMsg(`${action} ok${res.data.version ? ` -> ${res.data.version}` : ''}`);
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
