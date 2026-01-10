import { Card, Badge } from '@ghostl/ui';
import type { Node, NodeMetrics } from '@ghostl/types/nodes';
import { apiFetch } from '../../src/lib/api';
import { NodeDetail } from '../../src/modules/nodes/components/NodeDetail';

type NodeDetail = Node & { metrics: NodeMetrics };

const fallbackMetrics: NodeMetrics = { cpu: 0, mem: 0, disk: 0, peers: 0 };
const DEVOPS_URL = process.env.NEXT_PUBLIC_DEVOPS_URL || 'http://localhost:7623';

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
      <div className="muted" style={{ marginBottom: 8 }}>
        Node actions are routed via DEVOPS orchestrator at {DEVOPS_URL}.
      </div>
      <div className="card-grid">
        {nodes.map((node) => (
          <NodeDetail key={node.id} node={node} metrics={node.metrics} />
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
