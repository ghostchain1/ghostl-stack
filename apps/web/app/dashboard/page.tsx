import Link from 'next/link';
import { Badge, Card } from '@ghostl/ui';
import { ChainOverviewSchema, type ChainOverview } from '@ghostl/contract-schemas';
import type { ApiError } from '../../src/lib/api';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';
import { serverApiRequest } from '../../src/lib/server-api';

type BridgeSummary = {
  summary?: {
    pending?: number;
    finalized?: number;
    signaturesMissing?: number;
  };
};

type LayerKey = 'l1' | 'l2' | 'l3';

const layerOrder: LayerKey[] = ['l3', 'l2', 'l1'];
const layerLabel: Record<LayerKey, string> = {
  l1: 'GhostL1',
  l2: 'GhostL2',
  l3: 'GhostL3'
};

const formatLag = (value?: number) => (typeof value === 'number' ? value.toString() : 'n/a');
const formatBlock = (value?: number) => (typeof value === 'number' ? value.toLocaleString('en-US') : 'n/a');
const lagTone = (value?: number): 'default' | 'success' | 'warning' | 'critical' => {
  if (typeof value !== 'number') return 'default';
  if (value > 12) return 'critical';
  if (value > 5) return 'warning';
  return 'success';
};

export default async function DashboardPage() {
  const [overviewRes, bridgeRes] = await Promise.all([
    serverApiRequest<ChainOverview>('/chain', {
      init: { cache: 'no-store' },
      schema: ChainOverviewSchema
    }),
    serverApiRequest<BridgeSummary>('/api/bridge', { init: { cache: 'no-store' } })
  ]);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!overviewRes.ok) errors.push({ title: 'Chain overview', error: overviewRes.error });
  if (!bridgeRes.ok) errors.push({ title: 'Bridge summary', error: bridgeRes.error });

  const chains = overviewRes.ok ? overviewRes.data.chains : [];
  const chainById = chains.reduce<Partial<Record<LayerKey, ChainOverview['chains'][number]>>>((acc, chain) => {
    const id = chain.id as LayerKey;
    if (id === 'l1' || id === 'l2' || id === 'l3') acc[id] = chain;
    return acc;
  }, {});

  const bridgeSummary = bridgeRes.ok ? bridgeRes.data.summary : undefined;

  const l1Lag = chainById.l1?.finalityLag;
  const l2Lag = chainById.l2?.finalityLag;
  const l3Lag = chainById.l3?.finalityLag;
  const hasCascadeTelemetry = typeof l1Lag === 'number' && typeof l2Lag === 'number' && typeof l3Lag === 'number';
  const cascadeTone: 'default' | 'success' | 'warning' | 'critical' = !hasCascadeTelemetry
    ? 'default'
    : (l1Lag ?? 0) > 12 || (l2Lag ?? 0) > 12 || (l3Lag ?? 0) > 12
      ? 'critical'
      : (l1Lag ?? 0) > 5 || (l2Lag ?? 0) > 5 || (l3Lag ?? 0) > 5
        ? 'warning'
        : 'success';

  return (
    <div className="content">
      <div className="hero card">
        <div className="hero-main">
          <span className="hero-badge">Cascading Finality</span>
          <h2 style={{ margin: '10px 0 8px', fontSize: '1.7rem' }}>GhostL3 → GhostL2 → GhostL1</h2>
          <div className="muted" style={{ maxWidth: 760 }}>
            L1 remains the sovereign finality authority. This view is telemetry-only and helps operators monitor whether
            finality lag and bridge settlement stay within policy bounds.
          </div>
          <div className="hero-actions">
            <Link className="button" href="/observability/stack">
              Open stack telemetry
            </Link>
            <Link className="button secondary" href="/bridge">
              Open bridge console
            </Link>
            <Link className="button secondary" href="/observability/alerts">
              Open alert stream
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Settlement Route</div>
              <div className="kpi-value">L3 → L2 → L1</div>
              <div className="kpi-foot">No bypass paths</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Cascade Signal</div>
              <div className="kpi-value">
                <Badge tone={cascadeTone}>{hasCascadeTelemetry ? 'Tracked' : 'Unavailable'}</Badge>
              </div>
              <div className="kpi-foot">Lag-derived health state</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Bridge Pending</div>
              <div className="kpi-value">{bridgeSummary?.pending ?? 'n/a'}</div>
              <div className="kpi-foot">Messages waiting finalize</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Bridge Finalized</div>
              <div className="kpi-value">{bridgeSummary?.finalized ?? 'n/a'}</div>
              <div className="kpi-foot">Completed settlements</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}

        {layerOrder.map((layer) => {
          const chain = chainById[layer];
          const lag = chain?.finalityLag;
          return (
            <Card key={layer} title={layerLabel[layer]} subtitle={`Layer ${layer.toUpperCase()}`}>
              <div className="stack">
                <div className="spread">
                  <span className="muted">Chain ID</span>
                  <span>{chain?.info?.chainId ?? 'n/a'}</span>
                </div>
                <div className="spread">
                  <span className="muted">Head block</span>
                  <span>{formatBlock(chain?.rpc?.blockNumber)}</span>
                </div>
                <div className="spread">
                  <span className="muted">Finality lag</span>
                  <Badge tone={lagTone(lag)}>{formatLag(lag)}</Badge>
                </div>
                <div className="spread">
                  <span className="muted">Consensus</span>
                  <span>{chain?.info?.consensus ?? 'n/a'}</span>
                </div>
              </div>
            </Card>
          );
        })}

        <Card title="Bridge Settlement" subtitle="L1 hub route">
          <div className="stack">
            <div className="spread">
              <span className="muted">Pending finalize</span>
              <Badge tone={(bridgeSummary?.pending ?? 0) > 0 ? 'warning' : 'default'}>
                {bridgeSummary?.pending ?? 'n/a'}
              </Badge>
            </div>
            <div className="spread">
              <span className="muted">Finalized</span>
              <span>{bridgeSummary?.finalized ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Signatures missing</span>
              <Badge tone={(bridgeSummary?.signaturesMissing ?? 0) > 0 ? 'warning' : 'default'}>
                {bridgeSummary?.signaturesMissing ?? 'n/a'}
              </Badge>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              External chain traffic is routed only through GhostL1 BridgeHub.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
