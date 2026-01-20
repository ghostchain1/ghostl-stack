import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import express, { type RequestHandler } from 'express';
import session from 'express-session';
import cors from 'cors';
import nodemailer from 'nodemailer';
import type {} from './types/session';
import WebSocket from 'ws';
import { Interface, JsonRpcProvider, Wallet } from 'ethers';
import type { Transfer } from '@ghostl/types/bridge';
import { buildAppShellRouter } from './modules/app-shell/router';
import { buildIdentityAccessRouter } from './modules/identity-access/router';
import { buildChainRouter } from './modules/chain/router';
import { buildNodeRouter } from './modules/nodes/router';
import { buildObservabilityRouter } from './modules/observability/router';
import { CriticalLogStore } from './modules/observability/critical-log-store';
import { LogIntelService } from './modules/observability/log-intel';
import { createStubServices } from './stubs';
import { PrometheusClient } from './clients/prometheus';
import { GrafanaClient } from './clients/grafana';
import { RelayerClient } from './clients/relayer';
import { createLiveServices } from './services/live';
import { createPersistentIdentityServices } from './services/auth-store';
import { LokiClient } from './clients/loki';
import { GuardClient } from './clients/guard';
import { AlertmanagerClient } from './clients/alertmanager';
import type { AlertmanagerAlert } from './clients/alertmanager';
import { buildStackRouter } from './modules/stack/router';
import { buildWalletRouter } from './modules/wallet/router';
import { env } from './config/env';
import { requirePermission } from './lib/rbac';
import type { NotificationChannel } from './modules/observability/services';
import { buildDevopsRouter } from './modules/devops/router';
import { buildWalletAdminRouter } from './modules/wallet-admin/router';
import { createWalletService } from './services/wallet-store';
import { createGhostWalletService } from './services/ghostwallet';
import { createTokenService } from './services/token-store';
import { buildTokenRouter } from './modules/token/router';
import { buildGhostchainRouter } from './modules/ghostchain/router';
import { buildKycRouter } from './modules/kyc/router';
import { createKycService } from './services/kyc-store';
import { createIntegrationsStore } from './services/integrations-store';
import { buildAiRouter } from './modules/ai/router';
import { ghostWalletRpcManager } from './services/rpc-manager';
import { createSessionStore } from './services/session-store';
import { emitEvent, getEvents, getWebhookDeliveries, getWebhookSummary } from './lib/events';
import { createContractJob, readContractJob, readContractJobLog } from './lib/contract-jobs';
import { listContracts as listRegisteredContracts, registerContracts } from './lib/contract-registry-store';
import './types/express';
// Load environment variables from local env file when running locally (cwd may be repo root or apps/api)
loadEnv({ path: path.join(process.cwd(), '.env.local') });
type HexString = string;
type RpcError = { message?: string };
type RpcResponse<T> = { result?: T; error?: RpcError };
type RpcTx = { hash: string; from?: string; to?: string; value?: string; gas?: string; nonce?: string };
type RpcBlock = {
  number: string;
  hash?: string;
  miner?: string;
  transactions: (RpcTx | string)[];
  size?: string;
  timestamp: string;
};
type ExplorerTx = {
  hash: string;
  from?: string;
  to?: string;
  value?: string;
  gas?: string;
  status: string;
  nonce?: string;
  blockNumber: string;
  time: string;
};
type TreasuryProposal = {
  id: string;
  action: string;
  payload?: Record<string, unknown>;
  approvals: string[];
  status: 'pending' | 'ready';
  createdAt: string;
  updatedAt: string;
};
type ContractState = {
  address: string;
  paused: boolean;
  reason?: string;
  updatedAt: string;
};
type UpgradePlan = {
  id: string;
  name: string;
  steps: {
    id: string;
    name: string;
    status: 'pending' | 'in_progress' | 'done';
    notes?: string;
    action?: { type: string; payload?: Record<string, unknown> };
  }[];
  createdAt: string;
  updatedAt: string;
  rollbackOf?: string;
  lastDryRunAt?: string;
  approvals: { userId: string; at: string }[];
};
type ComplianceReport = { id: string; period: string; status: string; generatedAt: string };
type ComplianceFinding = { id: string; area: string; severity: 'low' | 'medium' | 'high'; detail: string };
type ComplianceDetail = ComplianceReport & { controls: string[]; findings: ComplianceFinding[]; exportedAt?: string };
type BridgeNetwork = { id?: string; pause?: string; pending?: string; liquidity?: string; fees?: string };
type BridgeSignature = { transferId?: string; signatures?: string[]; required?: number };
type BridgeIncident = { message?: string; severity?: string; createdAt?: string; time?: string; source?: string };

const parseCorsAllowlist = () => {
  const raw = process.env.CORS_ALLOW_ORIGINS || '';
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
};

const resolveRepoRoot = () => {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'contracts'))) return cwd;
  const parent = path.resolve(cwd, '..');
  if (fs.existsSync(path.join(parent, 'contracts'))) return parent;
  return cwd;
};

const repoRoot = resolveRepoRoot();
const contractsRoot = path.join(repoRoot, 'contracts');
const contractsDeploymentsDir = path.join(contractsRoot, 'deployments');
const contractsReportsDir = path.join(contractsRoot, 'reports');
const contractsDocsDir = path.join(repoRoot, 'docs', 'contracts');

const isLocalOrigin = (origin: string) => {
  try {
    const { hostname } = new URL(origin);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname);
  } catch {
    return false;
  }
};

const corsAllowlist = parseCorsAllowlist();
const isOriginAllowed = (origin?: string) => {
  if (!origin) return true;
  if (corsAllowlist.size) return corsAllowlist.has(origin);
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
};

const app = express();
const sessionStore = createSessionStore();

app.set('trust proxy', 1);
app.use(
  '/',
  cors({
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: true
  }) as RequestHandler
);
app.use(express.json());
app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: env.SESSION_TTL_MS || 30 * 60 * 1000
    }
  }) as unknown as RequestHandler
);

const isStateChanging = (method: string) => !['GET', 'HEAD', 'OPTIONS'].includes(method);
const sameOrigin = (req: express.Request) => {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin || typeof origin !== 'string') return false;
  try {
    const originUrl = new URL(origin);
    const host = req.headers.host || '';
    return originUrl.host === host;
  } catch {
    return false;
  }
};

const parseEmailList = (value?: string | null) =>
  (value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  next();
};

const requireAdmin: RequestHandler = (req, res, next) => {
  const roles = (req.session?.roles || []).map((role) => String(role).toLowerCase());
  if (roles.includes('admin') || roles.includes('owner')) {
    next();
    return;
  }
  res.status(403).json({ error: 'forbidden' });
};

const hasContractsToken = (req: express.Request) => {
  const token = process.env.CONTRACTS_REGISTRY_TOKEN;
  if (!token) return process.env.NODE_ENV !== 'production';
  const header = req.header('x-contracts-token');
  return Boolean(header && header === token);
};

app.use((req, res, next) => {
  if (!isStateChanging(req.method)) return next();
  if (!req.session?.userId) return next();
  const csrfHeader = req.header('x-csrf-token');
  const sessionToken = req.session.csrfToken as string | undefined;
  if (csrfHeader && sessionToken && csrfHeader === sessionToken) {
    return next();
  }
  if (sameOrigin(req)) return next();
  res.status(403).json({ error: 'csrf_failed' });
});

app.use((req, res, next) => {
  const correlationId = req.header('x-request-id') || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('x-request-id', correlationId);
  const start = Date.now();
  res.on('finish', () => {
    const entry = {
      ts: new Date().toISOString(),
      level: 'info',
      correlationId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start
    };
    console.log(JSON.stringify(entry));
  });
  next();
});

app.use((req, res, next) => {
  if (req.session && req.session.expiresAt && req.session.expiresAt < Date.now()) {
    req.session.destroy(() => undefined);
    res.status(401).json({ error: 'session_expired' });
    return;
  }
  if (req.session) {
    req.session.lastSeenAt = Date.now();
    req.session.expiresAt = Date.now() + 30 * 60 * 1000;
  }
  next();
});

const services = createStubServices();
const prometheusUrl = env.PROMETHEUS_URL;
const grafanaUrl = env.GRAFANA_URL;
const relayerUrl = env.RELAYER_URL;
const guardUrl = env.GUARD_URL;
const lokiUrl = env.LOKI_URL || 'http://localhost:3100';
const alertmanagerUrl = env.ALERTMANAGER_URL || 'http://localhost:9093';
const prometheus = new PrometheusClient(prometheusUrl);
const grafana = new GrafanaClient(grafanaUrl, env.GRAFANA_API_KEY);
const relayer = new RelayerClient(relayerUrl);
const loki = lokiUrl ? new LokiClient(lokiUrl) : undefined;
const guard = guardUrl ? new GuardClient(guardUrl, env.GUARD_ADMIN_TOKEN) : undefined;
const alertmanager = alertmanagerUrl ? new AlertmanagerClient(alertmanagerUrl) : undefined;
const criticalLogStore = new CriticalLogStore(
  env.OBSERVABILITY_CRITICAL_LOG_PATH || './data/critical-logs.jsonl',
  env.OBSERVABILITY_CRITICAL_LOG_SECRET
);
const liveServices = createLiveServices({ prometheus, grafana, relayer, loki, guard, alertmanager });
const identityServicesPromise = createPersistentIdentityServices();
const walletServicePromise = createWalletService();
const ghostWalletServicePromise = walletServicePromise.then((wallets) => createGhostWalletService(wallets));
const tokenServicePromise = createTokenService();
const kycServicePromise = createKycService();
const integrationsStorePromise = createIntegrationsStore();
let auditLogService: { append: (entry: { actorId: string; action: string; resource: string; meta?: Record<string, unknown> }) => Promise<unknown> } | undefined;

const proxyJson = async <T>(url: string, fallback?: T): Promise<T> => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
};

type RpcRegistryEntry = {
  id?: string;
  url?: string;
  rpc?: string;
  http?: string;
  type?: string;
  protocol?: 'http' | 'ws';
  auth?: 'none' | 'apiKey' | 'bearer' | 'basic';
  region?: string;
  status?: string;
  priority?: number;
  features?: Record<string, boolean>;
  health?: { status?: string; latencyMs?: number; lastChecked?: string };
  chainId?: number | string;
  chain_id?: number | string;
  chain?: {
    id?: number | string;
    chainId?: number | string;
    name?: string;
    chainKey?: string;
    layer?: string;
    chainType?: string;
    network?: string;
    parentChainId?: number | string;
  };
  name?: string;
  lastCheckedAt?: string;
  checkedAt?: string;
};

type RpcRegistryChain = {
  chainId: number;
  chainKey?: string;
  chainName?: string;
  name?: string;
  layer?: string;
  chainType?: string;
  network?: string;
  rollup?: { parentChainId?: number };
  endpoints?: RpcRegistryEntry[];
  rpc?: { http?: string[]; ws?: string[] };
};

type RpcRegistryResponse = {
  registry?: { name?: string; version?: string; generatedAt?: string };
  chains?: RpcRegistryChain[];
};

type RpcCache = { expiresAt: number; endpoints: unknown[] };
let rpcEndpointCache: RpcCache | null = null;

const withTimeout = async <T>(promise: Promise<T>, ms: number) => {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const rpcProbe = async <T>(url: string, method: string, params: unknown[] = []) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!res.ok) throw new Error(`rpc_${method}_failed`);
  const body = (await res.json()) as RpcResponse<T>;
  if (body.error) throw new Error(body.error.message || 'rpc_error');
  return body.result as T;
};

const probeHttpEndpoint = async (endpoint: { id: string; url: string; chainId?: string }) => {
  const started = Date.now();
  try {
    const rawChainId = await withTimeout(rpcProbe<string>(endpoint.url, 'eth_chainId'), 1500);
    const chainId = rawChainId?.startsWith('0x') ? String(parseInt(rawChainId, 16)) : rawChainId;
    const syncing = await withTimeout(rpcProbe<boolean | { startingBlock?: string }>(endpoint.url, 'eth_syncing'), 1500)
      .then((result) => result !== false)
      .catch(() => undefined);
    const peerCountHex = await withTimeout(rpcProbe<string>(endpoint.url, 'net_peerCount'), 1500).catch(() => undefined);
    const clientVersion = await withTimeout(rpcProbe<string>(endpoint.url, 'web3_clientVersion'), 1500).catch(() => undefined);
    const latencyMs = Date.now() - started;
    const status = syncing ? 'degraded' : latencyMs > 1200 ? 'degraded' : 'healthy';
    const peerCount = peerCountHex ? parseInt(peerCountHex, 16) : undefined;
    return {
      ...endpoint,
      status,
      latencyMs,
      peerCount,
      syncing,
      clientVersion,
      chainId: endpoint.chainId || (chainId ? String(chainId) : undefined),
      lastCheckedAt: new Date().toISOString()
    };
  } catch {
    return {
      ...endpoint,
      status: 'down',
      latencyMs: null,
      lastCheckedAt: new Date().toISOString()
    };
  }
};

