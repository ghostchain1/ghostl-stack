import { Badge, Card } from '@ghostchain/ui';
import { ChainOverviewSchema, type ChainOverview } from '@ghostchain/contract-schemas';
import type { ApiError } from '../../src/lib/api';
import { serverApiRequest } from '../../src/lib/server-api';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';

const formatPercent = (value?: number) => (typeof value === 'number' ? `${Math.round(value * 100)}%` : 'n/a');
const formatSeconds = (value?: number) => (typeof value === 'number' ? `${(value / 1000).toFixed(2)}s` : 'n/a');

export default async function ChainPage() {
  const overviewRes = await serverApiRequest<ChainOverview>('/chain', {
    init: { cache: 'no-store' },
    schema: ChainOverviewSchema
  });
  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!overviewRes.ok) errors.push({ title: 'Chain overview', error: overviewRes.error });

  const chains = overviewRes.ok ? overviewRes.data.chains : [];

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        {chains.map((chain) => {
          const participation = formatPercent(chain.telemetry?.participation);
          const latencyP50 =
            typeof chain.telemetry?.latency?.p50 === 'number' ? `${chain.telemetry.latency.p50} ms` : 'n/a';
          const healthSamples = Array.isArray(chain.telemetry?.health?.services)
            ? `${chain.telemetry?.health?.services.length ?? 0} samples`
            : 'n/a';
          return (
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
                  <Badge tone="success">{participation}</Badge>
                </div>
                <div className="spread">
                  <span className="muted">Latency (p50)</span>
                  <span>{latencyP50}</span>
                </div>
                <div className="spread">
                  <span className="muted">Health samples</span>
                  <span>{healthSamples}</span>
                </div>
                <div className="spread">
                  <span className="muted">Peers</span>
                  <span>{chain.rpc.peers ?? 'n/a'}</span>
                </div>
                {chain.peers?.peers?.length ? (
                  <div className="stack" style={{ gap: 6 }}>
                    {chain.peers.peers.slice(0, 5).map((peer) => (
                      <div key={peer.id} className="spread">
                        <span>{peer.id}</span>
                        <span className="muted">{peer.latencyMs !== undefined ? `${peer.latencyMs} ms` : 'n/a'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted">Peer graph unavailable.</div>
                )}
                {chain.reorgs?.length ? (
                  <div className="stack" style={{ gap: 6 }}>
                    {chain.reorgs.slice(0, 5).map((r) => (
                      <div key={`${r.fromBlock}-${r.toBlock}-${r.depth}`} className="row" style={{ justifyContent: 'space-between' }}>
                        <div className="muted">
                          {r.fromBlock} → {r.toBlock}
                        </div>
                        <Badge tone="warning">depth {r.depth}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted">No recent reorgs.</div>
                )}
              </div>
            </Card>
          );
        })}
        {!chains.length && !errors.length && (
          <Card title="Chain overview">
            <div className="muted">No chain data returned by /chain.</div>
          </Card>
        )}
      </div>
    </div>
  );
}
