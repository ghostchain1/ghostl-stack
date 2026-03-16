'use client';

import type { Node, NodeMetrics } from '@ghostchain/types/nodes';

type NodeWithMetrics = Node & { metrics?: NodeMetrics };

export function NodesList({ nodes }: { nodes: NodeWithMetrics[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Nodes</div>
      <div className="stack" style={{ gap: 8 }}>
        {nodes.map((n) => (
          <div key={n.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{n.id}</div>
              <div className="muted">
                {n.type} · {n.host} · {n.version}
              </div>
            </div>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <div className={`badge ${n.status === 'online' ? 'ok' : n.status === 'syncing' ? 'warn' : 'bad'}`}>
                {n.status}
              </div>
              {n.metrics && <div className="pill">Peers {n.metrics.peers} · Lag {n.metrics.lag ?? '?'}</div>}
            </div>
          </div>
        ))}
        {!nodes.length && <div className="muted">No nodes discovered.</div>}
      </div>
    </div>
  );
}