const probeWsEndpoint = async (endpoint: { id: string; url: string }) => {
  return new Promise((resolve) => {
    const started = Date.now();
    const ws = new WebSocket(endpoint.url);
    let settled = false;
    const finalize = (status: 'healthy' | 'degraded' | 'down') => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      const latencyMs = status === 'down' ? null : Date.now() - started;
      resolve({
        ...endpoint,
        status,
        latencyMs,
        wsError: status === 'down' ? 'connect_failed' : undefined,
        lastCheckedAt: new Date().toISOString()
      });
    };
    const timer = setTimeout(() => finalize('down'), 1500);
    ws.onopen = () => {
      clearTimeout(timer);
      finalize(Date.now() - started > 1200 ? 'degraded' : 'healthy');
    };
    ws.onerror = () => {
      clearTimeout(timer);
      finalize('down');
    };
  });
};

const probeRpcEndpoint = async (endpoint: { id: string; url: string; protocol?: string }) => {
  const protocol = endpoint.protocol || (endpoint.url.startsWith('ws') ? 'ws' : 'http');
  if (protocol === 'ws') {
    return probeWsEndpoint(endpoint);
  }
  return probeHttpEndpoint(endpoint);
};

const normalizeRpcEndpoint = (entry: RpcRegistryEntry, source: string) => {
  const url = entry.url || entry.rpc || entry.http;
  if (!url) return null;
  const chainId = entry.chainId ?? entry.chain_id ?? entry.chain?.chainId ?? entry.chain?.id;
  const idBase = entry.id || `${source}-${chainId ?? 'unknown'}-${url}`;
  const id = crypto.createHash('sha256').update(idBase).digest('hex').slice(0, 12);
  const status =
    entry.health?.status === 'degraded' || entry.health?.status === 'down'
      ? entry.health?.status
      : entry.status === 'degraded' || entry.status === 'down'
        ? entry.status
        : 'healthy';
  const type =
    entry.type === 'partner'
      ? 'partner'
      : entry.auth && entry.auth !== 'none'
        ? 'private'
        : 'public';
  return {
    id,
    chainId: chainId ? String(chainId) : undefined,
    chainKey: entry.chain?.chainKey,
    chainName: entry.chain?.name || entry.name,
    layer: entry.chain?.layer,
    chainType: entry.chain?.chainType,
    network: entry.chain?.network,
    url,
    type,
    protocol: entry.protocol,
    auth: entry.auth,
    region: entry.region,
    priority: entry.priority,
    features: entry.features,
    latencyMs: entry.health?.latencyMs,
    status,
    lastCheckedAt: entry.health?.lastChecked || entry.lastCheckedAt || entry.checkedAt || new Date().toISOString()
  };
};

const getTargetChainIds = () => {
  const ids = new Set<string>();
  ids.add('14000101');
  ids.add('901');
  ids.add('903');
  if (env.CHAIN_ID) ids.add(env.CHAIN_ID);
  if (process.env.GHOSTCHAIN_L1_CHAIN_ID) ids.add(process.env.GHOSTCHAIN_L1_CHAIN_ID);
  if (process.env.GHOSTL2_CHAIN_ID) ids.add(process.env.GHOSTL2_CHAIN_ID);
  if (process.env.GHOSTL3_CHAIN_ID) ids.add(process.env.GHOSTL3_CHAIN_ID);
  return Array.from(ids);
};

const fetchRegistryEndpoints = async () => {
  const registryUrl = env.RPC_REGISTRY_URL || 'https://rpc.ghostchain.cloud/v1/endpoints';
  const res = await fetch(registryUrl);
  if (!res.ok) return { endpoints: [] as ReturnType<typeof normalizeRpcEndpoint>[], chainIds: [] as string[] };
  const body = (await res.json()) as RpcRegistryResponse | RpcRegistryEntry[];
  if (Array.isArray(body)) {
    const endpoints = body
      .map((entry) => normalizeRpcEndpoint(entry, 'ghostchain'))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const chainIds = Array.from(
      new Set(endpoints.map((entry) => entry.chainId).filter(Boolean) as string[])
    );
    return { endpoints, chainIds };
  }
  const chains = body.chains || [];
  const endpoints: RpcRegistryEntry[] = [];
  const chainIds = new Set<string>();
  chains.forEach((chain) => {
    chainIds.add(String(chain.chainId));
    if ((chain as { rpc?: { http?: string[]; ws?: string[] } }).rpc) {
      const rpc = (chain as { rpc?: { http?: string[]; ws?: string[] } }).rpc || {};
      (rpc.http || []).forEach((url) => {
        endpoints.push({
          url,
          protocol: 'http',
          chainId: chain.chainId,
          name: chain.chainName || chain.name,
          chain: {
            chainId: chain.chainId,
            name: chain.chainName || chain.name,
            chainKey: chain.chainKey,
            layer: chain.layer,
            chainType: chain.chainType,
            network: chain.network,
            parentChainId: chain.rollup?.parentChainId
          }
        });
      });
      (rpc.ws || []).forEach((url) => {
        endpoints.push({
          url,
          protocol: 'ws',
          chainId: chain.chainId,
          name: chain.chainName || chain.name,
          chain: {
            chainId: chain.chainId,
            name: chain.chainName || chain.name,
            chainKey: chain.chainKey,
            layer: chain.layer,
            chainType: chain.chainType,
            network: chain.network,
            parentChainId: chain.rollup?.parentChainId
          }
        });
      });
      return;
    }
    (chain.endpoints || []).forEach((endpoint) => {
      endpoints.push({
        ...endpoint,
        chainId: chain.chainId,
        name: chain.chainName,
        chain: {
          chainId: chain.chainId,
          name: chain.chainName,
          chainKey: chain.chainKey,
          layer: chain.layer,
          chainType: chain.chainType,
          network: chain.network,
          parentChainId: chain.rollup?.parentChainId
        }
      });
    });
  });
  const normalized = endpoints
    .map((entry) => normalizeRpcEndpoint(entry, 'ghostchain'))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const wsMirrors = endpoints
    .filter((entry) => typeof entry.url === 'string' && entry.url.startsWith('http'))
    .map((entry) => ({
      ...entry,
      url: entry.url?.replace(/^http/, 'ws'),
      protocol: 'ws' as const
    }))
    .map((entry) => normalizeRpcEndpoint(entry, 'ghostchain'))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const merged = [...normalized, ...wsMirrors].reduce((acc, endpoint) => {
    if (!endpoint) return acc;
    if (acc.find((item) => item.url === endpoint.url)) return acc;
    acc.push(endpoint);
    return acc;
  }, [] as typeof normalized);
  return { endpoints: merged, chainIds: Array.from(chainIds) };
};

const fetchPublicChainEndpoints = async (chainIds: string[]) => {
  const res = await fetch('https://chainid.network/chains.json');
  if (!res.ok) return [] as unknown[];
  const chains = (await res.json()) as {
    chainId: number;
    name: string;
    rpc: string[];
  }[];
  const chainMap = new Map<string, { chainId: number; name: string; rpc: string[] }>();
  chains.forEach((chain) => chainMap.set(String(chain.chainId), chain));
  const endpoints: RpcRegistryEntry[] = [];
  chainIds.forEach((id) => {
    const chain = chainMap.get(id);
    if (!chain) return;
    chain.rpc
      .filter((rpc) => rpc.startsWith('http'))
      .slice(0, 2)
      .forEach((rpcUrl) => {
        endpoints.push({
          url: rpcUrl,
          chainId: chain.chainId,
          name: chain.name,
          type: 'public',
          status: 'degraded'
        });
      });
  });
  return endpoints
    .map((entry) => normalizeRpcEndpoint(entry, 'public'))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
};

const layerForChainId = (chainId?: string) => {
  if (!chainId) return undefined;
  if (chainId === (process.env.GHOSTCHAIN_L1_CHAIN_ID || '14000101')) return 'L1';
  if (chainId === (process.env.GHOSTL2_CHAIN_ID || env.CHAIN_ID || '901')) return 'L2';
  if (chainId === (process.env.GHOSTL3_CHAIN_ID || '903')) return 'L3';
  return undefined;
};

const getRpcEndpoints = async () => {
  const now = Date.now();
  if (rpcEndpointCache && rpcEndpointCache.expiresAt > now) {
    return rpcEndpointCache.endpoints;
  }
  const ttl = 5 * 60 * 1000 + Math.floor(Math.random() * 10 * 60 * 1000);
  const targetChainIds = getTargetChainIds();
  let registryEndpoints: Array<NonNullable<ReturnType<typeof normalizeRpcEndpoint>>> = [];
  let registryChainIds: string[] = [];
  try {
    const registry = (await withTimeout(fetchRegistryEndpoints(), 5000)) as {
      endpoints: Array<NonNullable<ReturnType<typeof normalizeRpcEndpoint>>>;
      chainIds: string[];
    };
    registryEndpoints = registry.endpoints;
    registryChainIds = registry.chainIds;
  } catch {
    registryEndpoints = [];
  }
  const chainIds = Array.from(new Set([...targetChainIds, ...registryChainIds]));
  const registryByChain = new Map<string, number>();
  registryEndpoints.forEach((endpoint) => {
    if (endpoint?.chainId) {
      registryByChain.set(endpoint.chainId, (registryByChain.get(endpoint.chainId) || 0) + 1);
    }
  });
  const missingChainIds = chainIds.filter((id) => !registryByChain.get(id));
  let publicEndpoints: Array<NonNullable<ReturnType<typeof normalizeRpcEndpoint>>> = [];
  if (missingChainIds.length) {
    try {
      publicEndpoints = (await withTimeout(fetchPublicChainEndpoints(missingChainIds), 5000)) as Array<
        NonNullable<ReturnType<typeof normalizeRpcEndpoint>>
      >;
    } catch {
      publicEndpoints = [];
    }
  }
  let endpoints = [...registryEndpoints, ...publicEndpoints].filter(Boolean) as Array<
    NonNullable<ReturnType<typeof normalizeRpcEndpoint>>
  >;
  endpoints = endpoints.map((endpoint) => ({
    ...endpoint,
    layer: endpoint?.layer || layerForChainId(endpoint?.chainId)
  }));
  const existingChains = new Set(endpoints.map((endpoint) => endpoint?.chainId).filter(Boolean) as string[]);
  const fallbackByChain: Record<string, { name: string; url: string }> = {
    [process.env.GHOSTCHAIN_L1_CHAIN_ID || '14000101']: {
      name: 'GhostChain L1',
      url: env.RPC_L1 || 'http://localhost:18545'
    },
    [process.env.GHOSTL2_CHAIN_ID || env.CHAIN_ID || '901']: {
      name: 'GhostL2',
      url: env.RPC_L2 || servicesBase.explorerRpc
    },
    [process.env.GHOSTL3_CHAIN_ID || '903']: {
      name: 'GhostL3',
      url: env.RPC_L3 || 'http://localhost:39545'
    }
  };
  chainIds.forEach((id) => {
    if (existingChains.has(id)) return;
    const fallback = fallbackByChain[id];
    if (!fallback || !fallback.url) return;
    endpoints.push({
      id: crypto.createHash('sha256').update(`fallback-${id}-${fallback.url}`).digest('hex').slice(0, 12),
      chainId: id,
      chainKey: undefined,
      chainName: fallback.name,
      layer: id === (process.env.GHOSTCHAIN_L1_CHAIN_ID || '14000101') ? 'L1' : id === (process.env.GHOSTL2_CHAIN_ID || env.CHAIN_ID || '901') ? 'L2' : 'L3',
      chainType: undefined,
      network: undefined,
      url: fallback.url,
      type: 'public',
      protocol: 'http',
      auth: undefined,
      region: 'local',
      priority: undefined,
      features: undefined,
      latencyMs: undefined,
      status: 'healthy',
      lastCheckedAt: new Date().toISOString()
    });
  });

  const probeCandidates = endpoints.filter(
    (endpoint) => endpoint.url.startsWith('http') && endpoint.protocol !== 'ws'
  );
  const maxProbes = 8;
  const probes = await Promise.allSettled(
    probeCandidates.slice(0, maxProbes).map((endpoint) => probeRpcEndpoint(endpoint))
  );
  probes.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    const updated = result.value as NonNullable<ReturnType<typeof normalizeRpcEndpoint>>;
    const index = endpoints.findIndex((endpoint) => endpoint.id === updated.id);
    if (index >= 0) endpoints[index] = updated;
  });

  rpcEndpointCache = { endpoints, expiresAt: now + ttl };
  return endpoints;
};

