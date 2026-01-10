import { Card, Badge } from '@ghostl/ui';
import type { ChainInfo, EpochInfo, ReorgEvent } from '@ghostl/types/chain';
import { apiFetch } from '../../src/lib/api';

type ChainStatusResponse = {
  info: ChainInfo;
  epoch: EpochInfo;
  blockTimeMs: number;
  finalityLag: number;
  reorgs: ReorgEvent[];
};

type TelemetryResponse = {
  participation: number;
  latency: Record<string, number>;
  health: Record<string, unknown>;
};

type PeerResponse = {
  peers: { id: string; address: string; latencyMs?: number }[];
  topology: Record<string, unknown>;
};

const defaultChains = {
  l1: {
    info: { chainId: '701', name: 'GhostL1 Devnet', env: 'devnet', consensus: 'L1 rollup' },
    epoch: { epoch: 0 },
    blockTimeMs: 2000,
    finalityLag: 0
  },
  l2: null as unknown as ChainStatusResponse,
  l3: {
    info: { chainId: '1101', name: 'GhostL3 Devnet', env: 'devnet', consensus: 'L3 rollup' },
    epoch: { epoch: 0 },
    blockTimeMs: 2000,
    finalityLag: 0
  }
};

export default async function ChainPage() {
  const [status, telemetry, peers] = await Promise.all([
    apiFetch<ChainStatusResponse>('/chain/status', {
      fallback: {
        info: { chainId: '', name: 'unknown', env: '', consensus: '' },
        epoch: { epoch: 0, round: 0, start: '', end: '' },
        blockTimeMs: 0,
        finalityLag: 0,
        reorgs: []
      }
    }),
    apiFetch<TelemetryResponse>('/chain/telemetry', {
      fallback: { participation: 0, latency: {}, health: {} }
    }),
    apiFetch<PeerResponse>('/chain/peers', { fallback: { peers: [], topology: {} } })
  ]);

  const participation =
    typeof telemetry.participation === 'number' ? `${Math.round(telemetry.participation * 100)}%` : 'n/a';
  const blockTime = status.blockTimeMs ? `${(status.blockTimeMs / 1000).toFixed(2)}s` : 'n/a';
  const latencyP50 =
    typeof telemetry.latency?.p50 === 'number' ? `${telemetry.latency.p50} ms` : 'n/a';
  const healthSamples = Array.isArray((telemetry.health as { services?: unknown[] })?.services)
    ? 'ok'
    : 'n/a';
  const chains = ['l1', 'l2', 'l3'].map((key) => {
    if (key === 'l2') {
      return { key, status, participation, blockTime, latencyP50, healthSamples };
    }
    const fallback = defaultChains[key as 'l1' | 'l3'];
    return {
      key,
      status: {
        info: fallback.info,
        epoch: { epoch: fallback.epoch.epoch, round: 0, start: '', end: '' },
        blockTimeMs: fallback.blockTimeMs,
        finalityLag: fallback.finalityLag,
        reorgs: []
      },
      participation: 'n/a',
      blockTime: `${(fallback.blockTimeMs / 1000).toFixed(2)}s`,
      latencyP50: 'n/a',
      healthSamples: 'n/a'
    };
  });

  return (
    <div className="content">
      <div className="card-grid">
        {chains.map((chain) => (
          <Card key={chain.key} title={chain.status.info.name || 'Chain'} subtitle={`Chain ${chain.status.info.chainId || 'n/a'}`}>
            <div className="stack">
              <div className="spread">
                <span className="muted">Environment</span>
                <span>{chain.status.info.env || 'n/a'}</span>
              </div>
              <div className="spread">
                <span className="muted">Consensus</span>
                <span>{chain.status.info.consensus || 'n/a'}</span>
              </div>
              <div className="spread">
                <span className="muted">Epoch</span>
                <Badge>{chain.status.epoch.epoch ?? 0}</Badge>
              </div>
              <div className="spread">
                <span className="muted">Block time</span>
                <span>{chain.blockTime}</span>
              </div>
              <div className="spread">
                <span className="muted">Finality lag</span>
                <span>{chain.status.finalityLag ?? 0}</span>
              </div>
              <div className="spread">
                <span className="muted">Participation</span>
                <Badge tone="success">{chain.participation}</Badge>
              </div>
              <div className="spread">
                <span className="muted">Latency (p50)</span>
                <span>{chain.latencyP50}</span>
              </div>
              <div className="spread">
                <span className="muted">Health samples</span>
                <span>{chain.healthSamples}</span>
              </div>
            </div>
          </Card>
        ))}

        <Card title="Peers" subtitle={`Total ${peers.peers.length}`}>
          <div className="stack" style={{ gap: 6 }}>
            {peers.peers.slice(0, 5).map((p) => (
              <div key={p.id} className="spread">
                <span>{p.id}</span>
                <span className="muted">{p.latencyMs !== undefined ? `${p.latencyMs} ms` : 'n/a'}</span>
              </div>
            ))}
            {!peers.peers.length && <div className="muted">No peers reported.</div>}
          </div>
        </Card>

        <Card title="Reorgs" subtitle="Recent events">
          <div className="stack" style={{ gap: 6 }}>
            {status.reorgs.slice(0, 5).map((r) => (
              <div key={`${r.fromBlock}-${r.toBlock}-${r.depth}`} className="row" style={{ justifyContent: 'space-between' }}>
                <div className="muted">
                  {r.fromBlock} → {r.toBlock}
                </div>
                <Badge tone="warning">depth {r.depth}</Badge>
              </div>
            ))}
            {!status.reorgs.length && <div className="muted">No recent reorgs.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
