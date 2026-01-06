'use client';

import type { Node, NodeMetrics } from '@ghostchain/types/nodes';

export function NodeDetail({ node, metrics }: { node: Node; metrics?: NodeMetrics }) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800 }}>{node.id}</div>
          <div className="muted">
            {node.type} · {node.host} · {node.version}
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
      </div>
    </div>
  );
}