const servicesBase = {
  bridge: env.BRIDGE_SERVICE_URL,
  transfers: env.TRANSFER_SERVICE_URL,
  liquidity: env.LIQUIDITY_SERVICE_URL,
  contracts: env.CONTRACT_REGISTRY_URL,
  contractRisk: env.CONTRACT_RISK_URL,
  supply: env.SUPPLY_SERVICE_URL,
  feeModel: env.FEE_MODEL_SERVICE_URL,
  treasury: env.TREASURY_SERVICE_URL,
  payouts: env.PAYOUT_SERVICE_URL,
  governance: env.GOVERNANCE_SERVICE_URL,
  validators: env.VALIDATOR_SERVICE_URL,
  devops: env.DEVOPS_SERVICE_URL,
  rpc: env.RPC_SERVICE_URL,
  usage: env.USAGE_SERVICE_URL,
  webhooks: env.WEBHOOKS_SERVICE_URL,
  ai: env.AI_SERVICE_URL,
  forecasting: env.FORECASTING_SERVICE_URL,
  explainability: env.EXPLAINABILITY_SERVICE_URL,
  explorerRpc: env.EXPLORER_RPC_URL || env.RPC_L2 || 'http://localhost:18547',
  swap: env.SWAP_SERVICE_URL
};
const ghostchainConfig = [
  { id: 'l1' as const, label: 'GhostChain L1', rpc: env.RPC_L1 || 'http://localhost:18545' },
  { id: 'l2' as const, label: 'GhostL2', rpc: env.RPC_L2 || servicesBase.explorerRpc },
  { id: 'l3' as const, label: 'GhostL3', rpc: env.RPC_L3 || 'http://localhost:39545' }
];
const contractMetadata = {
  upgradeabilityQuery: env.CONTRACT_UPGRADEABILITY_QUERY || 'op_contract_upgradeability',
  pauseQuery: env.CONTRACT_PAUSE_QUERY || 'op_contract_paused'
};
const notificationChannels: NotificationChannel[] = [];
if (env.SLACK_WEBHOOK_URL) {
  notificationChannels.push({ id: 'slack-default', type: 'slack', target: env.SLACK_WEBHOOK_URL });
}
if (env.DISCORD_WEBHOOK_URL) {
  notificationChannels.push({ id: 'discord-default', type: 'discord', target: env.DISCORD_WEBHOOK_URL });
}
if (env.ALERT_WEBHOOK_URL) {
  notificationChannels.push({ id: 'webhook-default', type: 'webhook', target: env.ALERT_WEBHOOK_URL });
}
if (env.EMAIL_SMTP_URL && env.EMAIL_FROM && env.EMAIL_TO) {
  notificationChannels.push({
    id: 'email-default',
    type: 'email',
    target: env.EMAIL_TO,
    meta: { smtpUrl: env.EMAIL_SMTP_URL, from: env.EMAIL_FROM }
  });
}

const sendNotification = async (alert: { id?: string; message?: string; severity?: string }, channels: string[]) => {
  const sendWithTimeout = async (url: string, body: unknown, timeoutMs = 5000, headers: Record<string, string> = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  };

  const retry = async (fn: () => Promise<void>, attempts = 3, delayMs = 500) => {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        await fn();
        return;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
  };

  const targets = notificationChannels.filter((c) => channels.includes(c.id));
  await Promise.all(
    targets.map(async (ch) => {
      if (!ch.target) return;
      if (ch.type === 'email' && ch.meta?.smtpUrl && ch.meta?.from) {
        const transporter = nodemailer.createTransport(ch.meta.smtpUrl as string);
        await transporter.sendMail({
          from: ch.meta.from as string,
          to: ch.target,
          subject: `[${alert.severity || 'info'}] ${alert.id || 'alert'}`,
          text: alert.message || 'incident',
          html: `<p>${alert.message || 'incident'}</p>`
        });
      } else {
        const payload =
          ch.type === 'slack'
            ? { text: `[${alert.severity || 'info'}] ${alert.id || 'alert'} - ${alert.message || 'incident'}` }
            : ch.type === 'discord'
              ? { content: `[${alert.severity || 'info'}] ${alert.id || 'alert'} - ${alert.message || 'incident'}` }
              : { alert };
        await retry(async () => {
          const headers: Record<string, string> = {};
          if (env.ALERT_WEBHOOK_SECRET && ch.type !== 'email') {
            const hmac = crypto.createHmac('sha256', env.ALERT_WEBHOOK_SECRET);
            const body = JSON.stringify(payload);
            const ts = Date.now().toString();
            hmac.update(`${ts}:${body}`);
            headers['x-signature-ts'] = ts;
            headers['x-signature-sha256'] = hmac.digest('hex');
          }
          await sendWithTimeout(ch.target, payload, 5000, headers);
        }, 3, 500).catch(() => undefined);
      }
    })
  );
};

const treasuryStateFile = process.env.TREASURY_STATE_FILE || path.join(process.cwd(), 'data', 'treasury-proposals.json');
const ensureDir = (filePath: string) => fs.mkdirSync(path.dirname(filePath), { recursive: true });
const loadTreasuryProposals = (): TreasuryProposal[] => {
  try {
    const raw = fs.readFileSync(treasuryStateFile, 'utf-8');
    return JSON.parse(raw) as TreasuryProposal[];
  } catch {
    ensureDir(treasuryStateFile);
    fs.writeFileSync(treasuryStateFile, JSON.stringify([]));
    return [];
  }
};
const saveTreasuryProposals = (items: TreasuryProposal[]) => {
  ensureDir(treasuryStateFile);
  fs.writeFileSync(treasuryStateFile, JSON.stringify(items, null, 2));
};
const treasuryProposals = loadTreasuryProposals();

const contractStateFile = env.CONTRACT_STATE_FILE || path.join(process.cwd(), 'data', 'contracts-state.json');
const loadContractState = (): ContractState[] => {
  try {
    const raw = fs.readFileSync(contractStateFile, 'utf-8');
    return JSON.parse(raw) as ContractState[];
  } catch {
    ensureDir(contractStateFile);
    fs.writeFileSync(contractStateFile, JSON.stringify([]));
    return [];
  }
};
const saveContractState = (items: ContractState[]) => {
  ensureDir(contractStateFile);
  fs.writeFileSync(contractStateFile, JSON.stringify(items, null, 2));
};
const contractStates = loadContractState();
const pausableAbi = ['function pause()', 'function unpause()', 'function paused() view returns (bool)'];
const proxyAdminAbi = ['function upgrade(address proxy, address implementation)', 'function upgradeTo(address implementation)'];
const ownableAbi = ['function transferOwnership(address newOwner)', 'function owner() view returns (address)'];
const guardianAbi = ['function setGuardian(address)', 'function guardian() view returns (address)'];
const pausableInterface = new Interface(pausableAbi);
const proxyAdminInterface = new Interface(proxyAdminAbi);
const ownableInterface = new Interface(ownableAbi);
const guardianInterface = new Interface(guardianAbi);

const sendRawTx = async (to: string, data: string) => {
  if (!env.CONTRACT_RPC_URL || !env.CONTRACT_ADMIN_KEY) {
    throw new Error('contract tx not configured');
  }
  const provider = new JsonRpcProvider(env.CONTRACT_RPC_URL);
  const wallet = new Wallet(env.CONTRACT_ADMIN_KEY, provider);
  const tx = await wallet.sendTransaction({ to, data });
  return tx.hash;
};

const sendContractTx = async (method: 'pause' | 'unpause', target = env.CONTRACT_TARGET_ADDRESS) => {
  if (!target) throw new Error('contract target not configured');
  const provider = env.CONTRACT_RPC_URL ? new JsonRpcProvider(env.CONTRACT_RPC_URL) : undefined;
  if (provider) {
    try {
      const current = await provider.call({ to: target, data: pausableInterface.encodeFunctionData('paused') });
      const paused = pausableInterface.decodeFunctionResult('paused', current)[0] as boolean;
      if (method === 'pause' && paused) return undefined;
      if (method === 'unpause' && !paused) return undefined;
    } catch {
      // ignore validation failures
    }
  }
  const data = pausableInterface.encodeFunctionData(method);
  return sendRawTx(target, data);
};

const upgradePlanFile = path.join(process.cwd(), 'data', 'upgrade-plans.json');
const loadUpgradePlans = (): UpgradePlan[] => {
  try {
    const raw = fs.readFileSync(upgradePlanFile, 'utf-8');
    return JSON.parse(raw) as UpgradePlan[];
  } catch {
    ensureDir(upgradePlanFile);
    fs.writeFileSync(upgradePlanFile, JSON.stringify([]));
    return [];
  }
};
const saveUpgradePlans = (items: UpgradePlan[]) => {
  ensureDir(upgradePlanFile);
  fs.writeFileSync(upgradePlanFile, JSON.stringify(items, null, 2));
};
const upgradePlans = loadUpgradePlans();

const executeUpgradeAction = async (action?: { type: string; payload?: Record<string, unknown> }) => {
  if (!action) return undefined;
  const payload = action.payload || {};
  switch (action.type) {
    case 'pause':
      return sendContractTx('pause', payload.address as string | undefined);
    case 'unpause':
      return sendContractTx('unpause', payload.address as string | undefined);
    case 'upgrade': {
      const proxy = (payload.proxyAddress as string) || env.CONTRACT_TARGET_ADDRESS;
      const impl = payload.implementation as string;
      const admin = env.CONTRACT_PROXY_ADMIN_ADDRESS || proxy;
      if (!proxy || !impl) throw new Error('proxy/implementation required');
      if (env.CONTRACT_RPC_URL) {
        try {
          const provider = new JsonRpcProvider(env.CONTRACT_RPC_URL);
          const slot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
          const storageReader = provider as unknown as {
            getStorageAt?: (address: string, slot: string) => Promise<string>;
            getStorage?: (address: string, slot: string) => Promise<string>;
          };
          const readStorage = storageReader.getStorageAt || storageReader.getStorage;
          if (readStorage) {
            const val = await readStorage.call(provider, proxy, slot);
            if (val?.toLowerCase().endsWith(impl.toLowerCase().replace('0x', '').padStart(64, '0'))) {
              return undefined;
            }
          }
        } catch {
          // ignore
        }
      }
      const data =
        env.CONTRACT_PROXY_ADMIN_ADDRESS && env.CONTRACT_PROXY_ADMIN_ADDRESS !== proxy
          ? proxyAdminInterface.encodeFunctionData('upgrade', [proxy, impl])
          : proxyAdminInterface.encodeFunctionData('upgradeTo', [impl]);
      return sendRawTx(admin!, data);
    }
    case 'transferOwnership': {
      const target = (payload.address as string) || env.CONTRACT_TARGET_ADDRESS;
      const newOwner = payload.newOwner as string;
      if (!target || !newOwner) throw new Error('address/newOwner required');
      if (env.CONTRACT_RPC_URL) {
        try {
          const provider = new JsonRpcProvider(env.CONTRACT_RPC_URL);
          const current = await provider.call({ to: target, data: ownableInterface.encodeFunctionData('owner') });
          const decoded = ownableInterface.decodeFunctionResult('owner', current)[0] as string;
          if (decoded.toLowerCase() === newOwner.toLowerCase()) return undefined;
        } catch {
          // ignore
        }
      }
      const data = ownableInterface.encodeFunctionData('transferOwnership', [newOwner]);
      return sendRawTx(target, data);
    }
    case 'setGuardian': {
      const target = (payload.address as string) || env.CONTRACT_TARGET_ADDRESS;
      const guardian = payload.guardian as string;
      if (!target || !guardian) throw new Error('address/guardian required');
      if (env.CONTRACT_RPC_URL) {
        try {
          const provider = new JsonRpcProvider(env.CONTRACT_RPC_URL);
          const current = await provider.call({ to: target, data: guardianInterface.encodeFunctionData('guardian') });
          const decoded = guardianInterface.decodeFunctionResult('guardian', current)[0] as string;
          if (decoded.toLowerCase() === guardian.toLowerCase()) return undefined;
        } catch {
          // ignore
        }
      }
      const data = guardianInterface.encodeFunctionData('setGuardian', [guardian]);
      return sendRawTx(target, data);
    }
    case 'execute': {
      const to = payload.to as string;
      const data = payload.data as string;
      if (!to || typeof data !== 'string' || !data.startsWith('0x')) throw new Error('to/data required');
      return sendRawTx(to, data);
    }
    default:
      return undefined;
  }
};

const allowlist = (env.EXECUTION_ALLOWLIST && env.EXECUTION_ALLOWLIST.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean)) || [];
const isAllowedAddress = (addr?: string) => {
  if (!addr) return true;
  if (!allowlist.length) return true;
  return allowlist.includes(addr.toLowerCase());
};

const assertAllowedAction = (action?: { type: string; payload?: Record<string, unknown> }) => {
  if (!action) return;
  const payload = action.payload || {};
  switch (action.type) {
    case 'pause':
    case 'unpause':
      if (!isAllowedAddress(payload.address as string)) throw new Error('address not allowlisted');
      return;
    case 'upgrade': {
      const proxy = (payload.proxyAddress as string) || env.CONTRACT_TARGET_ADDRESS;
      const admin = env.CONTRACT_PROXY_ADMIN_ADDRESS || proxy;
      if (!isAllowedAddress(proxy) || !isAllowedAddress(admin) || !isAllowedAddress(payload.implementation as string)) {
        throw new Error('upgrade target not allowlisted');
      }
      return;
    }
    case 'transferOwnership':
      if (!isAllowedAddress(payload.address as string) || !isAllowedAddress(payload.newOwner as string)) {
        throw new Error('ownership target not allowlisted');
      }
      return;
    case 'execute':
      if (!isAllowedAddress(payload.to as string)) throw new Error('execute target not allowlisted');
      return;
    default:
      return;
  }
};

const complianceFile = path.join(process.cwd(), 'data', 'compliance-reports.json');
const loadCompliance = (): ComplianceDetail[] => {
  try {
    const raw = fs.readFileSync(complianceFile, 'utf-8');
    return JSON.parse(raw) as ComplianceDetail[];
  } catch {
    ensureDir(complianceFile);
    fs.writeFileSync(complianceFile, JSON.stringify([]));
    return [];
  }
};
const saveCompliance = (items: ComplianceDetail[]) => {
  ensureDir(complianceFile);
  fs.writeFileSync(complianceFile, JSON.stringify(items, null, 2));
};
const complianceReports = loadCompliance();

