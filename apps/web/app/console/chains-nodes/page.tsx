import Link from 'next/link';
import { Card, Badge } from '@ghostl/ui';
import { ChainOverviewSchema, type ChainOverview } from '@ghostl/contract-schemas';
import type { Node } from '@ghostl/types/nodes';
import type { ApiError } from '../../../src/lib/api';
import { serverApiRequest } from '../../../src/lib/server-api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';

export default async function ChainsNodesPage() {
  const [overviewRes, nodesRes] = await Promise.all([
    serverApiRequest<ChainOverview>('/chain', { init: { cache: 'no-store' }, schema: ChainOverviewSchema }),
    serverApiRequest<Node[]>('/nodes', { init: { cache: 'no-store' } })
  ]);
  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!overviewRes.ok) errors.push({ title: 'Chain overview', error: overviewRes.error });
  if (!nodesRes.ok) errors.push({ title: 'Node inventory', error: nodesRes.error });

  const chains = overviewRes.ok ? overviewRes.data.chains : [];
  const nodes = nodesRes.ok ? nodesRes.data : [];

  const formatPercent = (value?: number) => (typeof value === 'number' ? `${Math.round(value * 100)}%` : 'n/a');
  const formatSeconds = (value?: number) => (typeof value === 'number' ? `${(value / 1000).toFixed(2)}s` : 'n/a');

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        {chains.map((chain) => (
          <Card key={chain.id} title={chain.info?.name || chain.label} subtitle={`Chain ${chain.info?.chainId || 'n/a'}`}>
            <div className="stack">
              <div className="spread">
                <span className="muted">Environment</span>
                <span>{chain.info?.env || 'n/a'}</span>
              </div>
              <div className="spread">
                <span className="muted">Consensus</span>
                <span>{chain.info?.consensus || 'n/a'}</span>
              </div>
              <div className="spread">
                <span className="muted">Head block</span>
                <span>{chain.rpc.blockNumber ?? 'n/a'}</span>
              </div>
              <div className="spread">
                <span className="muted">Block time</span>
                <span>{formatSeconds(chain.blockTimeMs)}</span>
              </div>
              <div className="spread">
                <span className="muted">Finality lag</span>
                <span>{chain.finalityLag ?? 'n/a'}</span>
              </div>
              <div className="spread">
                <span className="muted">Participation</span>
                <Badge tone="success">{formatPercent(chain.telemetry?.participation)}</Badge>
              </div>
              <div className="spread">
                <span className="muted">Latency (p50)</span>
                <span>
                  {typeof chain.telemetry?.latency?.p50 === 'number' ? `${chain.telemetry.latency.p50} ms` : 'n/a'}
                </span>
              </div>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <Link className="button secondary" href="/chain">
                Chain detail
              </Link>
              <Link className="button secondary" href="/explorer/txs">
                Explorer
              </Link>
            </div>
          </Card>
        ))}
        {!chains.length && !errors.length && (
          <Card title="Chain overview">
            <div className="muted">No chain data returned by /chain.</div>
          </Card>
        )}
        {!errors.find((e) => e.title === 'Node inventory') && (
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
        )}
      </div>
    </div>
  );
}
