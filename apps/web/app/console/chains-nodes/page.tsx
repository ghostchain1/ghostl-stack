import Link from 'next/link';
import { Card, Badge } from '@ghostl/ui';
import type { ChainInfo, EpochInfo, ReorgEvent } from '@ghostl/types/chain';
import type { Node } from '@ghostl/types/nodes';
import { apiFetch } from '../../../src/lib/api';

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

const fallbackStatus: ChainStatusResponse = {
  info: { chainId: '', name: 'unknown', env: '', consensus: '' },
  epoch: { epoch: 0, round: 0, start: '', end: '' },
  blockTimeMs: 0,
  finalityLag: 0,
  reorgs: []
};

export default async function ChainsNodesPage() {
  const [status, telemetry, nodes] = await Promise.all([
    apiFetch<ChainStatusResponse>('/chain/status', { fallback: fallbackStatus }),
    apiFetch<TelemetryResponse>('/chain/telemetry', { fallback: { participation: 0, latency: {}, health: {} } }),
    apiFetch<Node[]>('/nodes', { fallback: [] })
  ]);

  const participation = typeof telemetry.participation === 'number' ? `${Math.round(telemetry.participation * 100)}%` : 'n/a';
  const blockTime = status.blockTimeMs ? `${(status.blockTimeMs / 1000).toFixed(2)}s` : 'n/a';
  const latencyP50 = typeof telemetry.latency?.p50 === 'number' ? `${telemetry.latency.p50} ms` : 'n/a';

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
            <div className="spread">
              <span className="muted">Participation</span>
              <Badge tone="success">{participation}</Badge>
            </div>
            <div className="spread">
              <span className="muted">Latency (p50)</span>
              <span>{latencyP50}</span>
            </div>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <Link className="button secondary" href="/chain">
              Chain detail
            </Link>
            <Link className="button secondary" href="/explorer/blocks">
              Explorer
            </Link>
          </div>
        </Card>
        <Card title="Node inventory" subtitle={`${nodes.length} nodes tracked`}>
          <div className="stack">
            {nodes.slice(0, 6).map((node) => (
              <div key={node.id} className="spread">
                <span>{node.id}</span>
                <span className={node.status === 'online' ? 'pill' : 'pill warn'}>{node.status || 'unknown'}</span>
              </div>
            ))}
            {!nodes.length && <div className="muted">No nodes reported by /nodes API.</div>}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <Link className="button secondary" href="/nodes">
              Node detail
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