const fetchOk = async (url: string, timeoutMs = 2000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const allowAll: RequestHandler = (_req, _res, next) => next();

app.use(['/v1/app-shell', '/app-shell'], buildAppShellRouter(services.appShell));
app.use(
  ['/v1/chain', '/chain'],
  env.PUBLIC_CHAIN ? allowAll : requirePermission('chain:read'),
  buildChainRouter({
    status: liveServices.chain.chainStatusService,
    telemetry: liveServices.chain.consensusTelemetryService,
    peers: liveServices.chain.peerGraphService
  })
);
app.use(
  ['/v1/nodes', '/nodes'],
  env.PUBLIC_NODES ? allowAll : requirePermission('nodes:read'),
  buildNodeRouter({
    inventory: liveServices.nodes.nodeInventoryService,
    health: liveServices.nodes.nodeHealthService
  })
);
app.use(
  ['/v1/stack', '/stack'],
  env.PUBLIC_STACK ? allowAll : requirePermission('chain:read'),
  buildStackRouter({
    prometheus,
    guard,
    relayer
  })
);
ghostWalletServicePromise.then((ghostWalletService) => {
  app.use(['/v1/wallet', '/wallet'], buildWalletRouter(ghostWalletService));
});
kycServicePromise.then((kycService) => {
  app.use(['/v1/kyc', '/kyc'], buildKycRouter(kycService));
});
app.use(
  ['/v1/devops', '/devops'],
  buildDevopsRouter({
    releases: liveServices.devops.releaseService,
    forks: liveServices.devops.forkService
  })
);
app.use(['/v1/ai', '/ai'], buildAiRouter());

app.get(['/v1/rpc/pool', '/rpc/pool'], requirePermission('integrations:read'), (_req, res) => {
  res.json({ pool: ghostWalletRpcManager.getPoolSnapshot() });
});

identityServicesPromise.then(async (identity) => {
  auditLogService = identity.auditLogService;
  const bootstrapOwnerEmails = parseEmailList(env.BOOTSTRAP_OWNER_EMAILS);
  const bootstrapOwnerPassword = env.BOOTSTRAP_OWNER_PASSWORD;
  if (bootstrapOwnerEmails.length && bootstrapOwnerPassword) {
    try {
      const existingUsers = await identity.userService.list();
      if (existingUsers.length === 0) {
        const createdEmails: string[] = [];
        for (const email of bootstrapOwnerEmails) {
          const owner = await identity.authService.registerWithPassword(email, bootstrapOwnerPassword, ['owner']);
          await identity.auditLogService.append({
            actorId: owner.id,
            action: 'bootstrap:owner',
            resource: owner.id,
            meta: { source: 'startup', email }
          });
          createdEmails.push(email);
        }
        if (createdEmails.length) {
          console.log(`Bootstrapped owner user(s) ${createdEmails.join(', ')}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'bootstrap_failed';
      console.warn(`Bootstrap owner failed: ${message}`);
    }
  }
  const bootstrapEmail = env.BOOTSTRAP_ADMIN_EMAIL;
  const bootstrapPassword = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (bootstrapEmail && bootstrapPassword) {
    try {
      const admin = await identity.authService.bootstrapAdmin(bootstrapEmail, bootstrapPassword);
      await identity.auditLogService.append({
        actorId: admin.id,
        action: 'bootstrap:admin',
        resource: admin.id,
        meta: { source: 'startup', email: bootstrapEmail }
      });
      console.log(`Bootstrapped admin user ${bootstrapEmail}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'bootstrap_failed';
      if (message !== 'bootstrap_disabled') {
        console.warn(`Bootstrap admin failed: ${message}`);
      }
    }
  }
  const walletService = await walletServicePromise;
  const tokenService = await tokenServicePromise;
  const ghostWalletService = await ghostWalletServicePromise;
  const identityRouter = buildIdentityAccessRouter({ ...identity, walletService, ghostWalletService });
  app.use('/v1', identityRouter);
  app.use('/', identityRouter);
  app.use(['/v1', '/'], buildGhostchainRouter(ghostchainConfig));
  const logIntel = new LogIntelService({
    loki,
    anomalyUrl: servicesBase.ai,
    explainabilityUrl: servicesBase.explainability,
    auditLog: identity.auditLogService,
    criticalStore: criticalLogStore,
    maxLimit: env.OBSERVABILITY_LOG_MAX_LIMIT
  });
  const observabilityGuard = env.PUBLIC_OBSERVABILITY ? allowAll : requirePermission('observability:read');
  app.use(
    ['/v1/observability', '/observability'],
    observabilityGuard,
    buildObservabilityRouter({
      metrics: liveServices.observability.metricsService,
      logs: liveServices.observability.logsService,
      alerts: liveServices.observability.alertRulesService,
      notifications: {
        listChannels: async () => notificationChannels,
        send: async (alert, channels) => sendNotification(alert, channels)
      },
      guard: guard,
      channels: notificationChannels,
      auditLog: identity.auditLogService,
      logIntel,
      criticalStore: criticalLogStore,
      alertProxy: alertmanager ? (payload: AlertmanagerAlert) => alertmanager.send(payload) : undefined
    })
  );
  app.use(['/v1/wallets', '/wallets'], buildWalletAdminRouter(walletService, ghostWalletService));
  app.use(['/v1', '/'], buildTokenRouter(tokenService, walletService));
});

const rpcUrls = {
  l1: env.RPC_L1 || 'http://localhost:18545',
  l2: env.RPC_L2 || servicesBase.explorerRpc,
  l3: env.RPC_L3 || 'http://localhost:39545',
  default: servicesBase.explorerRpc
};
const rpcForChain = (chain?: string) => {
  if (chain === 'l1') return rpcUrls.l1;
  if (chain === 'l3') return rpcUrls.l3;
  if (chain === 'l2') return rpcUrls.l2;
  return rpcUrls.default;
};

const rpcCall = async <T = unknown>(method: string, params: unknown[] = [], rpcUrl = servicesBase.explorerRpc) => {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`);
  const body = (await res.json()) as RpcResponse<T>;
  if (body.error) throw new Error(body.error.message || 'rpc_error');
  return body.result;
};

app.get(['/v1/api/bridge', '/api/bridge'], requirePermission('bridge:read'), async (_req, res) => {
  const [bridges, transfers, pools, signatures] = await Promise.all([
    proxyJson<{ bridges?: BridgeNetwork[] }>(`${servicesBase.bridge}/bridges`, { bridges: [] }).catch(() => ({ bridges: [] })),
    proxyJson<{ transfers?: Transfer[] }>(`${servicesBase.transfers}/transfers`, { transfers: [] }).catch(() => ({ transfers: [] })),
    proxyJson<{ pools?: BridgeNetwork[] }>(`${servicesBase.liquidity}/liquidity`, { pools: [] }).catch(() => ({ pools: [] })),
    proxyJson<{ signatures?: BridgeSignature[] }>(`${servicesBase.bridge}/bridges/signatures`, { signatures: [] }).catch(() => ({ signatures: [] }))
  ]);
  const sigMap = new Map<string, { signatures?: string[]; required?: number }>();
  (signatures.signatures || []).forEach((s) => {
    if (s.transferId) sigMap.set(s.transferId, { signatures: s.signatures || [], required: s.required });
  });
  const txs = (transfers.transfers as Transfer[]) || [];
  const enriched = txs.map((t) => {
    const sig = sigMap.get(t.id) || {};
    return { ...t, signatures: sig.signatures || [], requiredSignatures: sig.required || t.requiredSignatures || 2 };
  });
  const pending = enriched.filter((t) => t.status === 'pending');
  const finalized = enriched.filter((t) => t.status === 'finalized');
  res.json({
    ok: true,
    networks: bridges.bridges || [],
    transfers: enriched,
    pools: pools.pools || [],
    summary: {
      pending: pending.length,
      finalized: finalized.length,
      signaturesMissing: pending.filter((t) => (t.signatures?.length || 0) < (t.requiredSignatures || 2)).length
    }
  });
});

app.get(['/v1/api/bridge/incidents', '/api/bridge/incidents'], requirePermission('bridge:write'), async (_req, res) => {
  const upstream = await fetch(`${servicesBase.bridge}/bridges/incidents`, {
    headers: { 'x-admin-token': env.BRIDGE_ADMIN_TOKEN || '' }
  });
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    res.status(upstream.status).json(body);
    return;
  }
  res.json(body);
});

app.post(['/v1/api/bridge/incidents', '/api/bridge/incidents'], requirePermission('bridge:write'), async (req, res) => {
  const upstream = await fetch(`${servicesBase.bridge}/bridges/incidents`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': env.BRIDGE_ADMIN_TOKEN || ''
    },
    body: JSON.stringify(req.body || {})
  });
  const body = (await upstream.json().catch(() => ({}))) as { incident?: { id?: string } };
  if (!upstream.ok) {
    res.status(upstream.status).json(body);
    return;
  }
  if (alertmanager) {
    try {
      await alertmanager.send({
        status: 'firing',
        labels: { alertname: 'bridge_incident', severity: req.body?.severity || 'warning' },
        annotations: { description: req.body?.message || 'bridge incident' }
      });
    } catch {
      // ignore alert forwarding errors
    }
  }
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'bridge:incident',
    resource: body?.incident?.id || 'bridge',
    meta: { correlationId: req.correlationId, severity: req.body?.severity }
  });
  res.status(201).json(body);
});

app.post(['/v1/api/bridge/pause', '/api/bridge/pause'], requirePermission('bridge:write'), async (req, res) => {
  const upstream = await fetch(`${servicesBase.bridge}/bridges/pause`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': env.BRIDGE_ADMIN_TOKEN || ''
    }
  });
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    res.status(upstream.status).json(body);
    return;
  }
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'bridge:pause',
    resource: 'bridge',
    meta: { correlationId: req.correlationId }
  });
  res.json(body);
});

app.post(['/v1/api/bridge/resume', '/api/bridge/resume'], requirePermission('bridge:write'), async (req, res) => {
  const upstream = await fetch(`${servicesBase.bridge}/bridges/resume`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': env.BRIDGE_ADMIN_TOKEN || ''
    }
  });
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    res.status(upstream.status).json(body);
    return;
  }
  await auditLogService?.append({
    actorId: req.session.userId || 'system',
    action: 'bridge:resume',
    resource: 'bridge',
    meta: { correlationId: req.correlationId }
  });
  res.json(body);
});

app.get(['/v1/api/bridge/fees', '/api/bridge/fees'], requirePermission('bridge:write'), async (req, res) => {
  const upstream = await fetch(`${servicesBase.bridge}/bridges/fees`, {
    headers: {
      'x-admin-token': env.BRIDGE_ADMIN_TOKEN || ''
    }
  });
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    res.status(upstream.status).json(body);
    return;
  }
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'bridge:fees:read',
    resource: 'bridge',
    meta: { correlationId: req.correlationId }
  });
  res.json(body);
});

app.post(['/v1/api/bridge/fees', '/api/bridge/fees'], requirePermission('bridge:write'), async (req, res) => {
  const upstream = await fetch(`${servicesBase.bridge}/bridges/fees`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': env.BRIDGE_ADMIN_TOKEN || ''
    },
    body: JSON.stringify({ feeBps: req.body?.feeBps })
  });
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    res.status(upstream.status).json(body);
    return;
  }
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'bridge:fees:update',
    resource: 'bridge',
    meta: { correlationId: req.correlationId, feeBps: req.body?.feeBps }
  });
  res.json(body);
});

app.get(['/v1/api/contracts', '/api/contracts'], requirePermission('contracts:read'), async (_req, res) => {
  const registry = await proxyJson<{ contracts?: Array<Record<string, unknown>> }>(`${servicesBase.contracts}/contracts`, { contracts: [] });
  const risks = await proxyJson<{ contracts?: Array<Record<string, unknown>> }>(`${servicesBase.contractRisk}/risk`, { contracts: [] });
  const localRegistry = listRegisteredContracts();
  const pausedFlags = contractMetadata.pauseQuery ? await prometheus.query(contractMetadata.pauseQuery).catch(() => []) : [];
  const upgradeabilityFlags = contractMetadata.upgradeabilityQuery ? await prometheus.query(contractMetadata.upgradeabilityQuery).catch(() => []) : [];

  const sourceContracts: Array<Record<string, unknown>> = [
    ...((registry.contracts || []) as Array<Record<string, unknown>>),
    ...localRegistry.map((entry) => ({
      id: entry.name,
      name: entry.name,
      address: entry.address,
      registry: entry.address,
      layer: entry.layer,
      chainId: entry.chainId,
      abi: entry.abi,
      abiHash: entry.abiHash,
      version: entry.version
    }))
  ];

  const merged =
    sourceContracts.map((c) => {
      const address = typeof c.address === 'string' ? c.address : '';
      const name = typeof c.name === 'string' ? c.name : '';
      const proxyType = typeof c.proxyType === 'string' ? c.proxyType : undefined;
      const owner = typeof c.owner === 'string' ? c.owner : undefined;
      const verified = typeof c.verified === 'boolean' ? c.verified : undefined;
      const layer = typeof c.layer === 'string' ? c.layer : undefined;
      const chainId = typeof c.chainId === 'number' ? c.chainId : undefined;
      const abiHash = typeof c.abiHash === 'string' ? c.abiHash : undefined;
      const version = typeof c.version === 'string' ? c.version : undefined;
      const pausedMetric = pausedFlags.find((p) => p.metric.address?.toLowerCase() === address.toLowerCase());
      const upgradeMetric = upgradeabilityFlags.find((u) => u.metric.address?.toLowerCase() === address.toLowerCase());
      return {
        id: address || name || 'contract',
        address,
        name,
        proxies: proxyType,
        ownership: owner,
        verified,
        layer,
        chainId,
        abi: c.abi,
        abiHash,
        version,
        upgradeable: upgradeMetric ? upgradeMetric.value?.[1] === '1' : undefined,
        paused: pausedMetric ? pausedMetric.value?.[1] === '1' : undefined,
        desiredState: contractStates.find((s) => s.address.toLowerCase() === address.toLowerCase()),
        risk: risks.contracts?.find((r) => (r.address as string)?.toLowerCase() === address.toLowerCase())
      };
    }) || [];
  res.json({ ok: true, networks: merged });
});

app.get(['/v1/api/contracts/state', '/api/contracts/state'], requirePermission('contracts:read'), async (_req, res) => {
  res.json({ ok: true, contracts: contractStates });
});

app.post(['/v1/api/contracts/register', '/api/contracts/register'], async (req, res) => {
  const permissions = (req.session?.permissions || []) as string[];
  const canWrite = permissions.includes('*') || permissions.includes('contracts:write');
  if (!canWrite && !hasContractsToken(req)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const body = req.body || {};
  const entries: Array<Record<string, unknown>> = Array.isArray(body.contracts)
    ? body.contracts
    : body.contract
      ? [body.contract]
      : [];
  if (!entries.length) {
    res.status(400).json({ error: 'contract_required' });
    return;
  }
  const normalized = entries.map((entry) => {
    const layerRaw = String(entry.layer || 'l2');
    const layer = (layerRaw === 'l1' || layerRaw === 'l2' || layerRaw === 'l3' ? layerRaw : 'l2') as
      | 'l1'
      | 'l2'
      | 'l3';
    return {
      name: String(entry.name || entry.id || entry.address),
      address: String(entry.address || ''),
      chainId: Number(entry.chainId || 0),
      layer,
      abi: (entry.abi ?? []) as unknown,
      abiHash: String(entry.abiHash || ''),
      version: String(entry.version || '0.0.1'),
      deployedAt: entry.deployedAt ? String(entry.deployedAt) : undefined
    };
  });
  const stored = registerContracts(normalized);
  res.json({ ok: true, contracts: stored });
});

app.get(['/v1/api/contracts/deployments', '/api/contracts/deployments'], requirePermission('contracts:read'), async (_req, res) => {
  if (!fs.existsSync(contractsDeploymentsDir)) {
    res.json({ ok: true, deployments: [] });
    return;
  }
  const deployments: Array<{ network: string; layer: string; file: string }> = [];
  const networks = fs.readdirSync(contractsDeploymentsDir, { withFileTypes: true }) as fs.Dirent[];
  networks.forEach((entry: fs.Dirent) => {
    if (!entry.isDirectory()) return;
    const dir = path.join(contractsDeploymentsDir, entry.name);
    fs.readdirSync(dir).forEach((file) => {
      if (!file.endsWith('.json')) return;
      const layer = file.replace('.json', '');
      deployments.push({ network: entry.name, layer, file: path.join(dir, file) });
    });
  });
  res.json({ ok: true, deployments });
});

app.post(['/v1/api/contracts/deploy', '/api/contracts/deploy'], requirePermission('contracts:write'), async (req, res) => {
  const { layer, network, rpc, deployerKeyEnv } = req.body || {};
  const args = ['run', 'deploy:one-click', '--', '--layer', layer || 'all', '--network', network || 'ghostl2'];
  if (rpc) args.push('--rpc', String(rpc));
  if (deployerKeyEnv) args.push('--deployer-key', String(deployerKeyEnv));
  const job = createContractJob({
    type: 'deploy',
    command: 'npm',
    args,
    cwd: contractsRoot,
    env: process.env,
    meta: { layer, network, rpc }
  });
  res.json({ ok: true, job });
});

app.get(['/v1/api/contracts/deploy/:id', '/api/contracts/deploy/:id'], requirePermission('contracts:read'), async (req, res) => {
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!jobId) {
    res.status(400).json({ error: 'job_id_required' });
    return;
  }
  const job = readContractJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'job_not_found' });
    return;
  }
  const offsetParam = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;
  const offset = offsetParam ? Number(offsetParam) : 0;
  const log = readContractJobLog(jobId, offset);
  res.json({ ok: true, job, log });
});

app.post(['/v1/api/contracts/tests/run', '/api/contracts/tests/run'], requirePermission('contracts:write'), async (req, res) => {
  const kind = String(req.body?.kind || 'foundry');
  const target = kind === 'fuzz' ? 'test:fuzz' : kind === 'invariant' ? 'test:invariant' : 'test:foundry';
  const job = createContractJob({
    type: 'tests',
    command: 'npm',
    args: ['run', target],
    cwd: contractsRoot,
    env: process.env,
    meta: { kind }
  });
  res.json({ ok: true, job });
});

app.get(['/v1/api/contracts/tests/summary', '/api/contracts/tests/summary'], requirePermission('contracts:read'), async (_req, res) => {
  const summaryPath = path.join(contractsReportsDir, 'foundry', 'summary.json');
  if (!fs.existsSync(summaryPath)) {
    res.json({ ok: true, summary: null });
    return;
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  res.json({ ok: true, summary });
});

app.post(['/v1/api/contracts/formal/run', '/api/contracts/formal/run'], requirePermission('contracts:write'), async (req, res) => {
  const tool = String(req.body?.tool || 'slither');
  const script = tool === 'scribble' ? 'formal:scribble' : tool === 'echidna' ? 'formal:echidna' : 'formal:slither';
  const job = createContractJob({
    type: 'formal',
    command: 'npm',
    args: ['run', script],
    cwd: contractsRoot,
    env: process.env,
    meta: { tool }
  });
  res.json({ ok: true, job });
});

app.get(['/v1/api/contracts/formal/summary', '/api/contracts/formal/summary'], requirePermission('contracts:read'), async (_req, res) => {
  const summaryPath = path.join(contractsReportsDir, 'formal', 'summary.json');
  if (!fs.existsSync(summaryPath)) {
    res.json({ ok: true, summary: null });
    return;
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  res.json({ ok: true, summary });
});

app.get(['/v1/api/contracts/diagrams', '/api/contracts/diagrams'], requirePermission('contracts:read'), async (_req, res) => {
  const diagramsDir = path.join(contractsDocsDir, 'diagrams');
  if (!fs.existsSync(diagramsDir)) {
    res.json({ ok: true, files: [] });
    return;
  }
  const files = fs.readdirSync(diagramsDir).map((name) => ({
    name,
    path: path.join(diagramsDir, name)
  }));
  res.json({ ok: true, files });
});

app.get(['/v1/api/contracts/diagrams/:name', '/api/contracts/diagrams/:name'], requirePermission('contracts:read'), async (req, res) => {
  const diagramsDir = path.join(contractsDocsDir, 'diagrams');
  const nameParam = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  if (!nameParam) {
    res.status(400).json({ error: 'diagram_name_required' });
    return;
  }
  const fileName = path.basename(String(nameParam));
  const filePath = path.join(diagramsDir, fileName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'diagram_not_found' });
    return;
  }
  res.sendFile(path.resolve(filePath));
});

app.post(['/v1/api/contracts/pause', '/api/contracts/pause'], requirePermission('contracts:write'), async (req, res) => {
  const { address, reason } = req.body || {};
  if (!address) {
    res.status(400).json({ error: 'address required' });
    return;
  }
  let txHash: string | undefined;
  try {
    txHash = await sendContractTx('pause');
  } catch {
    // if on-chain call fails, still record desired state
  }
  const existing = contractStates.find((c) => c.address.toLowerCase() === (address as string).toLowerCase());
  const now = new Date().toISOString();
  if (existing) {
    existing.paused = true;
    existing.reason = reason;
    existing.updatedAt = now;
  } else {
    contractStates.push({ address, paused: true, reason, updatedAt: now });
  }
  saveContractState(contractStates);
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'contract:pause',
    resource: address,
    meta: { correlationId: req.correlationId, reason, txHash }
  });
  await sendNotification({ id: 'contract_pause', message: `Paused ${address}`, severity: 'critical' }, notificationChannels.map((c) => c.id));
  res.json({ ok: true, address, paused: true, txHash });
});

app.post(['/v1/api/contracts/resume', '/api/contracts/resume'], requirePermission('contracts:write'), async (req, res) => {
  const { address } = req.body || {};
  if (!address) {
    res.status(400).json({ error: 'address required' });
    return;
  }
  let txHash: string | undefined;
  try {
    txHash = await sendContractTx('unpause');
  } catch {
    // ignore, still update desired state
  }
  const existing = contractStates.find((c) => c.address.toLowerCase() === (address as string).toLowerCase());
  const now = new Date().toISOString();
  if (existing) {
    existing.paused = false;
    existing.updatedAt = now;
    existing.reason = undefined;
  } else {
    contractStates.push({ address, paused: false, updatedAt: now });
  }
  saveContractState(contractStates);
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'contract:resume',
    resource: address,
    meta: { correlationId: req.correlationId, txHash }
  });
  res.json({ ok: true, address, paused: false, txHash });
});

app.post(['/v1/api/contracts/upgrade', '/api/contracts/upgrade'], requirePermission('contracts:write'), async (req, res) => {
  const { proxyAddress, implementation } = req.body || {};
  const proxy = (proxyAddress as string) || env.CONTRACT_TARGET_ADDRESS;
  const admin = (env.CONTRACT_PROXY_ADMIN_ADDRESS as string | undefined) || proxy;
  if (!proxy || !implementation) {
    res.status(400).json({ error: 'proxyAddress and implementation required' });
    return;
  }
  try {
    const data =
      env.CONTRACT_PROXY_ADMIN_ADDRESS && env.CONTRACT_PROXY_ADMIN_ADDRESS !== proxy
        ? proxyAdminInterface.encodeFunctionData('upgrade', [proxy, implementation])
        : proxyAdminInterface.encodeFunctionData('upgradeTo', [implementation]);
    if (!admin) throw new Error('proxy admin address required');
    const txHash = await sendRawTx(admin, data);
    await auditLogService?.append({
      actorId: req.session.userId || 'unknown',
      action: 'contract:upgrade',
      resource: proxy,
      meta: { correlationId: req.correlationId, implementation, txHash }
    });
    res.json({ ok: true, txHash });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post(['/v1/api/contracts/transfer-ownership', '/api/contracts/transfer-ownership'], requirePermission('contracts:write'), async (req, res) => {
  const { address, newOwner } = req.body || {};
  const target = (address as string) || env.CONTRACT_TARGET_ADDRESS;
  if (!target || !newOwner) {
    res.status(400).json({ error: 'address and newOwner required' });
    return;
  }
  try {
    const data = ownableInterface.encodeFunctionData('transferOwnership', [newOwner]);
    const txHash = await sendRawTx(target, data);
    await auditLogService?.append({
      actorId: req.session.userId || 'unknown',
      action: 'contract:transferOwnership',
      resource: target,
      meta: { correlationId: req.correlationId, newOwner, txHash }
    });
    res.json({ ok: true, txHash });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post(['/v1/api/contracts/set-guardian', '/api/contracts/set-guardian'], requirePermission('contracts:write'), async (req, res) => {
  const { address, guardian } = req.body || {};
  const target = (address as string) || env.CONTRACT_TARGET_ADDRESS;
  if (!target || !guardian) {
    res.status(400).json({ error: 'address and guardian required' });
    return;
  }
  try {
    const data = guardianInterface.encodeFunctionData('setGuardian', [guardian]);
    const txHash = await sendRawTx(target, data);
    await auditLogService?.append({
      actorId: req.session.userId || 'unknown',
      action: 'contract:setGuardian',
      resource: target,
      meta: { correlationId: req.correlationId, guardian, txHash }
    });
    res.json({ ok: true, txHash });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post(['/v1/api/contracts/execute', '/api/contracts/execute'], requirePermission('contracts:write'), async (req, res) => {
  const { to, data } = req.body || {};
  if (!to || !data) {
    res.status(400).json({ error: 'to and data required' });
    return;
  }
  if (typeof data !== 'string' || !data.startsWith('0x')) {
    res.status(400).json({ error: 'data must be hex string' });
    return;
  }
  try {
    const txHash = await sendRawTx(to, data);
    await auditLogService?.append({
      actorId: req.session.userId || 'unknown',
      action: 'contract:execute',
      resource: to,
      meta: { correlationId: req.correlationId, txHash }
    });
    res.json({ ok: true, txHash });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get(['/v1/devops/upgrade-plans', '/devops/upgrade-plans'], requirePermission('devops:read'), async (_req, res) => {
  res.json({ ok: true, plans: upgradePlans });
});

app.post(['/v1/devops/upgrade-plans', '/devops/upgrade-plans'], requirePermission('devops:write'), async (req, res) => {
  const { name, steps } = req.body || {};
  if (!name || !Array.isArray(steps)) {
    res.status(400).json({ error: 'name and steps[] required' });
    return;
  }
  const plan: UpgradePlan = {
    id: `plan-${Date.now()}`,
    name,
    steps: steps.map((s: { name: string; action?: { type: string; payload?: Record<string, unknown> } }) => ({
      id: `${Math.random().toString(36).slice(2)}`,
      name: s.name,
      status: 'pending',
      action: s.action
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvals: []
  };
  upgradePlans.push(plan);
  saveUpgradePlans(upgradePlans);
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'upgrade-plan:create',
    resource: plan.id,
    meta: { correlationId: req.correlationId }
  });
  res.status(201).json({ ok: true, plan });
});

app.post(['/v1/devops/upgrade-plans/:id/steps/:stepId'], requirePermission('devops:write'), async (req, res) => {
  const plan = upgradePlans.find((p) => p.id === req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'plan_not_found' });
    return;
  }
  const step = plan.steps.find((s) => s.id === req.params.stepId);
  if (!step) {
    res.status(404).json({ error: 'step_not_found' });
    return;
  }
  const { status, notes } = req.body || {};
  if (!['pending', 'in_progress', 'done'].includes(status)) {
    res.status(400).json({ error: 'invalid status' });
    return;
  }
  step.status = status as UpgradePlan['steps'][number]['status'];
  step.notes = notes;
  plan.updatedAt = new Date().toISOString();
  saveUpgradePlans(upgradePlans);
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'upgrade-plan:update',
    resource: `${plan.id}:${step.id}`,
    meta: { correlationId: req.correlationId, status, notes }
  });
  res.json({ ok: true, plan });
});

app.post(['/v1/devops/upgrade-plans/:id/approve'], requirePermission('devops:write'), async (req, res) => {
  const plan = upgradePlans.find((p) => p.id === req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'plan_not_found' });
    return;
  }
  if (!req.session.userId) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  if (!plan.approvals.find((a) => a.userId === req.session.userId)) {
    plan.approvals.push({ userId: req.session.userId, at: new Date().toISOString() });
  }
  plan.updatedAt = new Date().toISOString();
  saveUpgradePlans(upgradePlans);
  await auditLogService?.append({
    actorId: req.session.userId,
    action: 'upgrade-plan:approve',
    resource: plan.id,
    meta: { correlationId: req.correlationId }
  });
  res.json({ ok: true, approvals: plan.approvals });
});

app.post(['/v1/devops/upgrade-plans/:id/execute'], requirePermission('devops:write'), async (req, res) => {
  const plan = upgradePlans.find((p) => p.id === req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'plan_not_found' });
    return;
  }
  if (plan.steps.length > env.EXECUTION_MAX_ACTIONS) {
    res.status(400).json({ error: 'too_many_actions', max: env.EXECUTION_MAX_ACTIONS });
    return;
  }
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const approved = req.header('x-execution-approve') === 'yes';
  const token = req.header('x-execution-token');
  const tokenOk = env.EXECUTION_APPROVAL_TOKEN ? token === env.EXECUTION_APPROVAL_TOKEN : true;
  if (!dryRun && (!approved || !tokenOk)) {
    res.status(400).json({ error: 'approval required: set x-execution-approve: yes and valid x-execution-token or dryRun=1' });
    return;
  }
  if (!dryRun && new Set(plan.approvals.map((a) => a.userId)).size < 2) {
    res.status(400).json({ error: 'dual_approval_required' });
    return;
  }
  if (!dryRun) {
    if (!plan.lastDryRunAt) {
      res.status(400).json({ error: 'dry_run_required' });
      return;
    }
    const last = new Date(plan.lastDryRunAt).getTime();
    if (Date.now() - last > env.EXECUTION_DRY_RUN_TTL_MS) {
      res.status(400).json({ error: 'dry_run_expired' });
      return;
    }
  }
  for (const step of plan.steps) {
    try {
      assertAllowedAction(step.action);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message, step: step.id });
      return;
    }
    step.status = dryRun ? 'pending' : 'in_progress';
    saveUpgradePlans(upgradePlans);
    try {
      const txHash = dryRun ? undefined : await executeUpgradeAction(step.action);
      step.notes = `${dryRun ? 'dry-run at' : 'completed at'} ${new Date().toISOString()}${txHash ? ` tx=${txHash}` : ''}`;
    } catch (e) {
      if (!dryRun) {
        step.status = 'pending';
        saveUpgradePlans(upgradePlans);
      }
      res.status(500).json({ error: (e as Error).message, step: step.id, dryRun });
      return;
    }
    if (!dryRun) {
      step.status = 'done';
      saveUpgradePlans(upgradePlans);
    }
  }
  plan.updatedAt = new Date().toISOString();
  if (dryRun) {
    plan.lastDryRunAt = new Date().toISOString();
  }
  saveUpgradePlans(upgradePlans);
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'upgrade-plan:execute',
    resource: plan.id,
    meta: { correlationId: req.correlationId, dryRun }
  });
  res.json({ ok: true, plan });
});

app.post(['/v1/devops/rollback/:id'], requirePermission('devops:write'), async (req, res) => {
  const plan = upgradePlans.find((p) => p.id === req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'plan_not_found' });
    return;
  }
  const rollbackPlan: UpgradePlan = {
    id: `rollback-${Date.now()}`,
    name: `Rollback of ${plan.name}`,
    rollbackOf: plan.id,
    steps: [...plan.steps].reverse().map((s) => ({
      id: `${Math.random().toString(36).slice(2)}`,
      name: `Rollback ${s.name}`,
      status: 'pending'
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvals: []
  };
  upgradePlans.push(rollbackPlan);
  saveUpgradePlans(upgradePlans);
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'upgrade-plan:rollback',
    resource: rollbackPlan.id,
    meta: { correlationId: req.correlationId, rollbackOf: plan.id }
  });
  res.status(201).json({ ok: true, plan: rollbackPlan });
});

app.post(['/v1/devops/rollback/:id/execute'], requirePermission('devops:write'), async (req, res) => {
  const plan = upgradePlans.find((p) => p.id === req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'plan_not_found' });
    return;
  }
  if (plan.steps.length > env.EXECUTION_MAX_ACTIONS) {
    res.status(400).json({ error: 'too_many_actions', max: env.EXECUTION_MAX_ACTIONS });
    return;
  }
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const approved = req.header('x-execution-approve') === 'yes';
  const token = req.header('x-execution-token');
  const tokenOk = env.EXECUTION_APPROVAL_TOKEN ? token === env.EXECUTION_APPROVAL_TOKEN : true;
  if (!dryRun && (!approved || !tokenOk)) {
    res.status(400).json({ error: 'approval required: set x-execution-approve: yes and valid x-execution-token or dryRun=1' });
    return;
  }
  if (!dryRun && new Set(plan.approvals.map((a) => a.userId)).size < 2) {
    res.status(400).json({ error: 'dual_approval_required' });
    return;
  }
  for (const step of plan.steps) {
    try {
      assertAllowedAction(step.action);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message, step: step.id });
      return;
    }
    step.status = dryRun ? 'pending' : 'in_progress';
    saveUpgradePlans(upgradePlans);
    try {
      const txHash = dryRun ? undefined : await executeUpgradeAction(step.action);
      step.notes = `${dryRun ? 'dry-run at' : 'completed at'} ${new Date().toISOString()}${txHash ? ` tx=${txHash}` : ''}`;
    } catch (e) {
      if (!dryRun) {
        step.status = 'pending';
        saveUpgradePlans(upgradePlans);
      }
      res.status(500).json({ error: (e as Error).message, step: step.id, dryRun });
      return;
    }
    if (!dryRun) {
      step.status = 'done';
      saveUpgradePlans(upgradePlans);
    }
  }
  plan.updatedAt = new Date().toISOString();
  saveUpgradePlans(upgradePlans);
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'upgrade-plan:rollback:execute',
    resource: plan.id,
    meta: { correlationId: req.correlationId }
  });
  res.json({ ok: true, plan });
});

app.get(['/v1/api/token', '/api/token'], requirePermission('treasury:read'), async (_req, res) => {
  const supply = await proxyJson<{ supply?: string; emissions?: string }>(`${servicesBase.supply}/supply`, { supply: '0', emissions: '0' });
  const treasury = await proxyJson<{ balance?: string }>(`${servicesBase.treasury}/treasury`, { balance: '0' });
  const feeModel = await proxyJson<{ mode?: string; baseFee?: string; targetGas?: string }>(
    `${servicesBase.feeModel}/model`,
    { mode: env.GAS_PRICE_MODEL || 'auto', baseFee: undefined, targetGas: undefined }
  ).catch(() => ({ mode: env.GAS_PRICE_MODEL || 'auto' }));
  res.json({
    ok: true,
    networks: [
      {
        id: 'l2',
        supply: supply.supply || '0',
        emissions: supply.emissions || '0',
        multisig: treasury.balance || '0'
      }
    ],
    feeModel
  });
});

app.post(['/v1/api/treasury/approve', '/api/treasury/approve'], requirePermission('treasury:write'), async (req, res) => {
  const { proposalId, signer } = req.body || {};
  if (!proposalId || !signer) {
    res.status(400).json({ error: 'proposalId and signer required' });
    return;
  }
  const requiredSigners =
    (env.TREASURY_MULTISIG_SIGNERS && env.TREASURY_MULTISIG_SIGNERS.split(',').map((s) => s.trim()).filter(Boolean)) || [];
  const threshold = env.TREASURY_MULTISIG_THRESHOLD;
  let proposal = treasuryProposals.find((p) => p.id === proposalId);
  if (!proposal) {
    proposal = {
      id: proposalId,
      action: 'unknown',
      payload: {},
      approvals: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    treasuryProposals.push(proposal);
  }
  if (requiredSigners.length && !requiredSigners.includes(signer)) {
    res.status(403).json({ error: 'unauthorized_signer' });
    return;
  }
  if (!proposal.approvals.includes(signer)) {
    proposal.approvals.push(signer);
  }
  if (proposal.approvals.length >= threshold) {
    proposal.status = 'ready';
  }
  proposal.updatedAt = new Date().toISOString();
  saveTreasuryProposals(treasuryProposals);
  const approval = {
    proposalId,
    signer,
    at: new Date().toISOString(),
    threshold,
    totalSigners: requiredSigners.length,
    requiredSigners,
    approvals: proposal.approvals,
    status: proposal.status
  };
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'treasury:approve',
    resource: proposalId,
    meta: { correlationId: req.correlationId, signer, status: proposal.status }
  });
  res.json({ ok: true, approval });
});

app.get(['/v1/api/treasury/proposals', '/api/treasury/proposals'], requirePermission('treasury:read'), async (_req, res) => {
  res.json({ ok: true, proposals: treasuryProposals });
});

app.get(['/v1/devops/releases', '/devops/releases'], requirePermission('devops:read'), async (_req, res) => {
  const data = await proxyJson<{ releases?: unknown[] }>(`${servicesBase.devops}/releases`, { releases: [] });
  res.json(data.releases || []);
});

app.get(['/v1/devops/forks', '/devops/forks'], requirePermission('devops:read'), async (_req, res) => {
  const data = await proxyJson<{ forks?: unknown[] }>(`${servicesBase.devops}/forks`, { forks: [] });
  res.json(data.forks || []);
});

app.get(['/v1/devops/upgrades', '/devops/upgrades'], requirePermission('devops:read'), async (_req, res) => {
  const data = await proxyJson<{ upgrades?: unknown[] }>(`${servicesBase.devops}/upgrades`, { upgrades: [] });
  res.json(data.upgrades || []);
});

app.get(['/v1/governance/proposals', '/governance/proposals'], requirePermission('governance:read'), async (_req, res) => {
  const data = await proxyJson<{ proposals?: unknown[] }>(`${servicesBase.governance}/proposals`, { proposals: [] });
  res.json(data.proposals || []);
});

app.get(['/v1/governance/votes', '/governance/votes'], requirePermission('governance:read'), async (_req, res) => {
  const data = await proxyJson<{ votes?: unknown[] }>(`${servicesBase.governance}/votes`, { votes: [] });
  res.json(data.votes || []);
});

app.get(['/v1/governance/queue', '/governance/queue'], requirePermission('governance:read'), async (_req, res) => {
  const data = await proxyJson<{ queue?: unknown[] }>(`${servicesBase.governance}/queue`, { queue: [] });
  res.json(data.queue || []);
});

app.get(['/v1/governance/delegations', '/governance/delegations'], requirePermission('governance:read'), async (_req, res) => {
  const data = await proxyJson<{ delegations?: unknown[] }>(`${servicesBase.governance}/delegations`, { delegations: [] });
  res.json(data.delegations || []);
});

app.get(['/v1/governance/snapshot', '/governance/snapshot'], requirePermission('governance:read'), async (_req, res) => {
  const space = env.SNAPSHOT_SPACE || 'ghostldao.eth';
  const api = env.SNAPSHOT_API_URL || 'https://hub.snapshot.org/graphql';
  let proposals: { id: string; title: string; status: string; link: string }[] = [];
  try {
    const body = {
      query: `
        query Proposals($space: String!) {
          proposals(first: 5, where: { space_in: [$space] }, orderBy: "created", orderDirection: desc) {
            id
            title
            state
          }
        }
      `,
      variables: { space }
    };
    const resSnap = await fetch(api, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = (await resSnap.json().catch(() => ({}))) as { data?: { proposals?: { id: string; title: string; state: string }[] } };
    proposals =
      json?.data?.proposals?.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.state,
        link: `https://snapshot.org/#/${space}/proposal/${p.id}`
      })) || [];
  } catch {
    proposals = [];
  }
  if (!proposals.length) {
    proposals = [{ id: 'snap-placeholder', title: 'No snapshot proposals found', status: 'none', link: `https://snapshot.org/#/${space}` }];
  }
  res.json({ space, api, proposals });
});

