'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { Badge, Button, Card } from '@ghostl/ui';
import {
  ChainOverviewSchema,
  ExplorerSummarySchema,
  ObservabilitySummarySchema,
  type ChainOverview,
  type ExplorerSummary,
  type ObservabilitySummary
} from '@ghostl/contract-schemas';
import { apiRequest, type ApiError, formatApiError } from '../../lib/api';
import { DataFetchErrorCard } from '../../components/DataFetchErrorCard';
import { useSession } from '../identity-access/session';
import { normalizeRole, roleOrder } from '../identity-access/access-policy';
import { useNetwork } from '../app-shell/services/NetworkContextService';

type ChainRef = 'l1' | 'l2' | 'l3';

type RpcSnapshot = {
  id: string;
  label: string;
  rpc: string;
  status: 'loading' | 'ok' | 'error';
  error?: ApiError;
  chainId?: number;
  blockNumber?: number;
  gasPriceGwei?: number;
  peers?: number;
};

type ApiHealth = {
  status?: string;
  dependencies?: Record<string, { ok?: boolean; url?: string }>;
};

type ExplorerTx = ExplorerSummary['txs'][number];
type ExplorerBlock = ExplorerSummary['blocks'][number];
type MempoolStatus = ExplorerSummary['mempool'];
type ChainSnapshot = ChainOverview['chains'][number];

type RiskScore = { label: string; score: number; reasons: string[] };

type Explainability = {
  confidence: number;
  reasoning: string;
  evidence: Array<{ kind: string; ref: string; detail: string }>;
  model: { name: string; version: string };
};

type TxIntel = {
  chain: { layer: string; chainId: number; name: string };
  txHash: string;
  classification: string;
  risk: RiskScore;
  anomalySignals: Array<{ name: string; severity: number; detail: string }>;
  summary: {
    from: string;
    to: string | null;
    valueWei: string;
    gasUsed: string | null;
    effectiveGasPriceWei: string | null;
    blockNumber: number | null;
  };
  explainability: Explainability;
};

type WalletIntel = {
  address: string;
  chain: { layer: string; chainId: number; name: string };
  risk: RiskScore;
  profile: {
    activityLevel: string;
    typicalTxValueWeiP50: string;
    typicalTxValueWeiP95: string;
    contractInteractionRate: number;
    uniqueCounterparties: number;
  };
  phishingDrainSignals: Array<{ name: string; severity: number; detail: string }>;
  explainability: Explainability;
};

type NetworkIntel = {
  chain: { layer: string; chainId: number; name: string };
  risk: RiskScore;
  health: {
    headBlock: number;
    avgBlockTimeSec: number;
    txPerBlockAvg: number;
    baseFeeTrend: string;
  };
  anomalies: Array<{ name: string; severity: number; detail: string }>;
  earlyWarnings: Array<{ name: string; severity: number; detail: string }>;
  explainability: Explainability;
};

type BridgeIntel = {
  risk: RiskScore;
  messages: Array<{
    id: string;
    direction: string;
    srcTxHash: string;
    status: string;
    ageBlocks: number;
    detail: string;
  }>;
  explainability: Explainability;
};

type Forecasting = {
  chain: { layer: string; chainId: number; name: string };
  horizonBlocks: number;
  forecasts: { avgGasPriceWei: string; congestion: string; avgTxPerBlock: number };
  explainability: Explainability;
};

type WalletSummary = {
  id: string;
  label: string;
  address: string;
  chainId: string;
  ownerUserId?: string;
  status?: string;
};

type NetworkIntelResponse = { status: NetworkIntel[] };

type AlertSummary = { total: number; active: number };

const apiHealthSchema = z
  .object({
    status: z.string().optional(),
    dependencies: z.record(z.object({ ok: z.boolean().optional(), url: z.string().optional() })).optional()
  })
  .nullable();

const riskScoreSchema = z.object({
  label: z.string(),
  score: z.number(),
  reasons: z.array(z.string())
});

const explainabilitySchema = z.object({
  confidence: z.number(),
  reasoning: z.string(),
  evidence: z.array(z.object({ kind: z.string(), ref: z.string(), detail: z.string() })),
  model: z.object({ name: z.string(), version: z.string() })
});

