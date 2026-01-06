import { Card, Badge } from '@ghostl/ui';
import { rpcCall } from '../../src/lib/rpc';

type ChainSnapshot = {
  id: string;
  name: string;
  env: string;
  chainId: number;
  block?: number;
  baseFee?: string;
  peers?: number;
  lagSeconds?: number;
};

const rpcEndpoints = [
  { id: 'l2', name: 'GhostL2', env: 'local', rpc: process.env.NEXT_PUBLIC_L2_RPC || 'http://localhost:9545' },
  { id: 'l3', name: 'GhostL3', env: 'local', rpc: process.env.NEXT_PUBLIC_L3_RPC || 'http://localhost:10545' }
];

async function collectChainSnapshot(rpc: string, id: string, name: string, env: string): Promise<ChainSnapshot> {
  try {
    const [chainIdHex, blockHex, peersHex, block] = await Promise.all([
      rpcCall<string>(rpc, 'eth_chainId'),
      rpcCall<string>(rpc, 'eth_blockNumber'),
      rpcCall<string>(rpc, 'net_peerCount').catch(() => '0x0'),
      rpcCall<{ baseFeePerGas?: string; timestamp?: string }>(rpc, 'eth_getBlockByNumber', ['latest', false])
    ]);
    const chainId = parseInt(chainIdHex || '0x0', 16);
    const blockNum = parseInt(blockHex || '0x0', 16);
    const peers = parseInt(peersHex || '0x0', 16);
    const lagSeconds = block?.timestamp ? Math.max(0, Date.now() / 1000 - parseInt(block.timestamp, 16)) : undefined;
    const baseFee = block?.baseFeePerGas ? `${Number(BigInt(block.baseFeePerGas)) / 1e9} gwei` : undefined;
    return { id, name, env, chainId, block: blockNum, peers, baseFee, lagSeconds };
  } catch {
    return { id, name, env, chainId: 0 };
  }
}

export default async function ChainPage() {
  const snapshots = await Promise.all(
    rpcEndpoints.map((net) => collectChainSnapshot(net.rpc, net.id, net.name, net.env))
  );

  return (
    <div className="content">
      <div className="card-grid">
        {snapshots.map((snap) => (
          <Card key={snap.id} title={`${snap.name}`} subtitle={`Chain ${snap.chainId || 'n/a'}`}>
            <div className="stack">
              <div className="spread">
                <span className="muted">Environment</span>
                <span>{snap.env}</span>
              </div>
              <div className="spread">
                <span className="muted">Block</span>
                <Badge>{snap.block ?? 'n/a'}</Badge>
              </div>
              <div className="spread">
                <span className="muted">Peers</span>
                <span>{snap.peers ?? 'n/a'}</span>
              </div>
              <div className="spread">
                <span className="muted">Base fee</span>
                <span>{snap.baseFee ?? 'n/a'}</span>
              </div>
              <div className="spread">
                <span className="muted">Lag (s)</span>
                <span>{snap.lagSeconds !== undefined ? Math.round(snap.lagSeconds) : 'n/a'}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