app.get(['/v1/governance/forum', '/governance/forum'], requirePermission('governance:read'), async (_req, res) => {
  const forum = env.FORUM_URL || 'https://forum.example.org';
  let threads: { id: string; title: string; url: string; replies: number }[] = [];
  try {
    const latest = await fetch(`${forum.replace(/\/$/, '')}/latest.json`);
    const json = (await latest.json().catch(() => ({}))) as { topic_list?: { topics?: { id: number; title: string; slug: string; reply_count?: number }[] } };
    threads =
      json?.topic_list?.topics?.slice(0, 5).map((t) => ({
        id: String(t.id),
        title: t.title,
        url: `${forum}/t/${t.slug}/${t.id}`,
        replies: t.reply_count || 0
      })) || [];
  } catch {
    threads = [];
  }
  if (!threads.length) {
    threads = [
      { id: 'thr-1', title: 'Upgrade discussion', url: `${forum}/t/upgrade-discussion`, replies: 3 },
      { id: 'thr-2', title: 'Validator incentives', url: `${forum}/t/validator-incentives`, replies: 1 }
    ];
  }
  res.json({ forum, threads });
});

app.get(['/v1/compliance/reports', '/compliance/reports'], requirePermission('iam:read'), async (_req, res) => {
  res.json({ ok: true, reports: complianceReports });
});