const txIntelSchema = z.object({
  chain: z.object({ layer: z.string(), chainId: z.number(), name: z.string() }),
  txHash: z.string(),
  classification: z.string(),
  risk: riskScoreSchema,
  anomalySignals: z.array(z.object({ name: z.string(), severity: z.number(), detail: z.string() })),
  summary: z.object({
    from: z.string(),
    to: z.string().nullable(),
    valueWei: z.string(),
    gasUsed: z.string().nullable(),
    effectiveGasPriceWei: z.string().nullable(),
    blockNumber: z.number().nullable()
  }),
  explainability: explainabilitySchema
});

const walletIntelSchema = z.object({
  address: z.string(),
  chain: z.object({ layer: z.string(), chainId: z.number(), name: z.string() }),
  risk: riskScoreSchema,
  profile: z.object({
    activityLevel: z.string(),
    typicalTxValueWeiP50: z.string(),
    typicalTxValueWeiP95: z.string(),
    contractInteractionRate: z.number(),
    uniqueCounterparties: z.number()
  }),
  phishingDrainSignals: z.array(z.object({ name: z.string(), severity: z.number(), detail: z.string() })),
  explainability: explainabilitySchema
});

const networkIntelSchema = z.object({
  status: z.array(
    z.object({
      chain: z.object({ layer: z.string(), chainId: z.number(), name: z.string() }),
      risk: riskScoreSchema,
      health: z.object({
        headBlock: z.number(),
        avgBlockTimeSec: z.number(),
        txPerBlockAvg: z.number(),
        baseFeeTrend: z.string()
      }),
      anomalies: z.array(z.object({ name: z.string(), severity: z.number(), detail: z.string() })),
      earlyWarnings: z.array(z.object({ name: z.string(), severity: z.number(), detail: z.string() })),
      explainability: explainabilitySchema
    })
  )
});

const forecastingSchema = z.object({
  chain: z.object({ layer: z.string(), chainId: z.number(), name: z.string() }),
  horizonBlocks: z.number(),
  forecasts: z.object({ avgGasPriceWei: z.string(), congestion: z.string(), avgTxPerBlock: z.number() }),
  explainability: explainabilitySchema
});

const bridgeIntelSchema = z.object({
  risk: riskScoreSchema,
  messages: z.array(
    z.object({ id: z.string(), direction: z.string(), srcTxHash: z.string(), status: z.string(), ageBlocks: z.number(), detail: z.string() })
  ),
  explainability: explainabilitySchema
});

const walletsSchema = z.array(
  z.object({
    id: z.string(),
    label: z.string(),
    address: z.string(),
    chainId: z.string(),
    ownerUserId: z.string().optional(),
    status: z.string().optional()
  })
);

const formatNumber = (value?: number, digits = 0) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
};

const formatMs = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '--';
  return `${(value / 1000).toFixed(2)}s`;
};

const formatStatus = (value?: string) => (value ? value.toUpperCase() : 'UNKNOWN');

const shortHash = (value?: string, head = 6, tail = 4) => {
  if (!value) return '--';
  if (value.length <= head + tail) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
};

const formatWei = (value?: string) => {
  if (!value) return '--';
  const raw = value.startsWith('0x') ? value : /^\d+$/.test(value) ? `0x${BigInt(value).toString(16)}` : value;
  if (!raw.startsWith('0x')) return value;
  try {
    const wei = BigInt(raw);
    const scaled = Number(wei / 10n ** 14n);
    return `${(scaled / 1e4).toFixed(4)} ETH`;
  } catch {
    return value;
  }
};

const formatGwei = (value?: string) => {
  if (!value) return '--';
  const raw = value.startsWith('0x') ? value : /^\d+$/.test(value) ? `0x${BigInt(value).toString(16)}` : value;
  if (!raw.startsWith('0x')) return value;
  try {
    const wei = BigInt(raw);
    const gwei = Number(wei / 10n ** 9n);
    return `${gwei.toFixed(2)} gwei`;
  } catch {
    return value;
  }
};

const riskTone = (label?: string) => {
  if (!label) return 'default' as const;
  if (label === 'SAFE' || label === 'LOW') return 'success' as const;
  if (label === 'MEDIUM') return 'warning' as const;
  return 'critical' as const;
};

const sparklinePath = (points: number[], width: number, height: number) => {
  if (points.length === 0) return '';
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1 || 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

function Sparkline({ points, stroke }: { points: number[]; stroke: string }) {
  const width = 120;
  const height = 42;
  if (!points.length) {
    return <div className="muted">No signal</div>;
  }
  const path = sparklinePath(points, width, height);
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} stroke={stroke} strokeWidth={2} fill="none" />
    </svg>
  );
}

