import { Card, Badge } from '@ghostl/ui';
import { rpcCall } from '../../src/lib/rpc';

type NodeSnapshot = {
  id: string;
  type: string;
  host: string;
  version: string;
  status: 'online' | 'offline' | 'degraded';
  peers?: number;
  lagSeconds?: number;
};

const rpcEndpoints = [
  { id: 'l2', type: 'validator', host: 'l2 rpc', rpc: process.env.NEXT_PUBLIC_L2_RPC || 'http://localhost:9545' },
  { id: 'l3', type: 'validator', host: 'l3 rpc', rpc: process.env.NEXT_PUBLIC_L3_RPC || 'http://localhost:10545' }
];

async function collectNode(rpc: string, id: string, type: string, host: string): Promise<NodeSnapshot> {
  try {
    const [blockHex, peersHex, version, block] = await Promise.all([
      rpcCall<string>(rpc, 'eth_blockNumber'),
      rpcCall<string>(rpc, 'net_peerCount').catch(() => '0x0'),
      rpcCall<string>(rpc, 'web3_clientVersion').catch(() => 'unknown'),
      rpcCall<{ timestamp?: string }>(rpc, 'eth_getBlockByNumber', ['latest', false])
    ]);
    const peers = parseInt(peersHex || '0x0', 16);
    const lagSeconds = block?.timestamp ? Math.max(0, Date.now() / 1000 - parseInt(block.timestamp, 16)) : undefined;
    const blockNum = parseInt(blockHex || '0x0', 16);
    const status: NodeSnapshot['status'] = blockNum > 0 ? 'online' : 'degraded';
    return { id, type, host, version, status, peers, lagSeconds };
  } catch {
    return { id, type, host, version: 'unknown', status: 'offline' };
  }
}

export default async function NodesPage() {
  const nodes = await Promise.all(rpcEndpoints.map((n) => collectNode(n.rpc, n.id, n.type, n.host)));

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
                <span>{node.peers ?? 'n/a'}</span>
              </div>
              <div className="spread">
                <span className="muted">Lag</span>
                <span>{node.lagSeconds !== undefined ? `${Math.round(node.lagSeconds)}s` : 'n/a'}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
