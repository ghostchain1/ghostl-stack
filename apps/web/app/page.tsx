'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../src/lib/api';
import { rpcCall } from '../src/lib/rpc';
import { useSession } from '../src/modules/identity-access/session';
import { normalizeRole, roleOrder } from '../src/modules/identity-access/access-policy';

type RpcSnapshot = {
  id: string;
  label: string;
  rpc: string;
  targetChainId: number;
  status: 'loading' | 'ok' | 'error';
  chainId?: number;
  blockNumber?: number;
  gasPriceGwei?: number;
  peers?: number;
};

type StackOverview = {
  chain: string;
  head?: number;
  finalized?: number;
  lag?: number;
  relayer?: { finalized?: number; errors?: number };
  guard?: { alerts?: number; deposits?: number };
};

type ChainStatus = {
  info?: { chainId: string; name: string; env: string; consensus: string };
  blockTimeMs?: number;
  finalityLag?: number;
  reorgs?: { depth: number }[];
};

type ApiHealth = {
  status?: string;
  dependencies?: Record<string, { ok?: boolean; url?: string }>;
};
type AlertSummary = { total: number; active: number };
type RpcEndpoint = { url: string; protocol?: string; status?: string };
type RpcPoolResponse = { pool?: { L1?: RpcEndpoint[]; L2?: RpcEndpoint[]; L3?: RpcEndpoint[] } };

const L1_CHAIN_ID = Number(process.env.NEXT_PUBLIC_L1_CHAIN_ID || 14000101);
const L2_CHAIN_ID = Number(process.env.NEXT_PUBLIC_L2_CHAIN_ID || 901);
const L3_CHAIN_ID = Number(process.env.NEXT_PUBLIC_L3_CHAIN_ID || 903);

const BASE_NETWORKS = [
  { id: 'l1', label: 'GhostChain L1', targetChainId: L1_CHAIN_ID, rpc: '' },
  { id: 'l2', label: 'GhostL2', targetChainId: L2_CHAIN_ID, rpc: '' },
  { id: 'l3', label: 'GhostL3', targetChainId: L3_CHAIN_ID, rpc: '' }
];

const parseHexNumber = (value?: string | null) => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatNumber = (value?: number, digits = 0) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
};

const formatMs = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '--';
  return `${(value / 1000).toFixed(2)}s`;
};

const formatStatus = (value?: string) => (value ? value.toUpperCase() : 'UNKNOWN');