app.get(['/v1/compliance/reports/:id', '/compliance/reports/:id'], requirePermission('iam:read'), async (req, res) => {
  const report = complianceReports.find((r) => r.id === req.params.id);
  if (!report) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ ok: true, report });
});

app.post(['/v1/compliance/reports', '/compliance/reports'], requirePermission('iam:write'), async (req, res) => {
  const { period } = req.body || {};
  const report: ComplianceDetail = {
    id: `rep-${Date.now()}`,
    period: period || 'unspecified',
    status: 'draft',
    generatedAt: new Date().toISOString(),
    controls: ['authz', 'keys', 'backups', 'logging', 'network'],
    findings: [
      { id: 'f1', area: 'authz', severity: 'medium', detail: 'Dual approvals enforced for upgrades and treasury.' },
      { id: 'f2', area: 'logging', severity: 'low', detail: 'Alerts signed; audit log export available.' }
    ]
  };
  complianceReports.push(report);
  saveCompliance(complianceReports);
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'compliance:report',
    resource: report.id,
    meta: { correlationId: req.correlationId }
  });
  res.status(201).json({ ok: true, report });
});

app.get(['/v1/compliance/reports/:id/export', '/compliance/reports/:id/export'], requirePermission('iam:read'), async (req, res) => {
  const report = complianceReports.find((r) => r.id === req.params.id);
  if (!report) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const format = (req.query.format as string) || 'json';
  const rows = [
    ['id', 'period', 'status', 'generatedAt', 'area', 'severity', 'detail'].join(','),
    ...report.findings.map((f) =>
      [report.id, report.period, report.status, report.generatedAt, f.area, f.severity, `"${f.detail}"`].join(',')
    )
  ];
  report.exportedAt = new Date().toISOString();
  saveCompliance(complianceReports);
  if (format === 'csv') {
    res.setHeader('content-type', 'text/csv');
    res.send(rows.join('\n'));
    return;
  }
  res.json({ ok: true, report });
});

