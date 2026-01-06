import { Card, Badge } from '@ghostl/ui';
import type { Node, NodeMetrics } from '@ghostl/types/nodes';
import { apiFetch } from '../../src/lib/api';

type NodeDetail = Node & { metrics: NodeMetrics };

const fallbackMetrics: NodeMetrics = { cpu: 0, mem: 0, disk: 0, peers: 0 };

async function loadNodeDetails(): Promise<NodeDetail[]> {
  const list = await apiFetch<Node[]>('/nodes', { fallback: [] });
  const enriched = await Promise.all(
    list.map((node) =>
      apiFetch<{ node: Node; metrics: NodeMetrics }>(`/nodes/${encodeURIComponent(node.id)}`, {
        fallback: { node, metrics: fallbackMetrics }
      }).then((res) => ({ ...node, ...(res?.node || {}), metrics: res?.metrics || fallbackMetrics }))
    )
  );
  return enriched;
}

export default async function NodesPage() {
  const nodes = await loadNodeDetails();

  return (
    <div className="content">
      <div className="card-grid">
        {nodes.map((node) => (
          <Card key={node.id} title={`${node.id.toUpperCase()}`} subtitle={`${node.type.toUpperCase()} • ${node.host}`}>
            <div className="stack">
              <div className="spread">
                <span className="muted">Status</span>
                <Badge tone={node.status === 'online' ? 'success' : node.status === 'degraded' ? 'warning' : 'critical'}>
                  {node.status}
                </Badge>
              </div>
              <div className="spread">
                <span className="muted">Version</span>
                <span>{node.version}</span>
              </div>
              <div className="spread">
                <span className="muted">Peers</span>
                <span>{node.metrics.peers ?? 'n/a'}</span>
              </div>
              <div className="spread">
                <span className="muted">Lag</span>
                <span>{node.metrics.lag !== undefined ? `${node.metrics.lag}s` : 'n/a'}</span>
              </div>
              {node.lastSeenAt && (
                <div className="spread">
                  <span className="muted">Last seen</span>
                  <span>{node.lastSeenAt}</span>
                </div>
              )}
            </div>
          </Card>
        ))}
        {!nodes.length && (
          <Card title="Nodes">
            <div className="muted">No nodes reported by /nodes API.</div>
          </Card>
        )}
      </div>
    </div>
  );
}
