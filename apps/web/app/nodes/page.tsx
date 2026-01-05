import { Card, Badge } from '@ghostl/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type NodeListItem = {
  id: string;
  type: string;
  host: string;
  version: string;
  status: string;
  lastSeenAt?: string;
};

type NodeDetail = {
  node: NodeListItem;
  metrics: { cpu: number; peers: number; lag?: number };
};

async function fetchNodes(): Promise<NodeListItem[]> {
  try {
    const res = await fetch(`${API_URL}/nodes`, { next: { revalidate: 10 } });
    if (!res.ok) throw new Error('failed');
    return res.json();
  } catch {
    return [];
  }
}

async function fetchNodeDetail(id: string): Promise<NodeDetail | null> {
  try {
    const res = await fetch(`${API_URL}/nodes/${id}`, { next: { revalidate: 10 } });
    if (!res.ok) throw new Error('failed');
    return res.json();
  } catch {
    return null;
  }
}

export default async function NodesPage() {
  const nodes = await fetchNodes();
  const details = await Promise.all(nodes.map((n) => fetchNodeDetail(n.id)));

  return (
    <div className="content">
      <div className="card-grid">
        {nodes.map((node, idx) => {
          const detail = details[idx];
          return (
            <Card
              key={node.id}
              title={`${node.id}`}
              subtitle={`${node.type.toUpperCase()} • ${node.host}`}
            >
              <div className="stack">
                <div className="spread">
                  <span className="muted">Status</span>
                  <Badge tone={node.status === 'online' ? 'success' : 'critical'}>{node.status}</Badge>
                </div>
                <div className="spread">
                  <span className="muted">Last seen</span>
                  <span>{node.lastSeenAt ? new Date(node.lastSeenAt).toLocaleTimeString() : 'n/a'}</span>
                </div>
                <div className="spread">
                  <span className="muted">Version</span>
                  <span>{node.version}</span>
                </div>
                <div className="spread">
                  <span className="muted">CPU</span>
                  <span>{detail ? `${Math.round(detail.metrics.cpu)}%` : 'n/a'}</span>
                </div>
                <div className="spread">
                  <span className="muted">Peers</span>
                  <span>{detail?.metrics.peers ?? 'n/a'}</span>
                </div>
                <div className="spread">
                  <span className="muted">Finality lag</span>
                  <span>{detail?.metrics.lag ?? 'n/a'}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