const validatorGuard = env.PUBLIC_VALIDATORS ? allowAll : requirePermission('validator:read');
const explorerGuard = env.PUBLIC_EXPLORER ? allowAll : requirePermission('explorer:read');
const integrationsReadGuard = requirePermission('integrations:read');
const integrationsWriteGuard = requirePermission('integrations:write');

const ghostValidatorFallback = async () => {
  const items: Array<{ id: string; address: string; status: string; stake: string; commission: number; power: number }> = [];
  for (const chain of ghostchainConfig) {
    try {
      const provider = new JsonRpcProvider(chain.rpc);
      const block = await provider.getBlockNumber();
      items.push({
        id: `${chain.id}-validator`,
        address: `ghost-${chain.id}`,
        status: 'active',
        stake: 'N/A',
        commission: 0,
        power: block
      });
    } catch {
      items.push({
        id: `${chain.id}-validator`,
        address: `ghost-${chain.id}`,
        status: 'unknown',
        stake: 'N/A',
        commission: 0,
        power: 0
      });
    }
  }
  return items;
};

app.get(['/v1/api/validators', '/api/validators'], validatorGuard, async (_req, res) => {
  const fallback = { validators: await ghostValidatorFallback() };
  const data = await proxyJson<{ validators?: unknown[] }>(`${servicesBase.validators}/validators`, fallback);
  res.json(data);
});

app.post(['/v1/nodes/:id/restart', '/nodes/:id/restart'], requirePermission('devops:write'), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  try {
    const upstream = await fetch(`${servicesBase.devops}/nodes/${encodeURIComponent(id)}/restart`, { method: 'POST' });
    if (!upstream.ok) {
      const body = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json(body);
      return;
    }
  } catch {
    // fall through to stubbed response
  }
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'node:restart',
    resource: id,
    meta: { correlationId: req.correlationId }
  });
  res.json({ ok: true, id, action: 'restart' });
});

