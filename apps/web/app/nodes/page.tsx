import { Card } from '@ghostl/ui';
import type { Node, NodeMetrics } from '@ghostl/types/nodes';
import type { ApiError } from '../../src/lib/api';
import { serverApiRequest } from '../../src/lib/server-api';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';
import { NodeDetail } from '../../src/modules/nodes/components/NodeDetail';
import { resolveDevopsBase } from '../../src/lib/runtime';

type NodeDetailRecord = Node & { metrics: NodeMetrics };

const DEVOPS_URL = resolveDevopsBase();

async function loadNodeDetails(): Promise<{ nodes: NodeDetailRecord[]; errors: Array<{ title: string; error: ApiError }> }> {
  const listRes = await serverApiRequest<Node[]>('/nodes', { init: { cache: 'no-store' } });
  if (!listRes.ok) {
    return { nodes: [], errors: [{ title: 'Nodes list', error: listRes.error }] };
  }
  const detailResults = await Promise.all(
    listRes.data.map((node) =>
      serverApiRequest<{ node: Node; metrics: NodeMetrics }>(`/nodes/${encodeURIComponent(node.id)}`, {
        init: { cache: 'no-store' }
      }).then((res) => ({ node, res }))
    )
  );
  const nodes: NodeDetailRecord[] = [];
  const errors: Array<{ title: string; error: ApiError }> = [];
  detailResults.forEach(({ node, res }) => {
    if (!res.ok) {
      errors.push({ title: `Node detail ${node.id}`, error: res.error });
      return;
    }
    nodes.push({ ...node, ...(res.data.node || {}), metrics: res.data.metrics });
  });
  return { nodes, errors };
}

export default async function NodesPage() {
  const { nodes, errors } = await loadNodeDetails();

  return (
    <div className="content">
      <div className="muted" style={{ marginBottom: 8 }}>
        Node actions are routed via DEVOPS orchestrator at {DEVOPS_URL}.
      </div>
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        {nodes.map((node) => (
          <NodeDetail key={node.id} node={node} metrics={node.metrics} />
        ))}
        {!nodes.length && !errors.length && (
          <Card title="Nodes">
            <div className="muted">No nodes reported by /nodes API.</div>
          </Card>
        )}
      </div>
    </div>
  );
}