export default function HomePage() {
  const { user } = useSession();
  const userRole = normalizeRole(user?.role);
  const canReadObservability = roleOrder[userRole] >= roleOrder.OPERATOR;
  const canReadIntegrations = roleOrder[userRole] >= roleOrder.OPERATOR;
  const [networkConfigs, setNetworkConfigs] = useState(BASE_NETWORKS);
  const [rpcSnapshots, setRpcSnapshots] = useState<Record<string, RpcSnapshot>>(() => {
    const initial: Record<string, RpcSnapshot> = {};
    BASE_NETWORKS.forEach((network) => {
      initial[network.id] = { ...network, status: 'loading' };
    });
    return initial;
  });
  const [stackOverview, setStackOverview] = useState<{ l2?: StackOverview | null; l3?: StackOverview | null }>({});
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null);
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null);
  const [alertSummary, setAlertSummary] = useState<AlertSummary>({ total: 0, active: 0 });

  useEffect(() => {
    let active = true;

    const loadRpc = async () => {
      const results = await Promise.all(
        networkConfigs.map(async (network) => {
          if (!network.rpc) {
            return { ...network, status: 'error' as const };
          }
          try {
            const [chainHex, blockHex, gasHex, peerHex] = await Promise.all([
              rpcCall<string>(network.rpc, 'eth_chainId'),
              rpcCall<string>(network.rpc, 'eth_blockNumber'),
              rpcCall<string>(network.rpc, 'eth_gasPrice'),
              rpcCall<string>(network.rpc, 'net_peerCount')
            ]);
            const chainId = parseHexNumber(chainHex);
            const blockNumber = parseHexNumber(blockHex);
            const gasPrice = parseHexNumber(gasHex);
            const peers = parseHexNumber(peerHex);
            return {
              ...network,
              status: 'ok' as const,
              chainId,
              blockNumber,
              gasPriceGwei: gasPrice !== undefined ? gasPrice / 1e9 : undefined,
              peers
            };
          } catch {
            return { ...network, status: 'error' as const };
          }
        })
      );

      if (!active) return;
      setRpcSnapshots((prev) => {
        const next = { ...prev };
        results.forEach((snap) => {
          next[snap.id] = { ...prev[snap.id], ...snap } as RpcSnapshot;
        });
        return next;
      });
    };

    const loadApi = async () => {
      const [health, chain, l2, l3, poolResp, alerts] = await Promise.all([
        apiFetch<ApiHealth | null>('/health', { fallback: null }),
        apiFetch<ChainStatus | null>('/chain/status', { fallback: null }),
        apiFetch<StackOverview | null>('/stack/overview?chain=l2', { fallback: null }),
        apiFetch<StackOverview | null>('/stack/overview?chain=l3', { fallback: null }),
        canReadIntegrations ? apiFetch<RpcPoolResponse>('/rpc/pool', { fallback: {} }) : {},
        canReadObservability ? apiFetch<Array<{ state?: string }>>('/observability/alerts', { fallback: [] }) : []
      ]);

      if (!active) return;
      setApiHealth(health);
      setChainStatus(chain);
      setStackOverview({ l2, l3 });
      const pool = poolResp && typeof poolResp === 'object' ? (poolResp as RpcPoolResponse).pool : undefined;
      if (pool) {
        const pickUrl = (list?: RpcEndpoint[]) =>
          list?.find((endpoint) => endpoint.protocol !== 'ws')?.url || list?.[0]?.url || '';
        const updated = BASE_NETWORKS.map((network) => {
          const poolKey = network.id === 'l1' ? 'L1' : network.id === 'l2' ? 'L2' : 'L3';
          return { ...network, rpc: pickUrl(pool[poolKey]) };
        });
        const changed = updated.some((network, idx) => network.rpc !== networkConfigs[idx]?.rpc);
        if (changed) setNetworkConfigs(updated);
      }
      const total = Array.isArray(alerts) ? alerts.length : 0;
      const activeAlerts = Array.isArray(alerts) ? alerts.filter((alert) => alert.state !== 'resolved').length : 0;
      setAlertSummary({ total, active: activeAlerts });
    };

    loadRpc();
    loadApi();

    const interval = setInterval(() => {
      loadRpc();
      loadApi();
    }, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [canReadIntegrations, canReadObservability, networkConfigs]);

  const tools = useMemo(
    () => [
      {
        title: 'Chain Operations',
        description: 'Inspect chain health, nodes, and validator performance across layers.',
        actions: [
          { href: '/chain', label: 'Chain' },
          { href: '/nodes', label: 'Nodes' },
          { href: '/validators', label: 'Validators' }
        ]
      },
      {
        title: 'Bridge + Wallets',
        description: 'Control bridge flow, wallet posture, and explorer-level activity.',
        actions: [
          { href: '/bridge', label: 'Bridge' },
          { href: '/wallet', label: 'Wallets' },
          { href: '/explorer/txs', label: 'Explorer' }
        ]
      },
      {
        title: 'Observability Suite',
        description: 'Alerts, logs, and stack telemetry with pipeline diagnostics.',
        actions: [
          { href: '/observability', label: 'Overview' },
          { href: '/observability/alerts', label: 'Alerts' },
          { href: '/observability/logs', label: 'Logs' },
          { href: '/observability/stack', label: 'Stack' }
        ]
      },
      {
        title: 'Protocol Management',
        description: 'Contracts, token economics, and treasury operations.',
        actions: [
          { href: '/contracts', label: 'Contracts' },
          { href: '/tokenomics', label: 'Tokenomics' },
          { href: '/treasury', label: 'Treasury' }
        ]
      },
      {
        title: 'Governance + Compliance',
        description: 'Policy enforcement, audits, governance proposals, and access control.',
        actions: [
          { href: '/governance', label: 'Governance' },
          { href: '/compliance', label: 'Compliance' },
          { href: '/admin/users', label: 'Users' }
        ]
      },
      {
        title: 'DevOps + Integrations',
        description: 'Upgrade workflows, partner hooks, automation, and AI monitoring.',
        actions: [
          { href: '/devops', label: 'DevOps' },
          { href: '/integrations', label: 'Integrations' },
          { href: '/ai', label: 'AI' }
        ]
      }
    ],
    []
  );

  const l1Snapshot = rpcSnapshots.l1;
  const l2Snapshot = rpcSnapshots.l2;
  const l3Snapshot = rpcSnapshots.l3;

  const kpis = useMemo(
    () => [
      {
        label: 'L1 Head',
        value: formatNumber(l1Snapshot?.blockNumber),
        detail: 'RPC direct'
      },
      {
        label: 'L2 Head',
        value: formatNumber(l2Snapshot?.blockNumber),
        detail: 'Sequencer feed'
      },
      {
        label: 'L3 Head',
        value: formatNumber(l3Snapshot?.blockNumber),
        detail: 'Rollup-on-rollup'
      },
      {
        label: 'Finality Lag',
        value: formatMs(chainStatus?.finalityLag),
        detail: 'API telemetry'
      },
      {
        label: 'API Health',
        value: formatStatus(apiHealth?.status),
        detail: 'Control plane'
      }
    ],
    [apiHealth?.status, chainStatus?.finalityLag, l1Snapshot?.blockNumber, l2Snapshot?.blockNumber, l3Snapshot?.blockNumber]
  );

  const dependencies = useMemo(() => {
    if (!apiHealth?.dependencies) return [];
    return Object.entries(apiHealth.dependencies).slice(0, 4);
  }, [apiHealth?.dependencies]);

  return (
    <div className="content">
      <section className="card hero reveal">
        <div className="hero-main">
          <div className="hero-badge">GhostChain L1 / GhostL2 / GhostL3</div>
          <h1 style={{ margin: '12px 0 4px' }}>GhostL Command Center</h1>
          <p className="muted">
            GhostChain is your Ethereum clone settlement layer. GhostL2 mirrors Shibarium-style execution, while GhostL3 extends
            scale for app-specific workloads. This console streams both RPC data and API telemetry.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/devops">
              Run upgrade plan
            </Link>
            <Link className="button secondary" href="/observability">
              Open observability
            </Link>
            <Link className="button secondary" href="/chain">
              Inspect chain status
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <div className="kpi-grid">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="kpi-card">
                <div className="kpi-label">{kpi.label}</div>
                <div className="kpi-value">{kpi.value}</div>
                <div className="kpi-foot">{kpi.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card reveal">
        <div className="spread">
          <h3>Network snapshots (RPC)</h3>
          <span className="badge">Direct nodes</span>
        </div>
        <div className="data-grid">
          {networkConfigs.map((network) => {
            const snapshot = rpcSnapshots[network.id];
            const statusLabel = snapshot?.status === 'ok' ? 'Online' : snapshot?.status === 'error' ? 'RPC error' : 'Loading';
            return (
              <div key={network.id} className="data-card">
                <div className="spread">
                  <strong>{network.label}</strong>
                  <span className="pill">{statusLabel}</span>
                </div>
                <div className="metric">
                  <div className="metric-label">Chain ID</div>
                  <div className="metric-value">{formatNumber(snapshot?.chainId || network.targetChainId)}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Block</div>
                  <div className="metric-value">{formatNumber(snapshot?.blockNumber)}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Gas price</div>
                  <div className="metric-value">
                    {snapshot?.gasPriceGwei !== undefined ? `${snapshot.gasPriceGwei.toFixed(2)} gwei` : '--'}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">Peers</div>
                  <div className="metric-value">{formatNumber(snapshot?.peers)}</div>
                </div>
                <div className="muted">{network.rpc}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid-2">
        <div className="card reveal">
          <div className="spread">
            <h3>Control plane (API)</h3>
            <span className="badge">{formatStatus(apiHealth?.status)}</span>
          </div>
          <div className="stack">
            <div className="spread">
              <span className="muted">Chain</span>
              <strong>{chainStatus?.info?.name || '--'}</strong>
            </div>
            <div className="spread">
              <span className="muted">Consensus</span>
              <span className="chip">{chainStatus?.info?.consensus || '--'}</span>
            </div>
            <div className="spread">
              <span className="muted">Block time</span>
              <strong>{formatMs(chainStatus?.blockTimeMs)}</strong>
            </div>
            <div className="spread">
              <span className="muted">Finality lag</span>
              <strong>{formatMs(chainStatus?.finalityLag)}</strong>
            </div>
          </div>
          <div className="data-grid">
            {dependencies.map(([name, dep]) => (
              <div key={name} className="data-card">
                <div className="spread">
                  <span className="muted">{name}</span>
                  <span className="pill">{dep.ok ? 'ok' : 'down'}</span>
                </div>
                <div className="muted">{dep.url || 'unconfigured'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card reveal">
          <div className="spread">
            <h3>Rollup settlement (API)</h3>
            <span className="badge">Derivation</span>
          </div>
          <div className="data-grid">
            {[
              { label: 'GhostL2', data: stackOverview.l2 },
              { label: 'GhostL3', data: stackOverview.l3 }
            ].map((item) => (
              <div key={item.label} className="data-card">
                <div className="spread">
                  <strong>{item.label}</strong>
                  <span className="pill">{item.data ? 'tracking' : 'no data'}</span>
                </div>
                <div className="metric">
                  <div className="metric-label">Head</div>
                  <div className="metric-value">{formatNumber(item.data?.head)}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Finalized</div>
                  <div className="metric-value">{formatNumber(item.data?.finalized)}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Lag</div>
                  <div className="metric-value">{formatNumber(item.data?.lag)}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Relayer errors</div>
                  <div className="metric-value">{formatNumber(item.data?.relayer?.errors)}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Guard alerts</div>
                  <div className="metric-value">{formatNumber(item.data?.guard?.alerts)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card reveal">
        <div className="spread">
          <h3>Management tools</h3>
          <span className="badge">Full suite</span>
        </div>
        <div className="tool-grid">
          {tools.map((tool) => (
            <div key={tool.title} className="tool-card">
              <div className="stack">
                <div className="section-title">{tool.title}</div>
                <div className="muted">{tool.description}</div>
              </div>
              <div className="tool-actions">
                {tool.actions.map((action) => (
                  <Link key={action.href} className="button secondary" href={action.href}>
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card reveal">
        <div className="spread">
          <h3>Observability</h3>
          <span className="badge">Ops</span>
        </div>
        <div className="card-grid" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="section-title">Alerts</div>
            <div className="metric">
              <div className="metric-label">Active</div>
              <div className="metric-value">{formatNumber(alertSummary.active)}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Total</div>
              <div className="metric-value">{formatNumber(alertSummary.total)}</div>
            </div>
            <Link className="button secondary" href="/observability/alerts">
              View alerts
            </Link>
          </div>
          <div className="card">
            <div className="section-title">Telemetry endpoints</div>
            <div className="stack">
              <div className="spread">
                <span className="muted">Prometheus</span>
                <span className={apiHealth?.dependencies?.prometheus?.ok ? 'pill' : 'pill warn'}>
                  {apiHealth?.dependencies?.prometheus?.ok ? 'connected' : 'missing'}
                </span>
              </div>
              {apiHealth?.dependencies?.prometheus?.url && <div className="muted">{apiHealth.dependencies.prometheus.url}</div>}
              <div className="spread">
                <span className="muted">Grafana</span>
                <span className={apiHealth?.dependencies?.grafana?.ok ? 'pill' : 'pill warn'}>
                  {apiHealth?.dependencies?.grafana?.ok ? 'connected' : 'missing'}
                </span>
              </div>
              {apiHealth?.dependencies?.grafana?.url && <div className="muted">{apiHealth.dependencies.grafana.url}</div>}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <Link className="button secondary" href="/observability">
                Observability dashboard
              </Link>
              <Link className="button secondary" href="/observability/stack">
                Grafana stack
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