app.post(['/v1/nodes/:id/upgrade', '/nodes/:id/upgrade'], requirePermission('devops:write'), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const version = typeof req.body?.version === 'string' ? req.body.version : undefined;
  try {
    const upstream = await fetch(`${servicesBase.devops}/nodes/${encodeURIComponent(id)}/upgrade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version })
    });
    if (!upstream.ok) {
      const body = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json(body);
      return;
    }
  } catch {
    // fall through to stubbed response
  }
  await auditLogService?.append({
    actorId: req.session.userId || 'unknown',
    action: 'node:upgrade',
    resource: id,
    meta: { correlationId: req.correlationId, version }
  });
  res.json({ ok: true, id, action: 'upgrade', version: version || 'unspecified' });
});

app.get(['/v1/api/validators/metrics', '/api/validators/metrics'], validatorGuard, async (_req, res) => {
  const queryNumber = async (query?: string, fallback?: number) => {
    if (!query) return fallback;
    try {
      const result = await prometheus.query(query);
      const val = result?.[0]?.value?.[1];
      const parsed = val ? Number(val) : NaN;
      return Number.isFinite(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  };
  const queryString = async (query?: string, fallback?: string) => {
    if (!query) return fallback;
    try {
      const result = await prometheus.query(query);
      if (!result?.length) return fallback;
      const first = result[0];
      const fromMetric = first.metric?.proposer || first.metric?.validator || first.metric?.role;
      if (fromMetric) return fromMetric;
      const val = first?.value?.[1];
      return typeof val === 'string' ? val : fallback;
    } catch {
      return fallback;
    }
  };
  const missedBlocks =
    (await queryNumber(env.PROM_MISSED_BLOCKS_QUERY || 'op_gate_missed_blocks')) ??
    (await queryNumber('missed_blocks_total')) ??
    0;
  let finalityLag =
    (await queryNumber(env.PROM_FINALITY_LAG_QUERY || 'op_gate_finality_lag_blocks')) ??
    (await queryNumber('finality_lag_blocks'));
  if (finalityLag === undefined) {
    const head = await queryNumber(process.env.PROM_BLOCK_HEIGHT_QUERY || 'op_gate_head_block');
    const finalized = await queryNumber(process.env.PROM_FINALIZED_HEIGHT_QUERY || 'op_gate_finalized_block');
    if (head !== undefined && finalized !== undefined) finalityLag = head - finalized;
  }
  const participationRate =
    (await queryNumber(env.PROM_PARTICIPATION_QUERY || 'op_gate_participation_rate')) ??
    (await queryNumber('participation_rate')) ??
    0;
  const proposerQuery = env.PROM_PROPOSER_QUERY || 'op_gate_last_proposer';
  const lastProposer = (await queryString(proposerQuery)) || (await queryString('last_proposer')) || 'unknown';
  let proposerRotation: Array<{ proposer: string; at: string }> = [];
  let proposerSummary: Array<{ proposer: string; count: number }> = [];
  try {
    const end = Date.now();
    const start = end - 60 * 60 * 1000;
    const series = await prometheus.queryRange(proposerQuery, start, end, 300);
    const values = series.flatMap((s) => s.values || []);
    proposerRotation = values.map((v) => ({ proposer: v[1], at: new Date(Number(v[0]) * 1000).toISOString() })).slice(-40);
    const counts = new Map<string, number>();
    proposerRotation.forEach((p) => counts.set(p.proposer, (counts.get(p.proposer) || 0) + 1));
    proposerSummary = Array.from(counts.entries())
      .map(([proposer, count]) => ({ proposer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  } catch {
    proposerRotation = [];
    proposerSummary = [];
  }
  let bftAlerts: Array<{ message: string; severity: string; time: string }> = [];
  try {
    const alerts = await prometheus.alerts();
    bftAlerts =
      alerts
        ?.filter(
          (a) =>
            a.labels?.alertname?.toLowerCase().includes('bft') ||
            a.labels?.alertname?.toLowerCase().includes('equivocation') ||
            a.labels?.alertname?.toLowerCase().includes('double')
        )
        .map((a) => ({
          message: a.annotations?.summary || a.annotations?.description || a.labels?.alertname || 'consensus alert',
          severity: a.labels?.severity || 'info',
          time: a.activeAt || new Date().toISOString()
        })) || [];
  } catch {
    bftAlerts = [];
  }
  res.json({
    ok: true,
    metrics: {
      missedBlocks,
      finalityLag: finalityLag ?? 0,
      participationRate,
      lastProposer,
      proposerRotation,
      proposerSummary,
      bftAlerts
    }
  });
});

app.get(['/v1/security/controls', '/security/controls'], requirePermission('iam:read'), async (_req, res) => {
  const hardwareWalletRequired = Boolean(env.HARDWARE_WALLET_REQUIRED);
  let vaultHealthy = false;
  let hsmHealthy = false;
  if (env.VAULT_HEALTH_URL) {
    try {
      const resp = await fetch(env.VAULT_HEALTH_URL);
      vaultHealthy = resp.ok;
    } catch {
      vaultHealthy = false;
    }
  }
  if (env.GUARD_URL) {
    hsmHealthy = await fetchOk(`${env.GUARD_URL}/health`);
  }
  res.json({ vaultHealthy, vaultUrl: env.VAULT_HEALTH_URL, hsmHealthy, hardwareWalletRequired });
});


app.get(['/v1/observability/incidents', '/observability/incidents'], requirePermission('observability:read'), async (_req, res) => {
  const bridgeIncidents = await proxyJson<{ incidents?: BridgeIncident[] }>(`${servicesBase.bridge}/bridges/incidents`, { incidents: [] }).catch(
    () => ({
      incidents: []
    })
  );
  let validatorAlerts: Array<{ source: string; message: string; severity: string; time: string }> = [];
  try {
    const alerts = await prometheus.alerts();
    validatorAlerts =
      alerts
        ?.filter(
          (a) =>
            a.labels?.job?.includes('validator') ||
            a.labels?.alertname?.toLowerCase().includes('missed') ||
            a.labels?.alertname?.toLowerCase().includes('finality')
        )
        .map((a) => ({
          source: a.labels?.job || 'prometheus',
          message: a.annotations?.summary || a.annotations?.description || a.labels?.alertname || 'alert',
          severity: a.labels?.severity || 'info',
          time: a.activeAt || new Date().toISOString()
        })) || [];
  } catch {
    validatorAlerts = [];
  }
  res.json({
    ok: true,
    incidents: [
      ...((bridgeIncidents.incidents as BridgeIncident[]) || []).map((i) => ({ ...i, source: 'bridge' })),
      ...validatorAlerts
    ]
  });
});

app.get(['/v1/explorer/blocks', '/explorer/blocks'], explorerGuard, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const chain = typeof req.query.chain === 'string' ? req.query.chain : undefined;
  const rpcUrl = rpcForChain(chain);
  try {
    const latestHex = (await rpcCall<HexString>('eth_blockNumber', [], rpcUrl)) as HexString;
    const latest = parseInt(latestHex, 16);
    const blocks = await Promise.all(
      Array.from({ length: limit }, (_, i) => latest - i)
        .filter((n) => n >= 0)
        .map(async (num) => {
          const block = (await rpcCall<RpcBlock>('eth_getBlockByNumber', ['0x' + num.toString(16), true], rpcUrl)) as RpcBlock;
          return {
            number: parseInt(block.number, 16),
            hash: block.hash,
            proposer: block.miner,
            txCount: Array.isArray(block.transactions) ? block.transactions.length : 0,
            size: block.size ? parseInt(block.size, 16) : undefined,
            time: new Date(parseInt(block.timestamp, 16) * 1000).toISOString()
          };
        })
    );
    res.json({ blocks, chain: chain || 'l2' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message, blocks: [] });
  }
});

app.get(['/v1/explorer/mempool', '/explorer/mempool'], explorerGuard, async (req, res) => {
  const chain = typeof req.query.chain === 'string' ? req.query.chain : undefined;
  const rpcUrl = rpcForChain(chain);
  let pending = 0;
  let queued = 0;
  try {
    const status = (await rpcCall<Record<string, string>>('txpool_status', [], rpcUrl)) || {};
    pending = status.pending ? parseInt(status.pending, 16) || 0 : 0;
    queued = status.queued ? parseInt(status.queued, 16) || 0 : 0;
  } catch {
    // fall back to zeros
  }
  res.json({
    pending,
    queued,
    fairnessScore: Number((Math.max(0, 1 - pending / 1000)).toFixed(2)),
    mevRisk: pending > 500 ? 'elevated' : 'low'
  });
});

app.get(['/v1/explorer/txs', '/explorer/txs'], explorerGuard, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const chain = typeof req.query.chain === 'string' ? req.query.chain : undefined;
  const rpcUrl = rpcForChain(chain);
  try {
    const latestHex = (await rpcCall<HexString>('eth_blockNumber', [], rpcUrl)) as HexString;
    const latest = parseInt(latestHex, 16);
    const collected: ExplorerTx[] = [];
    const maxDepth = Math.max(limit * 10, 500);
    for (let num = latest; num >= 0 && collected.length < limit && latest - num <= maxDepth; num--) {
      const block = (await rpcCall<RpcBlock>('eth_getBlockByNumber', ['0x' + num.toString(16), true], rpcUrl)) as RpcBlock;
      const blockTime = new Date(parseInt(block.timestamp, 16) * 1000).toISOString();
      for (const t of block.transactions || []) {
        if (collected.length < limit) {
          let txObj: RpcTx | null = null;
          if (typeof t === 'string') {
            txObj = (await rpcCall<RpcTx>('eth_getTransactionByHash', [t], rpcUrl)) || null;
          } else {
            txObj = t as RpcTx;
          }
          if (!txObj) continue;
          collected.push({
            hash: txObj.hash,
            from: txObj.from,
            to: txObj.to,
            value: txObj.value,
            gas: txObj.gas,
            status: 'success',
            nonce: txObj.nonce,
            blockNumber: parseInt(block.number, 16).toString(),
            time: blockTime
          });
        }
      }
    }
    const txs = collected.slice(0, limit);
    res.json({ txs, chain: chain || 'l2' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message, txs: [] });
  }
});

app.get(['/v1/wallet/balance', '/wallet/balance'], async (req, res) => {
  const address = typeof req.query.address === 'string' ? req.query.address : '';
  if (!address) {
    res.status(400).json({ error: 'address required' });
    return;
  }
  try {
    const balanceHex = (await rpcCall('eth_getBalance', [address, 'latest'])) as HexString;
    res.json({ address, balance: balanceHex });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get(['/v1/integrations/definitions', '/integrations/definitions'], integrationsReadGuard, async (_req, res) => {
  const integrations = await integrationsStorePromise;
  res.json(integrations.listDefinitions());
});

app.get(['/v1/integrations/instances', '/integrations/instances'], integrationsReadGuard, async (_req, res) => {
  const integrations = await integrationsStorePromise;
  res.json(integrations.listInstances());
});

app.get(['/v1/integrations/instances/:id', '/integrations/instances/:id'], integrationsReadGuard, async (req, res) => {
  const integrations = await integrationsStorePromise;
  const instanceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const instance = integrations.getInstance(instanceId);
  if (!instance) {
    res.status(404).json({ error: 'instance_not_found' });
    return;
  }
  res.json(instance);
});

app.post(['/v1/integrations/instances', '/integrations/instances'], integrationsWriteGuard, async (req, res) => {
  const body = req.body || {};
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }
  try {
    const integrations = await integrationsStorePromise;
    const instance = await integrations.createInstance({
      definitionId: body.definitionId,
      environment: body.environment || 'dev',
      enabled: Boolean(body.enabled),
      config: body.config || {},
      policy: body.policy
    });
    await auditLogService?.append({
      actorId: req.session.userId || 'unknown',
      action: 'integration:create',
      resource: instance.id,
      meta: { definitionId: instance.definitionId, environment: instance.environment, enabled: instance.enabled }
    });
    await emitEvent({
      scope: 'integrations',
      type: 'integrations:create',
      actorId: req.session.userId,
      status: 'ok',
      payload: {
        instanceId: instance.id,
        definitionId: instance.definitionId,
        environment: instance.environment,
        enabled: instance.enabled
      }
    });
    res.status(201).json(instance);
  } catch (err) {
    await emitEvent({
      scope: 'integrations',
      type: 'integrations:create',
      actorId: req.session.userId,
      status: 'error',
      payload: { definitionId: body.definitionId, error: err instanceof Error ? err.message : 'create_failed' }
    });
    res.status(400).json({ error: err instanceof Error ? err.message : 'create_failed' });
  }
});

app.patch(['/v1/integrations/instances/:id', '/integrations/instances/:id'], integrationsWriteGuard, async (req, res) => {
  const body = req.body || {};
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }
  try {
    const integrations = await integrationsStorePromise;
    const instanceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const instance = await integrations.updateInstance(instanceId, {
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      environment: body.environment,
      policy: body.policy,
      config: body.config
    });
    const action = body.config ? 'integration:rotate' : 'integration:update';
    await auditLogService?.append({
      actorId: req.session.userId || 'unknown',
      action,
      resource: instance.id,
      meta: { definitionId: instance.definitionId, environment: instance.environment, enabled: instance.enabled }
    });
    await emitEvent({
      scope: 'integrations',
      type: body.config ? 'integrations:rotate' : 'integrations:update',
      actorId: req.session.userId,
      status: 'ok',
      payload: {
        instanceId: instance.id,
        definitionId: instance.definitionId,
        environment: instance.environment,
        enabled: instance.enabled
      }
    });
    res.json(instance);
  } catch (err) {
    await emitEvent({
      scope: 'integrations',
      type: body.config ? 'integrations:rotate' : 'integrations:update',
      actorId: req.session.userId,
      status: 'error',
      payload: { instanceId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, error: err instanceof Error ? err.message : 'update_failed' }
    });
    res.status(400).json({ error: err instanceof Error ? err.message : 'update_failed' });
  }
});

app.post(
  ['/v1/integrations/instances/:id/enable', '/integrations/instances/:id/enable'],
  integrationsWriteGuard,
  async (req, res) => {
    const body = req.body || {};
    try {
      const integrations = await integrationsStorePromise;
      const instanceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const instance = await integrations.updateInstance(instanceId, {
        enabled: typeof body.enabled === 'boolean' ? body.enabled : true
      });
      await auditLogService?.append({
        actorId: req.session.userId || 'unknown',
        action: instance.enabled ? 'integration:enable' : 'integration:disable',
        resource: instance.id,
        meta: { definitionId: instance.definitionId }
      });
      await emitEvent({
        scope: 'integrations',
        type: instance.enabled ? 'integrations:enable' : 'integrations:disable',
        actorId: req.session.userId,
        status: 'ok',
        payload: { instanceId: instance.id, definitionId: instance.definitionId, enabled: instance.enabled }
      });
      res.json(instance);
    } catch (err) {
      await emitEvent({
        scope: 'integrations',
        type: 'integrations:toggle',
        actorId: req.session.userId,
        status: 'error',
        payload: { instanceId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, error: err instanceof Error ? err.message : 'update_failed' }
      });
      res.status(400).json({ error: err instanceof Error ? err.message : 'update_failed' });
    }
  }
);

app.post(
  ['/v1/integrations/instances/:id/test', '/integrations/instances/:id/test'],
  integrationsWriteGuard,
  async (req, res) => {
    try {
      const integrations = await integrationsStorePromise;
      const instanceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await integrations.testInstance(instanceId);
      await auditLogService?.append({
        actorId: req.session.userId || 'unknown',
        action: 'integration:test',
        resource: instanceId,
        meta: { ok: result.ok }
      });
      await emitEvent({
        scope: 'integrations',
        type: 'integrations:test',
        actorId: req.session.userId,
        status: result.ok ? 'ok' : 'error',
        payload: { instanceId, ok: result.ok, latencyMs: result.latencyMs }
      });
      res.json(result);
    } catch (err) {
      await emitEvent({
        scope: 'integrations',
        type: 'integrations:test',
        actorId: req.session.userId,
        status: 'error',
        payload: { instanceId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, error: err instanceof Error ? err.message : 'test_failed' }
      });
      res.status(400).json({ error: err instanceof Error ? err.message : 'test_failed' });
    }
  }
);

app.get(['/v1/integrations/rpc', '/integrations/rpc'], async (_req, res) => {
  const endpoints = await getRpcEndpoints();
  res.json(endpoints);
});

app.post(['/v1/analytics/events', '/analytics/events'], requireAuth, async (req, res) => {
  const body = req.body || {};
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }
  const scope = typeof body.scope === 'string' ? body.scope : 'analytics';
  const type = typeof body.type === 'string' ? body.type : 'analytics:event';
  const payload = typeof body.payload === 'object' && body.payload ? body.payload : {};
  await emitEvent({
    scope: scope === 'ai' || scope === 'integrations' || scope === 'auth' || scope === 'webhook' ? scope : 'analytics',
    type,
    actorId: req.session.userId,
    status: 'ok',
    payload
  });
  res.status(202).json({ ok: true });
});

app.get(['/v1/analytics/events', '/analytics/events'], requireAdmin, async (req, res) => {
  const scope = typeof req.query.scope === 'string' ? req.query.scope : undefined;
  const limit = Number(req.query.limit || 20);
  const events = await getEvents({
    scope: scope === 'ai' || scope === 'integrations' || scope === 'auth' || scope === 'webhook' || scope === 'analytics' ? scope : undefined,
    limit
  });
  res.json({ events });
});

app.get(['/v1/webhooks/status', '/webhooks/status'], requireAdmin, async (_req, res) => {
  const summary = await getWebhookSummary();
  res.json(summary);
});

app.get(['/v1/webhooks/deliveries', '/webhooks/deliveries'], requireAdmin, async (req, res) => {
  const limit = Number(req.query.limit || 20);
  const deliveries = await getWebhookDeliveries(Number.isFinite(limit) ? limit : 20);
  res.json({ deliveries });
});

app.get(['/v1/swap/quote', '/swap/quote'], async (req, res) => {
  const tokenIn = typeof req.query.tokenIn === 'string' ? req.query.tokenIn : '';
  const tokenOut = typeof req.query.tokenOut === 'string' ? req.query.tokenOut : '';
  const amount = typeof req.query.amount === 'string' ? req.query.amount : '';
  if (!tokenIn || !tokenOut || !amount) {
    res.status(400).json({ error: 'tokenIn, tokenOut, amount required' });
    return;
  }
  const url = `${servicesBase.swap}/quote?tokenIn=${encodeURIComponent(tokenIn)}&tokenOut=${encodeURIComponent(
    tokenOut
  )}&amount=${encodeURIComponent(amount)}`;
  const data = await proxyJson<{ routes?: unknown[] }>(url, { routes: [] });
  res.json(data.routes ? data : { routes: [] });
});

app.post(['/v1/swap/execute', '/swap/execute'], async (req, res) => {
  const body = req.body || {};
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }
  try {
    const upstream = await fetch(`${servicesBase.swap}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json(err);
      return;
    }
    const data = await upstream.json().catch(() => ({}));
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message || 'swap_execute_failed' });
  }
});

app.get(['/v1/health', '/health'], async (_req, res) => {
  const [promOk, grafanaOk, guardOk, relayerOk, lokiOk, alertmanagerOk] = await Promise.all([
    fetchOk(`${prometheusUrl}/-/healthy`),
    fetchOk(`${grafanaUrl}/api/health`),
    fetchOk(`${guardUrl}/health`),
    fetchOk(`${relayerUrl}/health`),
    fetchOk(`${lokiUrl}/ready`),
    fetchOk(`${alertmanagerUrl}/api/v2/status`)
  ]);
  const status = promOk && grafanaOk && guardOk && relayerOk ? 'ok' : 'degraded';
  res.json({
    status,
    dependencies: {
      prometheus: { url: prometheusUrl, ok: promOk },
      grafana: { url: grafanaUrl, ok: grafanaOk },
      guard: { url: guardUrl, ok: guardOk },
      relayer: { url: relayerUrl, ok: relayerOk },
      loki: { url: lokiUrl, ok: lokiOk },
      alertmanager: { url: alertmanagerUrl, ok: alertmanagerOk }
    },
    upstream: servicesBase
  });
});

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      correlationId: req.correlationId,
      message: err.message,
      stack: err.stack
    })
  );
  res.status(500).json({ error: 'internal_error', message: err.message, correlationId: req.correlationId });
});

const port = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`API listening on :${port}`);
  });
}

export default app;
app.post(['/v1/webhooks/alerts', '/webhooks/alerts'], requireAdmin, async (req, res) => {
  if (!env.ALERT_WEBHOOK_SECRET) {
    await emitEvent({
      scope: 'webhook',
      type: 'webhook:delivery',
      actorId: req.session?.userId,
      status: 'error',
      payload: { error: 'webhook_secret_missing' }
    });
    res.status(503).json({ error: 'webhook verification not configured' });
    return;
  }
  const signature = req.header('x-signature-sha256');
  const ts = req.header('x-signature-ts');
  if (!signature || !ts) {
    await emitEvent({
      scope: 'webhook',
      type: 'webhook:delivery',
      actorId: req.session?.userId,
      status: 'error',
      payload: { error: 'missing_signature_headers' }
    });
    res.status(400).json({ error: 'missing signature headers' });
    return;
  }
  const body = JSON.stringify(req.body || {});
  const hmac = crypto.createHmac('sha256', env.ALERT_WEBHOOK_SECRET);
  hmac.update(`${ts}:${body}`);
  const expected = hmac.digest('hex');
  if (expected !== signature) {
    await emitEvent({
      scope: 'webhook',
      type: 'webhook:delivery',
      actorId: req.session?.userId,
      status: 'error',
      payload: { error: 'invalid_signature' }
    });
    res.status(401).json({ error: 'invalid signature' });
    return;
  }
  await emitEvent({
    scope: 'webhook',
    type: 'webhook:delivery',
    actorId: req.session?.userId,
    status: 'ok',
    payload: { delivered: true }
  });
  res.json({ ok: true });
});
