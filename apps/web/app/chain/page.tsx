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

  const participation = telemetry.participation ? `${Math.round(telemetry.participation * 100)}%` : 'n/a';
  const blockTime = status.blockTimeMs ? `${(status.blockTimeMs / 1000).toFixed(2)}s` : 'n/a';

  return (
    <div className="content">
      <div className="card-grid">
        <Card title={status.info.name || 'Chain'} subtitle={`Chain ${status.info.chainId || 'n/a'}`}>
          <div className="stack">
            <div className="spread">
              <span className="muted">Environment</span>
              <span>{status.info.env || 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Consensus</span>
              <span>{status.info.consensus || 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Epoch</span>
              <Badge>{status.epoch.epoch ?? 0}</Badge>
            </div>
            <div className="spread">
              <span className="muted">Block time</span>
              <span>{blockTime}</span>
            </div>
            <div className="spread">
              <span className="muted">Finality lag</span>
              <span>{status.finalityLag ?? 0}</span>
            </div>
          </div>
        </Card>

        <Card title="Consensus telemetry" subtitle="Participation & latency">
          <div className="stack">
            <div className="spread">
              <span className="muted">Participation</span>
              <Badge tone="success">{participation}</Badge>
            </div>
            <div className="spread">
              <span className="muted">Latency (p50)</span>
              <span>{telemetry.latency?.p50 ? `${telemetry.latency.p50} ms` : 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Health samples</span>
              <span>{Array.isArray((telemetry.health as { services?: unknown[] })?.services) ? 'ok' : 'n/a'}</span>
            </div>
          </div>
        </Card>

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