function BarSparkline({ points, color }: { points: number[]; color: string }) {
  const width = 120;
  const height = 42;
  if (!points.length) {
    return <div className="muted">No data</div>;
  }
  const max = Math.max(...points) || 1;
  const barWidth = width / points.length;
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {points.map((point, index) => {
        const h = (point / max) * height;
        return (
          <rect
            key={`${point}-${index}`}
            x={index * barWidth + 1}
            y={height - h}
            width={Math.max(2, barWidth - 2)}
            height={h}
            fill={color}
            opacity={0.7}
          />
        );
      })}
    </svg>
  );
}

export function OperatorOverview() {
  const { user } = useSession();
  const userRole = normalizeRole(user?.role);
  const canReadOps = roleOrder[userRole] >= roleOrder.OPERATOR;
  const canReadWallets = roleOrder[userRole] >= roleOrder.OPERATOR;
  const { networks, current } = useNetwork();
  const activeChain = ((current?.id || 'l2') as ChainRef) || 'l2';

  const [rpcSnapshots, setRpcSnapshots] = useState<Record<string, RpcSnapshot>>({});
  const [blockHistory, setBlockHistory] = useState<Record<string, number[]>>({});
  const [mempool, setMempool] = useState<MempoolStatus | null>(null);
  const [txs, setTxs] = useState<ExplorerTx[]>([]);
  const [txIntelDetail, setTxIntelDetail] = useState<TxIntel | null>(null);
  const [txRiskMap, setTxRiskMap] = useState<Record<string, RiskScore>>({});
  const [blocks, setBlocks] = useState<ExplorerBlock[]>([]);
  const [forecasting, setForecasting] = useState<Forecasting | null>(null);
  const [networkIntel, setNetworkIntel] = useState<NetworkIntel[]>([]);
  const [bridgeIntel, setBridgeIntel] = useState<BridgeIntel | null>(null);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [walletAddress, setWalletAddress] = useState('');
  const [walletIntel, setWalletIntel] = useState<WalletIntel | null>(null);
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null);
  const [chainOverview, setChainOverview] = useState<ChainOverview | null>(null);
  const [alertSummary, setAlertSummary] = useState<AlertSummary>({ total: 0, active: 0 });
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState<Record<string, { title: string; error: ApiError }>>({});
  const intelInFlight = useRef(new Set<string>());
  const formatStatus = (error: ApiError) => {
    const info = formatApiError(error);
    return `${info.method} ${info.endpoint} | ${info.status} | ${info.hint}`;
  };
  const updateErrors = (updates: Record<string, { title: string; error?: ApiError | null }>) => {
    setErrors((prev) => {
      const next = { ...prev };
      Object.entries(updates).forEach(([key, value]) => {
        if (value.error) {
          next[key] = { title: value.title, error: value.error };
        } else {
          delete next[key];
        }
      });
      return next;
    });
  };

  const activeSnapshot = useMemo(
    () => chainOverview?.chains.find((chain) => chain.id === activeChain),
    [chainOverview, activeChain]
  );
  const rollupOverview = useMemo(() => {
    const mapTelemetry = (snapshot?: ChainSnapshot | null) => {
      const health = snapshot?.telemetry?.health;
      if (!health) return null;
      const lag = snapshot?.finalityLag ?? health.chain.head - health.chain.finalized;
      return {
        head: health.chain.head,
        finalized: health.chain.finalized,
        lag: Number.isFinite(lag) ? lag : undefined,
        relayer: { errors: health.relayer.errors, finalized: health.relayer.finalized },
        guard: { alerts: health.guard.alerts, deposits: health.guard.deposits }
      };
    };
    return {
      l2: mapTelemetry(chainOverview?.chains.find((chain) => chain.id === 'l2')),
      l3: mapTelemetry(chainOverview?.chains.find((chain) => chain.id === 'l3'))
    };
  }, [chainOverview]);

  useEffect(() => {
    if (!networks.length) return;
    const initial: Record<string, RpcSnapshot> = {};
    networks.forEach((network) => {
      initial[network.id] = {
        id: network.id,
        label: network.label,
        rpc: network.rpc || '',
        status: network.rpc ? 'loading' : 'error'
      };
    });
    setRpcSnapshots(initial);
  }, [networks]);

  useEffect(() => {
    if (!networks.length) return;
    let active = true;

    const loadChainOverview = async () => {
      const result = await apiRequest<ChainOverview>('/chain', { schema: ChainOverviewSchema });
      if (!active) return;

      if (!result.ok) {
        setChainOverview(null);
        const fallback: Record<string, RpcSnapshot> = {};
        networks.forEach((network) => {
          fallback[network.id] = {
            id: network.id,
            label: network.label,
            rpc: network.rpc || '',
            status: 'error',
            error: result.error
          };
        });
        setRpcSnapshots(fallback);
        updateErrors({
          chainOverview: { title: 'Chain overview', error: result.error }
        });
        return;
      }

      setChainOverview(result.data);

      const nextSnapshots: Record<string, RpcSnapshot> = {};
      result.data.chains.forEach((chain) => {
        const rpcError =
          chain.rpc.status === 'error'
            ? {
                message: chain.rpc.error || 'rpc_probe_failed',
                endpoint: chain.rpc.url || 'rpc://unassigned',
                method: 'POST',
                hint: chain.errors?.join(', ') || 'Check ghost-registry and RPC health.'
              }
            : undefined;
        nextSnapshots[chain.id] = {
          id: chain.id,
          label: chain.label,
          rpc: chain.rpc.url || '',
          status: chain.rpc.status,
          chainId: chain.rpc.chainId,
          blockNumber: chain.rpc.blockNumber,
          gasPriceGwei: chain.rpc.gasPriceGwei,
          peers: chain.rpc.peers,
          error: rpcError
        };
      });

      networks.forEach((network) => {
        if (!nextSnapshots[network.id]) {
          nextSnapshots[network.id] = {
            id: network.id,
            label: network.label,
            rpc: network.rpc || '',
            status: 'error',
            error: {
              message: 'chain_missing',
              endpoint: '/chain',
              method: 'GET',
              hint: 'Ghost-api /chain did not return this chain.'
            }
          };
        }
      });

      setRpcSnapshots(nextSnapshots);
      setBlockHistory((prev) => {
        const next = { ...prev };
        Object.values(nextSnapshots).forEach((snapshot) => {
          if (snapshot.blockNumber === undefined) return;
          const list = [...(next[snapshot.id] || []), snapshot.blockNumber].slice(-24);
          next[snapshot.id] = list;
        });
        return next;
      });
      updateErrors({
        chainOverview: { title: 'Chain overview', error: null }
      });
    };

    loadChainOverview();
    const interval = setInterval(loadChainOverview, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [networks]);

  useEffect(() => {
    let active = true;

    const loadApi = async () => {
      const [health, explorer, observability] = await Promise.all([
        apiRequest<ApiHealth | null>('/health', { schema: apiHealthSchema }),
        apiRequest<ExplorerSummary>(
          `/explorer?chain=${activeChain}&blockLimit=12&txLimit=8`,
          { schema: ExplorerSummarySchema }
        ),
        canReadOps
          ? apiRequest<ObservabilitySummary>('/observability', { schema: ObservabilitySummarySchema })
          : Promise.resolve({ ok: true as const, data: { alerts: [], dashboards: [], logs: [] } as ObservabilitySummary })
      ]);

      if (!active) return;

      setApiHealth(health.ok ? health.data : null);
      setMempool(explorer.ok ? explorer.data.mempool : null);
      setTxs(explorer.ok ? explorer.data.txs || [] : []);
      setBlocks(explorer.ok ? explorer.data.blocks || [] : []);
      const alertsData = observability.ok ? observability.data.alerts : [];
      const total = Array.isArray(alertsData) ? alertsData.length : 0;
      const activeAlerts = Array.isArray(alertsData) ? alertsData.filter((alert) => alert.state !== 'resolved').length : 0;
      setAlertSummary({ total, active: activeAlerts });

      updateErrors({
        apiHealth: { title: 'API health', error: health.ok ? null : health.error },
        explorer: { title: `Explorer ${activeChain.toUpperCase()}`, error: explorer.ok ? null : explorer.error },
        observability: { title: 'Observability', error: canReadOps && !observability.ok ? observability.error : null }
      });
    };

    loadApi();
    const interval = setInterval(loadApi, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeChain, canReadOps]);

  useEffect(() => {
    let active = true;

    const loadAi = async () => {
      const [forecast, network, bridge] = await Promise.all([
        apiRequest<Forecasting | null>(`/ai/forecasting?chain=${activeChain}`, { schema: forecastingSchema }),
        apiRequest<NetworkIntelResponse>(`/ai/network-intel?chain=${activeChain}`, { schema: networkIntelSchema }),
        apiRequest<BridgeIntel | null>(`/ai/bridge-intel?chain=${activeChain}`, { schema: bridgeIntelSchema })
      ]);

      if (!active) return;
      setForecasting(forecast.ok ? forecast.data : null);
      setNetworkIntel(network.ok ? network.data.status || [] : []);
      setBridgeIntel(bridge.ok ? bridge.data : null);
      updateErrors({
        aiForecasting: { title: `AI forecasting ${activeChain.toUpperCase()}`, error: forecast.ok ? null : forecast.error },
        aiNetwork: { title: `AI network intel ${activeChain.toUpperCase()}`, error: network.ok ? null : network.error },
        aiBridge: { title: `AI bridge intel ${activeChain.toUpperCase()}`, error: bridge.ok ? null : bridge.error }
      });
    };

    loadAi();
    const interval = setInterval(loadAi, 30000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeChain]);

  useEffect(() => {
    if (!canReadWallets) return;
    let active = true;

    const loadWallets = async () => {
      const result = await apiRequest<WalletSummary[]>('/wallets', { schema: walletsSchema });
      if (!active) return;
      setWallets(result.ok ? result.data || [] : []);
      updateErrors({
        wallets: { title: 'Wallet inventory', error: result.ok ? null : result.error }
      });
    };

    loadWallets();

    return () => {
      active = false;
    };
  }, [canReadWallets]);

  useEffect(() => {
    if (!walletAddress && wallets.length) {
      setWalletAddress(wallets[0].address);
    }
  }, [walletAddress, wallets]);

  useEffect(() => {
    const candidate = txs[0];
    if (!candidate) return;
    if (txRiskMap[candidate.hash]) return;
    if (intelInFlight.current.has(candidate.hash)) return;
    runTxIntel(candidate.hash, true).catch(() => undefined);
  }, [txs, txRiskMap]);

  const runTxIntel = async (hash: string, silent = false) => {
    if (!hash) return;
    if (intelInFlight.current.has(hash)) return;
    intelInFlight.current.add(hash);
    if (!silent) setStatus('Running fraud detection...');
    let clearStatus = true;
    try {
      const intelResult = await apiRequest<TxIntel>(`/ai/tx-intel?chain=${activeChain}&txHash=${hash}`, {
        schema: txIntelSchema
      });
      if (!intelResult.ok) {
        if (!silent) setStatus(formatStatus(intelResult.error));
        clearStatus = false;
        return;
      }
      const intel = intelResult.data;
      setTxRiskMap((prev) => ({ ...prev, [hash]: intel.risk }));
      if (!silent) setTxIntelDetail(intel);
    } catch (err) {
      if (!silent) {
        const message = err instanceof Error ? err.message : 'AI scan failed';
        setStatus(message);
        clearStatus = false;
      }
    } finally {
      if (!silent && clearStatus) setStatus('');
      intelInFlight.current.delete(hash);
    }
  };

  const runWalletIntel = async () => {
    if (!walletAddress) return;
    setStatus('Profiling wallet...');
    let clearStatus = true;
    try {
      const intelResult = await apiRequest<WalletIntel>(
        `/ai/wallet-intel?chain=${activeChain}&address=${encodeURIComponent(walletAddress)}`,
        { schema: walletIntelSchema }
      );
      if (!intelResult.ok) {
        setStatus(formatStatus(intelResult.error));
        clearStatus = false;
        return;
      }
      setWalletIntel(intelResult.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI profile failed';
      setStatus(message);
      clearStatus = false;
    } finally {
      if (clearStatus) setStatus('');
    }
  };

  const kpis = useMemo(() => {
    const l1 = rpcSnapshots.l1;
    const l2 = rpcSnapshots.l2;
    const l3 = rpcSnapshots.l3;
    const aiRisk = networkIntel.find((entry) => entry.chain.layer.toLowerCase() === activeChain)?.risk;
    return [
      { label: 'L1 Head', value: formatNumber(l1?.blockNumber), detail: 'Settlement' },
      { label: 'L2 Head', value: formatNumber(l2?.blockNumber), detail: 'Execution' },
      { label: 'L3 Head', value: formatNumber(l3?.blockNumber), detail: 'App layer' },
      { label: 'Mempool', value: formatNumber(mempool?.pending), detail: 'Pending txs' },
      { label: 'AI Risk', value: aiRisk ? `${aiRisk.label} ${Math.round(aiRisk.score)}%` : '--', detail: 'Threat score' },
      { label: 'Alerts', value: formatNumber(alertSummary.active), detail: 'Active incidents' }
    ];
  }, [rpcSnapshots, mempool?.pending, networkIntel, activeChain, alertSummary.active]);

  const toolGroups = useMemo(
    () => [
      {
        title: 'Core Operations',
        description: 'Chain status, node health, validators, and incident response.',
        actions: [
          { href: '/console/chains-nodes', label: 'Chains & Nodes' },
          { href: '/console/validators', label: 'Validators' },
          { href: '/console/bridge', label: 'Bridge' }
        ]
      },
      {
        title: 'Protocol + Treasury',
        description: 'Contracts, token registry, treasury flow, and governance operations.',
        actions: [
          { href: '/console/contracts', label: 'Contracts' },
          { href: '/console/tokens', label: 'Tokens' },
          { href: '/console/treasury', label: 'Treasury' },
          { href: '/console/governance', label: 'Governance' }
        ]
      },
      {
        title: 'Risk + Compliance',
        description: 'Compliance, KYC, and integrations for regulated operations.',
        actions: [
          { href: '/console/compliance', label: 'Compliance & KYC' },
          { href: '/console/integrations', label: 'Integrations' },
          { href: '/console/devops', label: 'DevOps' }
        ]
      },
      {
        title: 'Identity + Wallets',
        description: 'User access, wallet security, and GhostWallet controls.',
        actions: [
          { href: '/console/users-wallets', label: 'Users & Wallets' },
          { href: '/console/ai', label: 'AI Command Center' }
        ]
      }
    ],
    []
  );

  const dependencies = useMemo(() => {
    if (!apiHealth?.dependencies) return [];
    return Object.entries(apiHealth.dependencies);
  }, [apiHealth?.dependencies]);

  const txVolumes = useMemo(() => blocks.map((block) => block.txCount), [blocks]);
  const avgTx = txVolumes.length ? txVolumes.reduce((sum, value) => sum + value, 0) / txVolumes.length : 0;

  const highRiskTxs = useMemo(() => {
    return txs.filter((tx) => {
      const risk = txRiskMap[tx.hash];
      return risk && (risk.label === 'HIGH' || risk.label === 'CRITICAL');
    }).length;
  }, [txs, txRiskMap]);

  return (
    <div className="content">
      <section className="card hero reveal">
        <div className="hero-main">
          <div className="hero-badge">GhostChain L1 / GhostL2 / GhostL3</div>
          <h1 style={{ margin: '12px 0 4px' }}>GhostL Operator Console</h1>
          <p className="muted">
            AI-driven command surface for GhostChain settlement, GhostL2 execution, and GhostL3 app rollups. Monitor fraud,
            predict congestion, and coordinate ops across every layer.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/console/ai">
              Open AI command center
            </Link>
            <Link className="button secondary" href="/console/chains-nodes">
              Inspect chains
            </Link>
            <Link className="button secondary" href="/console/contracts">
              Manage contracts
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
      {Object.keys(errors).length > 0 && (
        <section className="card-grid">
          {Object.values(errors).map(({ title, error }) => (
            <DataFetchErrorCard key={`${title}-${error.endpoint || 'unknown'}`} title={title} error={error} />
          ))}
        </section>
      )}

      <section className="card reveal">
        <div className="spread">
          <h3>Layer pulse</h3>
          <Badge tone="success">Live RPC</Badge>
        </div>
        <div className="card-grid" style={{ marginTop: 16 }}>
          {networks.map((network) => {
            const snapshot = rpcSnapshots[network.id];
            const statusTone = snapshot?.status === 'ok' ? 'success' : snapshot?.status === 'error' ? 'critical' : 'warning';
            return (
              <div key={network.id} className="card">
                <div className="spread">
                  <strong>{network.label}</strong>
                  <Badge tone={statusTone}>{snapshot?.status || 'loading'}</Badge>
                </div>
                <div className="metric">
                  <div className="metric-label">Head block</div>
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
                <Sparkline points={blockHistory[network.id] || []} stroke="var(--accent)" />
                <div className="muted">{network.rpc || 'RPC unassigned'}</div>
                {snapshot?.error && <div className="muted">RPC error: {formatStatus(snapshot.error)}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid-3">
        <Card title="AI fraud radar" subtitle="Realtime anomaly detection">
          <div className="stack">
            <div className="spread">
              <span className="muted">Scanned txs</span>
              <strong>{Object.keys(txRiskMap).length}</strong>
            </div>
            <div className="spread">
              <span className="muted">High risk</span>
              <strong>{highRiskTxs}</strong>
            </div>
            <div className="muted">Latest intel: {txIntelDetail?.classification || 'waiting for scan'}</div>
            {txIntelDetail && (
              <div className="stack">
                <Badge tone={riskTone(txIntelDetail.risk.label)}>
                  {txIntelDetail.risk.label} {Math.round(txIntelDetail.risk.score)}%
                </Badge>
                <div className="muted">{txIntelDetail.explainability.reasoning}</div>
              </div>
            )}
          </div>
        </Card>
        <Card title="Predictive analytics" subtitle="Forecast congestion and pricing">
          <div className="stack">
            <div className="spread">
              <span className="muted">Avg gas price</span>
              <strong>{formatGwei(forecasting?.forecasts.avgGasPriceWei)}</strong>
            </div>
            <div className="spread">
              <span className="muted">Congestion</span>
              <strong>{forecasting?.forecasts.congestion || '--'}</strong>
            </div>
            <div className="spread">
              <span className="muted">Avg tx/block</span>
              <strong>{forecasting?.forecasts.avgTxPerBlock?.toFixed(2) || '--'}</strong>
            </div>
            <div className="muted">
              Confidence: {forecasting ? `${(forecasting.explainability.confidence * 100).toFixed(0)}%` : '--'}
            </div>
          </div>
        </Card>
        <Card title="Network intelligence" subtitle="Layer-by-layer AI risk">
          <div className="stack">
            {networkIntel.map((entry) => (
              <div key={`${entry.chain.layer}-${entry.chain.chainId}`} className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div>{entry.chain.name}</div>
                  <div className="muted">
                    avg {entry.health.avgBlockTimeSec.toFixed(1)}s · tx/block {entry.health.txPerBlockAvg.toFixed(1)}
                  </div>
                </div>
                <Badge tone={riskTone(entry.risk.label)}>{entry.risk.label}</Badge>
              </div>
            ))}
            {!networkIntel.length && <div className="muted">No network intel.</div>}
          </div>
        </Card>
      </section>

      <section className="grid-2">
        <Card title="Realtime transaction monitoring" subtitle="GhostChain / GhostL2 / GhostL3">
          {status && <div className="muted">{status}</div>}
          <table className="table">
            <thead>
              <tr>
                <th>Hash</th>
                <th>From</th>
                <th>To</th>
                <th>Value</th>
                <th>Risk</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => {
                const risk = txRiskMap[tx.hash];
                return (
                  <tr key={tx.hash}>
                    <td className="mono">{shortHash(tx.hash)}</td>
                    <td className="mono">{shortHash(tx.from)}</td>
                    <td className="mono">{tx.to ? shortHash(tx.to) : 'contract'}</td>
                    <td>{formatWei(tx.value)}</td>
                    <td>
                      {risk ? (
                        <Badge tone={riskTone(risk.label)}>
                          {risk.label} {Math.round(risk.score)}%
                        </Badge>
                      ) : (
                        <span className="muted">--</span>
                      )}
                    </td>
                    <td>
                      <Button variant="secondary" onClick={() => runTxIntel(tx.hash)}>
                        Analyze
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!txs.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    No recent transactions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {txIntelDetail && (
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="spread">
                <strong>AI explainability</strong>
                <Badge tone={riskTone(txIntelDetail.risk.label)}>{txIntelDetail.risk.label}</Badge>
              </div>
              <div className="muted">{txIntelDetail.explainability.reasoning}</div>
              <div className="muted">Evidence: {txIntelDetail.explainability.evidence.map((item) => item.kind).join(', ')}</div>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title="Mempool pressure" subtitle="Real-time transaction backlog">
            <div className="grid-3">
              <div className="metric">
                <div className="metric-label">Pending</div>
                <div className="metric-value">{formatNumber(mempool?.pending)}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Queued</div>
                <div className="metric-value">{formatNumber(mempool?.queued)}</div>
              </div>
              <div className="metric">
                <div className="metric-label">MEV risk</div>
                <div className="metric-value">{mempool?.mevRisk || '--'}</div>
              </div>
            </div>
            <div className="muted">Fairness score: {mempool?.fairnessScore?.toFixed(2) || '--'}</div>
          </Card>
          <Card title="Throughput" subtitle="Recent blocks (tx count)">
            <div className="spread">
              <span className="muted">Avg tx/block</span>
              <strong>{avgTx ? avgTx.toFixed(1) : '--'}</strong>
            </div>
            <BarSparkline points={txVolumes} color="var(--accent-3)" />
            <div className="muted">Latest block: {blocks[0]?.number ?? '--'}</div>
          </Card>
          <Card title="Bridge intelligence" subtitle="Cross-layer risk">
            <div className="stack">
              <div className="spread">
                <span className="muted">Risk</span>
                <Badge tone={riskTone(bridgeIntel?.risk.label)}>{bridgeIntel?.risk.label || 'UNKNOWN'}</Badge>
              </div>
              <div className="muted">Messages tracked: {bridgeIntel?.messages.length ?? 0}</div>
              <div className="muted">{bridgeIntel?.explainability.reasoning || 'No bridge explainability yet.'}</div>
            </div>
          </Card>
        </div>
      </section>

      <section className="grid-3">
        <Card title="Personalized user insights" subtitle="GhostWallet intelligence">
          <div className="stack">
            {wallets.length ? (
              <select className="select" value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)}>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.address}>
                    {wallet.label} · {wallet.chainId}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                placeholder="0x wallet address"
                value={walletAddress}
                onChange={(event) => setWalletAddress(event.target.value)}
              />
            )}
            <Button onClick={runWalletIntel}>Profile wallet</Button>
            {walletIntel && (
              <div className="stack">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <Badge tone={riskTone(walletIntel.risk.label)}>
                    {walletIntel.risk.label} {Math.round(walletIntel.risk.score)}%
                  </Badge>
                  <span className="muted">{walletIntel.profile.activityLevel} activity</span>
                </div>
                <div className="muted">P50 value: {walletIntel.profile.typicalTxValueWeiP50}</div>
                <div className="muted">Counterparties: {walletIntel.profile.uniqueCounterparties}</div>
                <div className="muted">{walletIntel.explainability.reasoning}</div>
              </div>
            )}
          </div>
        </Card>

        <Card title="Rollup settlement" subtitle="L2/L3 derivation flow">
          <div className="data-grid">
            {[
              { label: 'GhostL2', data: rollupOverview.l2 },
              { label: 'GhostL3', data: rollupOverview.l3 }
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
        </Card>

        <Card title="Service mesh" subtitle="Docker-backed services">
          <div className="stack">
            <div className="spread">
              <span className="muted">API health</span>
              <Badge tone={apiHealth?.status === 'ok' ? 'success' : 'warning'}>{formatStatus(apiHealth?.status)}</Badge>
            </div>
            <div className="grid-3">
              {dependencies.map(([name, dep]) => (
                <div key={name} className="data-card">
                  <div className="spread">
                    <span className="muted">{name}</span>
                    <span className={`pill ${dep.ok ? 'ok' : 'bad'}`}>{dep.ok ? 'up' : 'down'}</span>
                  </div>
                  <div className="muted">{dep.url || 'unconfigured'}</div>
                </div>
              ))}
              {!dependencies.length && <div className="muted">No service dependencies reported.</div>}
            </div>
            <div className="muted">
              Environment: {activeSnapshot?.info?.env || 'local'} · Consensus: {activeSnapshot?.info?.consensus || '--'}
            </div>
            <div className="muted">
              Block time: {formatMs(activeSnapshot?.blockTimeMs)} · Finality lag: {formatMs(activeSnapshot?.finalityLag)}
            </div>
          </div>
        </Card>
      </section>

      <section className="card reveal">
        <div className="spread">
          <h3>Management tools</h3>
          <Badge tone="warning">Full suite</Badge>
        </div>
        <div className="tool-grid">
          {toolGroups.map((tool) => (
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
    </div>
  );
}
