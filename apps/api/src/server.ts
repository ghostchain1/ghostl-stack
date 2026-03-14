import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import express, { type RequestHandler } from 'express';
import session from 'express-session';
import cors from 'cors';
import nodemailer from 'nodemailer';
import helmet from 'helmet';
import type {} from './types/session';
import WebSocket from 'ws';
import { Interface, JsonRpcProvider, Wallet } from 'ghost';
import { z } from 'zod';
import type { Transfer } from '@ghostl/types/bridge';
import type { WalletRecord } from '@ghostl/types';
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
import { GasEngineClient } from './clients/gas-engine';
import { createLiveServices } from './services/live';
import { createPersistentIdentityServices } from './services/auth-store';
import { LokiClient } from './clients/loki';
import { GuardClient } from './clients/guard';
import { AlertmanagerClient } from './clients/alertmanager';
import type { AlertmanagerAlert } from './clients/alertmanager';
import { buildStackRouter } from './modules/stack/router';
import { buildGasRouter } from './modules/gas/router';
import { buildWalletRouter } from './modules/wallet/router';
import { buildNftRouter } from './modules/nft/router';
import { env } from './config/env';
import { requirePermission } from './lib/rbac';
import type { NotificationChannel } from './modules/observability/services';
import { buildDevopsRouter } from './modules/devops/router';
import { realmAuthMiddleware, requireAuth } from './middleware/realm-auth';
import { assertRoutingLawMiddleware, assertChainIdMiddleware } from './middleware/routing-guard';
import { buildWalletAdminRouter } from './modules/wallet-admin/router';
import { createWalletService } from './services/wallet-store';
import { createGhostWalletService } from './services/ghostwallet';
import { createTokenService } from './services/token-store';
import { createNftStore } from './services/nft-store';
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
import {
  AiSummarySchema,
  BridgeSummarySchema,
  ChainOverviewSchema,
  ComplianceSummarySchema,
  ContractsResponseSchema,
  DevopsSummarySchema,
  ExplorerSummarySchema,
  GovernanceSummarySchema,
  IntegrationsSummarySchema,
  ObservabilitySummarySchema,
  TokenomicsSummarySchema,
  TreasurySummarySchema,
  ValidatorsResponseSchema,
  WalletsResponseSchema
} from '@ghostl/contract-schemas';
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
type MarketToken = {
  id: string;
  symbol: string;
  chainId: string;
  name?: string;
  priceUsd?: string;
  change24h?: string;
  marketCapUsd?: string;
  supply?: string;
  emissions?: string;
  treasuryHoldings?: string;
  updatedAt?: string;
};
type MarketRecommendation = {
  id: string;
  title: string;
  action: 'hold' | 'reduce' | 'increase';
  confidence: number;
  rationale: string[];
};

const parseCorsAllowlist = () => {
  const raw = env.CORS_ALLOW_ORIGINS || '';
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
};

const resolveRepoRoot = () => {
  let current = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(current, 'contracts'))) return current;
    const parent = path.resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
};

const repoRoot = resolveRepoRoot();
const contractsRoot = path.join(repoRoot, 'contracts');
const contractsDeploymentsDir = path.join(contractsRoot, 'deployments');
const contractsReportsDir = path.join(contractsRoot, 'reports');
const contractsDocsDir = path.join(repoRoot, 'docs', 'contracts');

const corsAllowlist = parseCorsAllowlist();
const isOriginAllowed = (origin?: string) => {
  if (!origin) return true;
  if (corsAllowlist.size) return corsAllowlist.has(origin);
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
};

const app = express();
const sessionStore = createSessionStore();

// SECURITY: Add security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'",'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  xFrameOptions: { action: 'deny' },
  xContentTypeOptions: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false
}));
// Permissions-Policy: restrict sensitive browser features (belt-and-suspenders
// for any proxied browser traffic hitting the API origin).
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});

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
// OIDC realm-aware JWT validation (non-blocking; populates req.session.realmClaim)
app.use(realmAuthMiddleware as unknown as RequestHandler);

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
  // SECURITY: for authenticated sessions, require an explicit CSRF token match.
  // sameOrigin is only accepted when no session token has been issued yet
  // (i.e. sub-requests that haven't yet exchanged a /api/auth/csrf token).
  if (csrfHeader && sessionToken && csrfHeader === sessionToken) {
    return next();
  }
  if (!sessionToken && sameOrigin(req)) return next();
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

// ── Global rate limiter — applied after request-id, before route handlers ────
// Keyed by IP so unauthenticated flood requests are capped before auth work.
{
  const _hits = new Map<string, { count: number; resetAt: number }>();
  app.use((req, res, next) => {
    const key = req.ip || 'anon';
    const now = Date.now();
    const windowMs = env.RATE_LIMIT_WINDOW_MS;
    const max = env.RATE_LIMIT_MAX_GLOBAL;
    const current = _hits.get(key);
    if (!current || current.resetAt <= now) {
      _hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > max) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    next();
  });
}

// ── Auth-path rate limiter — stricter window on login / token endpoints ──────
{
  const _authHits = new Map<string, { count: number; resetAt: number }>();
  const authLimiter: RequestHandler = (req, res, next) => {
    const key = req.ip || 'anon';
    const now = Date.now();
    const windowMs = env.RATE_LIMIT_WINDOW_MS;
    const max = env.RATE_LIMIT_MAX_AUTH;
    const current = _authHits.get(key);
    if (!current || current.resetAt <= now) {
      _authHits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > max) {
      res.status(429).json({ error: 'rate_limited', hint: 'Too many auth requests.' });
      return;
    }
    next();
  };
  app.use(['/auth', '/v1/auth', '/api/auth'], authLimiter);
}

const headerAuthPolicy: Array<{ prefix: string; realm: 'users' | 'employees' | 'admins'; rolesAny?: string[] }> = [
  { prefix: '/identity/user', realm: 'users' },
  { prefix: '/identity/employee', realm: 'employees' },
  { prefix: '/identity/admin', realm: 'admins' },
  { prefix: '/governance/execute', realm: 'admins', rolesAny: ['governance_admin'] },
  { prefix: '/governance', realm: 'admins' }
];

const policyForPath = (pathname: string) =>
  headerAuthPolicy.find((entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`));

app.use((req, res, next) => {
  const policy = policyForPath(req.path);
  if (!policy) {
    next();
    return;
  }
  const tokenRealm = String(req.header('x-ghost-realm') || '').trim();
  const tokenSubject = String(req.header('x-ghost-subject') || '').trim();
  const tokenRoles = String(req.header('x-ghost-roles') || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!tokenRealm || !tokenSubject) {
    res.status(401).json({ error: 'missing_identity_headers', correlationId: req.correlationId });
    return;
  }
  if (tokenRealm !== policy.realm) {
    res.status(403).json({ error: 'realm_mismatch', expectedRealm: policy.realm, correlationId: req.correlationId });
    return;
  }
  if (policy.rolesAny && policy.rolesAny.length > 0 && !policy.rolesAny.some((role) => tokenRoles.includes(role))) {
    res.status(403).json({ error: 'missing_required_role', correlationId: req.correlationId });
    return;
  }
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
const gasEngineUrl = env.GAS_ENGINE_URL;
const lokiUrl = env.LOKI_URL || 'http://localhost:3100';
const alertmanagerUrl = env.ALERTMANAGER_URL || 'http://localhost:9093';
const prometheus = new PrometheusClient(prometheusUrl);
const grafana = new GrafanaClient(grafanaUrl, env.GRAFANA_API_KEY);
const relayer = new RelayerClient(relayerUrl);
const gasEngine = gasEngineUrl ? new GasEngineClient(gasEngineUrl) : undefined;
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
const nftStorePromise = createNftStore();
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
  rpc?: { http?: string[]; ws?: string[] } | string;
  ws?: string;
  rpcUrls?: string[];
  wsUrls?: string[];
};

type RpcRegistryResponse = {
  registry?: { name?: string; version?: string; generatedAt?: string };
  chains?: RpcRegistryChain[];
};

type NormalizedRpcEndpoint = NonNullable<ReturnType<typeof normalizeRpcEndpoint>>;
type RpcCache = { expiresAt: number; endpoints: NormalizedRpcEndpoint[] };
let rpcEndpointCache: RpcCache | null = null;

const withTimeout = async <T>(promise: Promise<T>, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
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
    const rawChainId = await withTimeout(rpcProbe<string>(endpoint.url, 'ghost_chainId'), 1500);
    const chainId = rawChainId?.startsWith('0x') ? String(parseInt(rawChainId, 16)) : rawChainId;
    const syncing = await withTimeout(rpcProbe<boolean | { startingBlock?: string }>(endpoint.url, 'ghost_syncing'), 1500)
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
  // SECURITY: Use crypto.randomBytes for better randomness in cache TTL
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
  const layer = entry.chain?.layer;
  const normalizedLayer = layer === 'L1' || layer === 'L2' || layer === 'L3' ? layer : undefined;
  return {
    id,
    chainId: chainId ? String(chainId) : undefined,
    chainKey: entry.chain?.chainKey,
    chainName: entry.chain?.name || entry.name,
    layer: normalizedLayer,
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
    const rpcUrls: string[] = [];
    const wsUrls: string[] = [];
    const rpc = chain.rpc as { http?: string[]; ws?: string[] } | string | undefined;
    if (typeof rpc === 'string' && rpc) rpcUrls.push(rpc);
    if (typeof chain.ws === 'string' && chain.ws) wsUrls.push(chain.ws);
    if (Array.isArray(chain.rpcUrls)) rpcUrls.push(...chain.rpcUrls);
    if (Array.isArray(chain.wsUrls)) wsUrls.push(...chain.wsUrls);
    if (rpc && typeof rpc !== 'string') {
      if (Array.isArray(rpc.http)) rpcUrls.push(...rpc.http);
      if (Array.isArray(rpc.ws)) wsUrls.push(...rpc.ws);
    }
    Array.from(new Set(rpcUrls.filter(Boolean))).forEach((url) => {
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
    Array.from(new Set(wsUrls.filter(Boolean))).forEach((url) => {
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

const layerForChainId = (chainId?: string) => {
  if (!chainId) return undefined;
  if (chainId === (process.env.GHOSTCHAIN_L1_CHAIN_ID || '14000101')) return 'L1';
  if (chainId === (process.env.GHOSTL2_CHAIN_ID || env.CHAIN_ID || '901')) return 'L2';
  if (chainId === (process.env.GHOSTL3_CHAIN_ID || '903')) return 'L3';
  return undefined;
};

/** Accepted numeric chain IDs for the three GhostChain mainchains. */
const MAINCHAIN_ALLOWED_IDS = new Set(['14000101', '901', '903']);

/**
 * Returns true when a registry endpoint belongs to a GhostChain mainchain.
 * Endpoints whose chainId is absent, non-numeric, or not in the allowlist are
 * rejected so that a compromised or misconfigured registry cannot inject
 * foreign-chain RPCs into the pool.
 */
const isMainchainEndpoint = (endpoint: NormalizedRpcEndpoint): boolean => {
  const id = endpoint?.chainId;
  if (!id) return false;
  return MAINCHAIN_ALLOWED_IDS.has(String(id));
};

const getRpcEndpoints = async (): Promise<NormalizedRpcEndpoint[]> => {
  const now = Date.now();
  if (rpcEndpointCache && rpcEndpointCache.expiresAt > now) {
    return rpcEndpointCache.endpoints;
  }
  // SECURITY: Use crypto-secure randomness instead of Math.random()
  const randomBytes = crypto.randomBytes(4);
  const randomValue = randomBytes.readUInt32BE(0) / 0xFFFFFFFF;
  const ttl = 5 * 60 * 1000 + Math.floor(randomValue * 10 * 60 * 1000);
  let endpoints: NormalizedRpcEndpoint[] = [];
  try {
    const registry = (await withTimeout(fetchRegistryEndpoints(), 5000)) as {
      endpoints: NormalizedRpcEndpoint[];
      chainIds: string[];
    };
    endpoints = registry.endpoints;
  } catch {
    endpoints = [];
  }
  // MAINCHAIN ENFORCEMENT: discard any registry entry whose chainId is not one
  // of the three canonical GhostChain mainchains (14000101 / 901 / 903).
  endpoints = endpoints.filter(isMainchainEndpoint);
  endpoints = endpoints.filter(Boolean).map((endpoint) => ({
    ...endpoint,
    layer: endpoint?.layer || layerForChainId(endpoint?.chainId)
  }));

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
  l3Revenue: env.L3_FEE_COLLECTOR_URL,
  l2Revenue: env.L2_REVENUE_AGGREGATOR_URL,
  treasuryEngine: env.TREASURY_ENGINE_URL,
  rewardDistributor: env.REWARD_DISTRIBUTOR_URL,
  hyperGovernor: env.HYPER_GHOST_GOVERNOR_URL,
  governance: env.GOVERNANCE_SERVICE_URL,
  validators: env.VALIDATOR_SERVICE_URL,
  devops: env.DEVOPS_SERVICE_URL,
  rpc: env.RPC_REGISTRY_URL,
  usage: env.USAGE_SERVICE_URL,
  webhooks: env.WEBHOOKS_SERVICE_URL,
  ai: env.AI_SERVICE_URL,
  forecasting: env.FORECASTING_SERVICE_URL,
  explainability: env.EXPLAINABILITY_SERVICE_URL,
  swap: env.SWAP_SERVICE_URL
};
const ghostchainConfig = [
  { id: 'l1' as const, label: 'GhostChain L1' },
  { id: 'l2' as const, label: 'GhostL2' },
  { id: 'l3' as const, label: 'GhostL3' }
];
const contractMetadata = {
  upgradeabilityQuery: env.CONTRACT_UPGRADEABILITY_QUERY || 'op_contract_upgradeability',
  pauseQuery: env.CONTRACT_PAUSE_QUERY || 'op_contract_paused'
};
const CONTRACT_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const BYTES32_REGEX = /^0x[a-fA-F0-9]{64}$/;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const resolveRepoPath = (target: string) => (path.isAbsolute(target) ? target : path.join(repoRoot, target));
const sha256Hex = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');
const safeReadJsonFile = <T>(filePath: string): T | null => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const readMainnetReadiness = async () => {
  const constitutionPath = resolveRepoPath(env.CONSTITUTION_DOC_PATH);
  const manifestPath = resolveRepoPath(env.RELEASE_MANIFEST_PATH);
  const signaturePath = resolveRepoPath(env.RELEASE_ATTESTATION_PATH);
  const publicKeyPath = resolveRepoPath(env.RELEASE_ATTESTATION_PUBLIC_KEY_PATH);
  const approvalPath = path.join(repoRoot, 'governance', 'proposals', env.GOVERNANCE_PROPOSAL_ID, 'approval.json');

  const constitutionExists = fs.existsSync(constitutionPath);
  const manifestExists = fs.existsSync(manifestPath);
  const signatureExists = fs.existsSync(signaturePath);
  const publicKeyExists = fs.existsSync(publicKeyPath);
  const approval = safeReadJsonFile<Record<string, unknown>>(approvalPath);
  const now = Date.now();

  const constitutionHash = constitutionExists ? `sha256:${sha256Hex(fs.readFileSync(constitutionPath))}` : null;
  const manifestHash = manifestExists ? `sha256:${sha256Hex(fs.readFileSync(manifestPath))}` : null;

  let attestationVerified = false;
  if (manifestExists && signatureExists && publicKeyExists) {
    try {
      const manifestBody = fs.readFileSync(manifestPath);
      const signatureBody = fs.readFileSync(signaturePath);
      const publicKeyBody = fs.readFileSync(publicKeyPath, 'utf8');
      const verifier = crypto.createVerify('sha256');
      verifier.update(manifestBody);
      verifier.end();
      attestationVerified = verifier.verify(publicKeyBody, signatureBody);
    } catch {
      attestationVerified = false;
    }
  }

  let releaseGateAllowed = false;
  let releaseGateError: string | null = null;
  const releaseGateAddress = env.MAINNET_RELEASE_GATE_ADDRESS || '';
  if (releaseGateAddress && CONTRACT_ADDRESS_REGEX.test(releaseGateAddress)) {
    try {
      const provider = new JsonRpcProvider(process.env.RPC_L1 || 'http://localhost:18545');
      const iface = new Interface(['function isMainnetLaunchAllowed() view returns (bool)']);
      const callData = iface.encodeFunctionData('isMainnetLaunchAllowed', []);
      const raw = await provider.call({ to: releaseGateAddress, data: callData });
      const decoded = iface.decodeFunctionResult('isMainnetLaunchAllowed', raw);
      releaseGateAllowed = Boolean(decoded?.[0]);
    } catch (error) {
      releaseGateError = error instanceof Error ? error.message : 'release_gate_call_failed';
    }
  } else if (releaseGateAddress) {
    releaseGateError = 'invalid_release_gate_address';
  }

  const timelockExpiresAt = typeof approval?.timelockExpiresAt === 'string' ? approval.timelockExpiresAt : null;
  const timelockExpired = timelockExpiresAt ? Date.parse(timelockExpiresAt) <= now : false;

  return {
    ok: true,
    constitution: {
      path: constitutionPath,
      exists: constitutionExists,
      hash: constitutionHash
    },
    governance: {
      proposalId: env.GOVERNANCE_PROPOSAL_ID,
      approvalPath,
      approvalExists: Boolean(approval),
      quorumReached: approval?.quorumReached === true,
      allowDeploy: approval?.allowDeploy === true,
      approvedAt: typeof approval?.approvedAt === 'string' ? approval.approvedAt : null,
      timelockExpiresAt,
      timelockExpired
    },
    releaseManifest: {
      path: manifestPath,
      exists: manifestExists,
      hash: manifestHash
    },
    attestation: {
      signaturePath,
      signatureExists,
      publicKeyPath,
      publicKeyExists,
      verified: attestationVerified
    },
    onchain: {
      rpcL1: process.env.RPC_L1 || 'http://localhost:18545',
      mainnetLaunchGateAddress: env.MAINNET_LAUNCH_GATE_ADDRESS || null,
      releaseGateAddress: env.MAINNET_RELEASE_GATE_ADDRESS || null,
      releaseGateAllowed,
      releaseGateError
    }
  };
};
const l1FinalityOracleReadInterface = new Interface([
  'function acceptedPolicyHash(bytes32) view returns (bool)',
  'event L1BlockFinalized(uint256 indexed blockNumber, bytes32 indexed blockHash, bytes32 indexed quorumCertHash, bytes32 aiPolicyHash, uint64 finalizedAt)'
]);
const L1_FINALIZED_EVENT_LOOKBACK_WINDOW = 10_000;
const L1_FINALIZED_EVENT_MAX_LOOKBACK = 500_000;
const L1_FINALIZED_POLICY_HASH_CACHE_MS = 15_000;
const l1FinalizedPolicyHashCache: {
  oracleAddress: string;
  expiresAt: number;
  value: { policyHash: string; l1BlockNumber: number } | null;
} = {
  oracleAddress: '',
  expiresAt: 0,
  value: null
};
const contractRegistrationSchema = z.object({
  name: z.string().min(1),
  address: z
    .string()
    .regex(CONTRACT_ADDRESS_REGEX, { message: 'invalid_address' })
    .refine((value) => value.toLowerCase() !== ZERO_ADDRESS, { message: 'zero_address' }),
  chainId: z.coerce.number().int().positive(),
  layer: z.enum(['l1', 'l2', 'l3']),
  abi: z.array(z.unknown()).min(1),
  abiHash: z.string().min(1),
  version: z.string().min(1),
  deployedAt: z.string().optional()
});

const logContractEvent = (level: 'info' | 'warn' | 'error', event: string, meta: Record<string, unknown>) => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...meta }));
};

type AbiResult =
  | { ok: true; abi: unknown[] }
  | { ok: false; error: 'abi_parse_failed' | 'abi_not_array' | 'abi_invalid' };

const resolveAbi = (value: unknown): AbiResult => {
  if (Array.isArray(value)) return { ok: true, abi: value };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return { ok: true, abi: parsed };
    } catch {
      return { ok: false, error: 'abi_parse_failed' };
    }
    return { ok: false, error: 'abi_not_array' };
  }
  if (value === undefined || value === null) return { ok: true, abi: [] };
  return { ok: false, error: 'abi_invalid' };
};

const normalizeContractEntry = (entry: Record<string, unknown>, index: number) => {
  const layerRaw = String(entry.layer || entry.chain || 'l2').toLowerCase();
  const layer = (layerRaw === 'l1' || layerRaw === 'l2' || layerRaw === 'l3' ? layerRaw : 'l2') as
    | 'l1'
    | 'l2'
    | 'l3';
  const abiResult = resolveAbi(entry.abi);
  if (!abiResult.ok) {
    return { ok: false as const, error: { index, reason: abiResult.error } };
  }
  const abi = abiResult.abi || [];
  const abiHash =
    typeof entry.abiHash === 'string' && entry.abiHash.trim().length > 0
      ? entry.abiHash.trim()
      : abi.length > 0
        ? crypto.createHash('sha256').update(JSON.stringify(abi)).digest('hex')
        : '';
  const normalized = {
    name: String(entry.name || entry.id || entry.address || '').trim(),
    address: String(entry.address || '').trim(),
    chainId: entry.chainId ?? entry.chain ?? 0,
    layer,
    abi,
    abiHash,
    version: String(entry.version || '0.0.1'),
    deployedAt: entry.deployedAt ? String(entry.deployedAt) : undefined
  };
  const parsed = contractRegistrationSchema.safeParse(normalized);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { index, reason: 'validation_failed', details: parsed.error.flatten().fieldErrors }
    };
  }
  return { ok: true as const, value: parsed.data };
};

const verifyContractsStored = (stored: Array<{ address: string; chainId: number }>, expected: Array<{ address: string; chainId: number }>) => {
  const storedSet = new Set(stored.map((entry) => `${entry.address.toLowerCase()}-${entry.chainId}`));
  const missing = expected.filter((entry) => !storedSet.has(`${entry.address.toLowerCase()}-${entry.chainId}`));
  return { ok: missing.length === 0, missing };
};

type ContractSeedSource = { envKey: string; name: string; layer: 'l1' | 'l2' | 'l3' };

const CANONICAL_GAS_TOKEN_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const CANONICAL_GAS_TOKEN_SYMBOL = 'GST';

const ensureCanonicalGasTokenAddress = (label: string, value?: string) => {
  if (value && value.toLowerCase() !== CANONICAL_GAS_TOKEN_ADDRESS.toLowerCase()) {
    throw new Error(`${label} must be ${CANONICAL_GAS_TOKEN_ADDRESS}`);
  }
  return CANONICAL_GAS_TOKEN_ADDRESS;
};

const ensureCanonicalGasTokenSymbol = (label: string, value?: string) => {
  if (value && value !== CANONICAL_GAS_TOKEN_SYMBOL) {
    throw new Error(`${label} must be ${CANONICAL_GAS_TOKEN_SYMBOL}`);
  }
  return CANONICAL_GAS_TOKEN_SYMBOL;
};

const CONTRACT_SEED_SOURCES: ContractSeedSource[] = [
  { envKey: 'BRIDGE_L2L3_ADDRESS', name: 'L2L3Bridge', layer: 'l2' },
  { envKey: 'BRIDGE_ADDRESS', name: 'L2L3Bridge', layer: 'l2' },
  { envKey: 'GUARD_POLICY_ADDRESS', name: 'GuardPolicy', layer: 'l2' },
  { envKey: 'L1_TOKEN_ADDRESS', name: 'ERC20', layer: 'l1' },
  { envKey: 'L2_TOKEN_ADDRESS', name: 'ERC20', layer: 'l2' },
  { envKey: 'L1_ROLLUP_L2_ADDRESS', name: 'OptimisticRollup', layer: 'l1' },
  { envKey: 'L2_ROLLUP_L3_ADDRESS', name: 'OptimisticRollup', layer: 'l2' },
  { envKey: 'L3_INBOX_ADDRESS', name: 'L3Inbox', layer: 'l3' },
  { envKey: 'L3_TOKEN_FACTORY_ADDRESS', name: 'L3BridgedTokenFactory', layer: 'l3' },
  { envKey: 'L3_TOKEN_ADDRESS', name: 'ERC20', layer: 'l3' }
];

const artifactPathCache = new Map<string, string | null>();

const parseEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return {};
  const output: Record<string, string> = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  });
  return output;
};

const collectSeedEnv = (...sources: Array<Record<string, string | undefined>>) => {
  const result: Record<string, string> = {};
  sources.forEach((source) => {
    Object.entries(source).forEach(([key, value]) => {
      if (typeof value === 'string' && value.length > 0) {
        result[key] = value;
      }
    });
  });
  return result;
};

const loadSeedEnv = () => {
  const stackEnvPath = path.join(repoRoot, 'services', 'stack.env');
  const webEnvPath = path.join(repoRoot, 'apps', 'web', '.env.local');
  const seedEnv = collectSeedEnv(parseEnvFile(stackEnvPath), parseEnvFile(webEnvPath), process.env);

  // Canonical gas token lock: any override must match the immutable L1 address/symbol.
  const canonicalAddress = ensureCanonicalGasTokenAddress(
    'CANONICAL_GAS_TOKEN_ADDRESS',
    seedEnv.CANONICAL_GAS_TOKEN_ADDRESS || seedEnv.GAS_TOKEN_ADDRESS
  );
  seedEnv.CANONICAL_GAS_TOKEN_ADDRESS = canonicalAddress;
  seedEnv.GAS_TOKEN_ADDRESS = ensureCanonicalGasTokenAddress('GAS_TOKEN_ADDRESS', seedEnv.GAS_TOKEN_ADDRESS);
  seedEnv.GAS_TOKEN_ADDRESS_L1 = ensureCanonicalGasTokenAddress('GAS_TOKEN_ADDRESS_L1', seedEnv.GAS_TOKEN_ADDRESS_L1);
  seedEnv.GAS_TOKEN_ADDRESS_L2 = ensureCanonicalGasTokenAddress('GAS_TOKEN_ADDRESS_L2', seedEnv.GAS_TOKEN_ADDRESS_L2);
  seedEnv.GAS_TOKEN_ADDRESS_L3 = ensureCanonicalGasTokenAddress('GAS_TOKEN_ADDRESS_L3', seedEnv.GAS_TOKEN_ADDRESS_L3);
  seedEnv.L1_TOKEN_ADDRESS = ensureCanonicalGasTokenAddress('L1_TOKEN_ADDRESS', seedEnv.L1_TOKEN_ADDRESS);
  seedEnv.L2_TOKEN_ADDRESS = ensureCanonicalGasTokenAddress('L2_TOKEN_ADDRESS', seedEnv.L2_TOKEN_ADDRESS);
  seedEnv.L3_TOKEN_ADDRESS = ensureCanonicalGasTokenAddress('L3_TOKEN_ADDRESS', seedEnv.L3_TOKEN_ADDRESS);
  seedEnv.GAS_TOKEN_L1 = ensureCanonicalGasTokenSymbol('GAS_TOKEN_L1', seedEnv.GAS_TOKEN_L1);
  seedEnv.GAS_TOKEN_L2 = ensureCanonicalGasTokenSymbol('GAS_TOKEN_L2', seedEnv.GAS_TOKEN_L2);
  seedEnv.GAS_TOKEN_L3 = ensureCanonicalGasTokenSymbol('GAS_TOKEN_L3', seedEnv.GAS_TOKEN_L3);

  return seedEnv;
};

const parseChainId = (value?: string) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = trimmed.startsWith('0x') ? Number.parseInt(trimmed, 16) : Number(trimmed);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
};

const resolveSeedChainId = (layer: 'l1' | 'l2' | 'l3', seedEnv: Record<string, string>) => {
  const candidates =
    layer === 'l1'
      ? [seedEnv.NEXT_PUBLIC_L1_CHAIN_ID, seedEnv.L1_CHAIN_ID, seedEnv.CHAIN_ID_L1]
      : layer === 'l2'
        ? [
            seedEnv.NEXT_PUBLIC_L2_CHAIN_ID,
            seedEnv.L2_CHAIN_ID,
            seedEnv.CHAIN_ID_L2,
            seedEnv.CHAIN_ID,
            env.CHAIN_ID
          ]
        : [seedEnv.NEXT_PUBLIC_L3_CHAIN_ID, seedEnv.L3_CHAIN_ID, seedEnv.CHAIN_ID_L3];
  for (const candidate of candidates) {
    const parsed = parseChainId(candidate);
    if (parsed) return parsed;
  }
  return null;
};

const findArtifactPath = (contractName: string) => {
  if (artifactPathCache.has(contractName)) return artifactPathCache.get(contractName) || null;
  const artifactsRoot = path.join(contractsRoot, 'artifacts', 'src');
  if (!fs.existsSync(artifactsRoot)) {
    artifactPathCache.set(contractName, null);
    return null;
  }
  const stack = [artifactsRoot];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === `${contractName}.json`) {
        artifactPathCache.set(contractName, fullPath);
        return fullPath;
      }
    }
  }
  artifactPathCache.set(contractName, null);
  return null;
};

const readArtifactAbi = (contractName: string) => {
  const artifactPath = findArtifactPath(contractName);
  if (!artifactPath) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as { abi?: unknown };
    if (Array.isArray(parsed.abi)) return parsed.abi as unknown[];
  } catch {
    return null;
  }
  return null;
};

const loadDeploymentContracts = () => {
  const entries: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];
  if (!fs.existsSync(contractsDeploymentsDir)) {
    return { entries, errors };
  }
  const networks = fs.readdirSync(contractsDeploymentsDir, { withFileTypes: true }) as fs.Dirent[];
  networks.forEach((entry) => {
    if (!entry.isDirectory()) return;
    const dir = path.join(contractsDeploymentsDir, entry.name);
    fs.readdirSync(dir).forEach((file) => {
      if (!file.endsWith('.json')) return;
      const layer = file.replace('.json', '');
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as {
          contracts?: Array<Record<string, unknown>>;
        };
        if (!Array.isArray(data.contracts)) return;
        data.contracts.forEach((contract) => {
          if (!contract.layer && (layer === 'l1' || layer === 'l2' || layer === 'l3')) {
            entries.push({ ...contract, layer });
          } else {
            entries.push(contract);
          }
        });
      } catch (err) {
        errors.push({
          source: file,
          error: err instanceof Error ? err.message : 'invalid_json'
        });
      }
    });
  });
  return { entries, errors };
};

const buildSeedContractsFromDeployments = () => {
  const { entries, errors } = loadDeploymentContracts();
  const normalized: Array<z.infer<typeof contractRegistrationSchema>> = [];
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    const result = normalizeContractEntry(entry, index);
    if (!result.ok) {
      errors.push(result.error);
      return;
    }
    const key = `${result.value.address.toLowerCase()}-${result.value.chainId}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(result.value);
  });
  return { contracts: normalized, errors };
};

const buildSeedContractsFromEnv = () => {
  const seedEnv = loadSeedEnv();
  const version = seedEnv.CONTRACTS_VERSION || '0.0.1';
  const contracts: Array<z.infer<typeof contractRegistrationSchema>> = [];
  const errors: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let index = 0;
  CONTRACT_SEED_SOURCES.forEach((source) => {
    const address = seedEnv[source.envKey];
    if (!address) return;
    const chainId = resolveSeedChainId(source.layer, seedEnv);
    if (!chainId) {
      errors.push({ envKey: source.envKey, reason: 'chain_id_missing' });
      return;
    }
    const abi = readArtifactAbi(source.name);
    if (!abi) {
      errors.push({ envKey: source.envKey, reason: 'abi_missing', contract: source.name });
      return;
    }
    const abiHash = crypto.createHash('sha256').update(JSON.stringify(abi)).digest('hex');
    const result = normalizeContractEntry(
      {
        name: source.name,
        address,
        chainId,
        layer: source.layer,
        abi,
        abiHash,
        version
      },
      index++
    );
    if (!result.ok) {
      errors.push(result.error);
      return;
    }
    const key = `${result.value.address.toLowerCase()}-${result.value.chainId}`;
    if (seen.has(key)) return;
    seen.add(key);
    contracts.push(result.value);
  });
  return { contracts, errors };
};

const seedContractsRegistry = () => {
  const fromDeployments = buildSeedContractsFromDeployments();
  const fromEnv = buildSeedContractsFromEnv();
  const contracts = [...fromDeployments.contracts, ...fromEnv.contracts];
  const errors = [...fromDeployments.errors, ...fromEnv.errors];
  if (!contracts.length) {
    return { ok: false as const, error: 'no_seed_contracts', errors };
  }
  const stored = registerContracts(contracts);
  return { ok: true as const, contracts, stored, errors };
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

const marketDataFile = env.MARKET_DATA_FILE || path.join(process.cwd(), 'data', 'market-data.json');
const loadMarketDefaults = (): MarketToken[] => {
  if (!env.MARKET_DEFAULT_TOKENS) return [];
  try {
    const parsed = JSON.parse(env.MARKET_DEFAULT_TOKENS) as MarketToken[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const normalizeMarketToken = (input: MarketToken): MarketToken => {
  const chainId = input.chainId || 'l2';
  const symbol = input.symbol || 'TOKEN';
  const id = `${chainId}:${symbol}`;
  const updatedAt = input.updatedAt || new Date().toISOString();
  return { ...input, chainId, symbol, id, updatedAt };
};
const parseNumber = (value?: string | number | null) => {
  if (value === null || value === undefined) return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
};
const buildMarketRecommendations = (inputs: {
  risk?: number;
  congestion?: number;
  treasuryBalance?: number;
  supply?: number;
  anomalies?: Array<{ id?: string; score?: number; reasons?: string[] }>;
}): MarketRecommendation[] => {
  const recs: MarketRecommendation[] = [];
  if (inputs.risk !== undefined) {
    if (inputs.risk >= 80) {
      recs.push({
        id: 'risk-reduce',
        title: 'Reduce exposure during elevated risk window',
        action: 'reduce',
        confidence: Math.min(0.95, inputs.risk / 100),
        rationale: ['Risk score above 80 from AI monitor', 'Historical outages correlate with elevated risk windows']
      });
    } else if (inputs.risk >= 60) {
      recs.push({
        id: 'risk-hold',
        title: 'Hold allocations while monitoring risk trend',
        action: 'hold',
        confidence: Math.min(0.9, inputs.risk / 100),
        rationale: ['Risk score trending higher', 'Keep liquidity available for incident response']
      });
    }
  }
  if (inputs.congestion !== undefined && inputs.congestion >= 80) {
    recs.push({
      id: 'congestion-gas-buffer',
      title: 'Increase gas buffer for operations',
      action: 'increase',
      confidence: Math.min(0.85, inputs.congestion / 100),
      rationale: ['Congestion score above 80', 'Higher fees expected during peaks']
    });
  }
  if (inputs.treasuryBalance !== undefined && inputs.supply !== undefined && inputs.supply > 0) {
    const ratio = inputs.treasuryBalance / inputs.supply;
    if (ratio < 0.01) {
      recs.push({
        id: 'treasury-buffer',
        title: 'Boost treasury reserves',
        action: 'increase',
        confidence: 0.75,
        rationale: ['Treasury reserves below 1% of supply', 'Low buffer reduces operational resilience']
      });
    }
  }
  if (!recs.length && inputs.anomalies && inputs.anomalies.length) {
    recs.push({
      id: 'anomaly-hold',
      title: 'Hold allocations pending anomaly review',
      action: 'hold',
      confidence: 0.6,
      rationale: ['Anomalies detected by AI monitor', 'Await root-cause classification']
    });
  }
  if (!recs.length) {
    recs.push({
      id: 'baseline-hold',
      title: 'Maintain current allocations',
      action: 'hold',
      confidence: 0.5,
      rationale: ['No elevated risk signals', 'Market data within expected ranges']
    });
  }
  return recs;
};
const loadMarketData = (): { tokens: MarketToken[] } => {
  try {
    const raw = fs.readFileSync(marketDataFile, 'utf-8');
    const parsed = JSON.parse(raw) as { tokens?: MarketToken[] };
    return { tokens: (parsed.tokens || []).map(normalizeMarketToken) };
  } catch {
    const defaults = loadMarketDefaults().map(normalizeMarketToken);
    ensureDir(marketDataFile);
    fs.writeFileSync(marketDataFile, JSON.stringify({ tokens: defaults }, null, 2));
    return { tokens: defaults };
  }
};
const saveMarketData = (data: { tokens: MarketToken[] }) => {
  ensureDir(marketDataFile);
  fs.writeFileSync(marketDataFile, JSON.stringify({ tokens: data.tokens.map(normalizeMarketToken) }, null, 2));
};
let marketData = loadMarketData();

const resolveContractProvider = () => {
  const layer = env.CONTRACT_CHAIN === 'l1' ? 'L1' : env.CONTRACT_CHAIN === 'l3' ? 'L3' : 'L2';
  const pool = ghostWalletRpcManager.getPoolSnapshot();
  const endpoints = pool[layer].filter((endpoint) => endpoint.protocol === 'http');
  if (!endpoints.length) {
    throw new Error('contract_rpc_unavailable');
  }
  const allowed = new Set(endpoints.map((endpoint) => endpoint.url));
  if (env.CONTRACT_RPC_URL && !allowed.has(env.CONTRACT_RPC_URL)) {
    throw new Error('contract_rpc_not_in_registry');
  }
  const order = { OK: 0, DEGRADED: 1, DOWN: 2 } as const;
  const preferred = [...endpoints].sort((a, b) => order[a.status] - order[b.status])[0];
  const rpcUrl = env.CONTRACT_RPC_URL || preferred.url;
  return new JsonRpcProvider(rpcUrl);
};

const tryResolveContractProvider = () => {
  try {
    return resolveContractProvider();
  } catch {
    return null;
  }
};

const readAcceptedPolicyHashOnL1 = async (oracleAddress: string, policyHash: string) =>
  ghostWalletRpcManager.withProvider('l1', async (provider) => {
    const data = l1FinalityOracleReadInterface.encodeFunctionData('acceptedPolicyHash', [policyHash]);
    const raw = await provider.call({ to: oracleAddress, data });
    const [accepted] = l1FinalityOracleReadInterface.decodeFunctionResult('acceptedPolicyHash', raw);
    return Boolean(accepted);
  });

const readLatestFinalizedPolicyHashOnL1 = async (oracleAddress: string) =>
  ghostWalletRpcManager.withProvider('l1', async (provider) => {
    const now = Date.now();
    if (
      l1FinalizedPolicyHashCache.oracleAddress === oracleAddress.toLowerCase() &&
      l1FinalizedPolicyHashCache.expiresAt > now
    ) {
      return l1FinalizedPolicyHashCache.value;
    }

    const latestBlock = await provider.getBlockNumber();
    const minBlock = Math.max(0, latestBlock - L1_FINALIZED_EVENT_MAX_LOOKBACK);
    const topics = l1FinalityOracleReadInterface.encodeFilterTopics('L1BlockFinalized', []);
    let toBlock = latestBlock;

    while (toBlock >= minBlock) {
      const fromBlock = Math.max(minBlock, toBlock - L1_FINALIZED_EVENT_LOOKBACK_WINDOW + 1);
      const logs = await provider.getLogs({
        address: oracleAddress,
        fromBlock,
        toBlock,
        topics
      });
      if (logs.length > 0) {
        const latest = logs[logs.length - 1];
        const parsed = l1FinalityOracleReadInterface.parseLog(latest);
        if (parsed) {
          const policyHash = String(parsed.args[3] || '');
          const blockNumberRaw = parsed.args[0];
          const l1BlockNumber =
            typeof blockNumberRaw === 'bigint' ? Number(blockNumberRaw) : Number(blockNumberRaw || latest.blockNumber);
          if (BYTES32_REGEX.test(policyHash) && Number.isFinite(l1BlockNumber)) {
            const value = { policyHash, l1BlockNumber };
            l1FinalizedPolicyHashCache.oracleAddress = oracleAddress.toLowerCase();
            l1FinalizedPolicyHashCache.expiresAt = now + L1_FINALIZED_POLICY_HASH_CACHE_MS;
            l1FinalizedPolicyHashCache.value = value;
            return value;
          }
        }
      }
      if (fromBlock <= minBlock) break;
      toBlock = fromBlock - 1;
    }

    l1FinalizedPolicyHashCache.oracleAddress = oracleAddress.toLowerCase();
    l1FinalizedPolicyHashCache.expiresAt = now + L1_FINALIZED_POLICY_HASH_CACHE_MS;
    l1FinalizedPolicyHashCache.value = null;
    return null;
  });

const sendRawTx = async (to: string, data: string) => {
  if (!env.CONTRACT_ADMIN_KEY) {
    throw new Error('contract admin key not configured');
  }
  const provider = resolveContractProvider();
  const wallet = new Wallet(env.CONTRACT_ADMIN_KEY, provider);
  const tx = await wallet.sendTransaction({ to, data });
  return tx.hash;
};

const sendContractTx = async (method: 'pause' | 'unpause', target = env.CONTRACT_TARGET_ADDRESS) => {
  if (!target) throw new Error('contract target not configured');
  const provider = tryResolveContractProvider();
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
      const provider = tryResolveContractProvider();
      if (provider) {
        try {
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
      const provider = tryResolveContractProvider();
      if (provider) {
        try {
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
      const provider = tryResolveContractProvider();
      if (provider) {
        try {
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

const ghostApiError = (res: express.Response, status: number, service: string, hint: string, error = 'SERVICE_UNAVAILABLE') => {
  res.status(status).json({ error, service, hint });
};

const ghostApiSend = <T>(
  res: express.Response,
  schema: z.ZodType<T>,
  payload: unknown,
  service = 'ghost-api'
) => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    ghostApiError(res, 502, service, parsed.error.message, 'INVALID_UPSTREAM');
    return;
  }
  res.json(parsed.data);
};

const ghostApiFetch = async (url: string, service: string) => {
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return {
        ok: false as const,
        status: upstream.status,
        error: { error: 'SERVICE_UNAVAILABLE', service, hint: `status_${upstream.status}` }
      };
    }
    const data = await upstream.json().catch(() => ({}));
    return { ok: true as const, data };
  } catch (err) {
    return {
      ok: false as const,
      status: 502,
      error: {
        error: 'SERVICE_UNAVAILABLE',
        service,
        hint: err instanceof Error ? err.message : 'fetch_failed'
      }
    };
  }
};

const createRateLimiter = (options: { windowMs: number; max: number }) => {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.session?.userId || req.ip || 'anonymous';
    const now = Date.now();
    const current = hits.get(key);
    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > options.max) {
      ghostApiError(res, 429, 'ghost-api', `limit_${options.max}_per_${options.windowMs}ms`, 'RATE_LIMITED');
      return;
    }
    next();
  };
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
app.use(
  ['/v1/gas', '/gas'],
  env.PUBLIC_STACK ? allowAll : requirePermission('chain:read'),
  buildGasRouter({ gasEngine })
);
ghostWalletServicePromise.then((ghostWalletService) => {
  app.use(['/v1/wallet', '/wallet'], assertChainIdMiddleware, buildWalletRouter(ghostWalletService));
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
  const nftStore = await nftStorePromise;
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
  app.use(['/v1/wallets', '/wallets'], assertChainIdMiddleware, buildWalletAdminRouter(walletService, ghostWalletService));
  app.use(['/v1', '/'], assertChainIdMiddleware, buildTokenRouter(tokenService, walletService));
  app.use(['/v1', '/'], assertChainIdMiddleware, buildNftRouter(nftStore, ghostWalletService, walletService));

  const sanitizeWallet = (wallet: WalletRecord) => {
    const {
      encryptedKey: _encryptedKey,
      encryptedMnemonic: _encryptedMnemonic,
      derivationPath: _derivationPath,
      keyType: _keyType,
      ...safe
    } = wallet;
    return safe;
  };

  const chainGuard = env.PUBLIC_CHAIN ? allowAll : requirePermission('chain:read');
  const explorerGuard = env.PUBLIC_EXPLORER ? allowAll : requirePermission('explorer:read');
  const ghostApiLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

  app.get(['/v1/chain', '/chain'], chainGuard, ghostApiLimiter, async (_req, res) => {
    const registryEndpoints = (await getRpcEndpoints().catch(
      () => [] as NormalizedRpcEndpoint[]
    )) as NormalizedRpcEndpoint[];
    const registryByLayer: Record<'L1' | 'L2' | 'L3', NormalizedRpcEndpoint[]> = {
      L1: [],
      L2: [],
      L3: []
    };
    registryEndpoints.forEach((endpoint) => {
      if (!endpoint) return;
      const layer = endpoint.layer;
      if (layer === 'L1' || layer === 'L2' || layer === 'L3') {
        registryByLayer[layer].push(endpoint);
      }
    });

    const pool = ghostWalletRpcManager.getPoolSnapshot();
    const order = { OK: 0, DEGRADED: 1, DOWN: 2 } as const;
    const chains = ([
      { id: 'l1', label: 'GhostChain L1', layer: 'L1' },
      { id: 'l2', label: 'GhostL2', layer: 'L2' },
      { id: 'l3', label: 'GhostL3', layer: 'L3' }
    ] as const).map(async (chain) => {
      const errors: string[] = [];
      const endpoints = (pool[chain.layer] || []).filter((endpoint) => endpoint.protocol === 'http');
      const preferred = [...endpoints].sort((a, b) => order[a.status] - order[b.status])[0];
      const registry = registryByLayer[chain.layer]?.[0];
      const info = registry
        ? {
            chainId: registry.chainId,
            name: registry.chainName,
            env: registry.network,
            consensus: registry.chainType
          }
        : undefined;
      if (!registry) errors.push('registry_metadata_missing');
      if (!preferred) {
        errors.push('rpc_unavailable');
      }
      let rpcSnapshot: { url?: string; chainId?: number; blockNumber?: number; gasPriceGwei?: number; peers?: number; status: 'ok' | 'error'; error?: string } =
        { url: preferred?.url, status: 'error' };
      if (preferred) {
        try {
          const provider = new JsonRpcProvider(preferred.url);
          const [chainIdHex, blockHex, gasHex, peerHex] = await Promise.all([
            provider.send('ghost_chainId', []),
            provider.send('ghost_blockNumber', []),
            provider.send('ghost_gasPrice', []),
            provider.send('net_peerCount', [])
          ]);
          const chainId = parseInt(chainIdHex as string, 16);
          const blockNumber = parseInt(blockHex as string, 16);
          const gasPrice = parseInt(gasHex as string, 16);
          const peers = parseInt(peerHex as string, 16);
          rpcSnapshot = {
            url: preferred.url,
            chainId: Number.isFinite(chainId) ? chainId : undefined,
            blockNumber: Number.isFinite(blockNumber) ? blockNumber : undefined,
            gasPriceGwei: Number.isFinite(gasPrice) ? Math.round((gasPrice / 1e9) * 100) / 100 : undefined,
            peers: Number.isFinite(peers) ? peers : undefined,
            status: 'ok'
          };
        } catch (err) {
          rpcSnapshot = {
            url: preferred.url,
            status: 'error',
            error: err instanceof Error ? err.message : 'rpc_call_failed'
          };
          errors.push('rpc_probe_failed');
        }
      }

      let telemetry;
      let peers;
      let blockTimeMs;
      let finalityLag;
      let reorgs;
      if (chain.id === 'l2') {
        try {
          const [participation, latency, health, peerList, topology, blockTime, lag, reorgEvents] = await Promise.all([
            liveServices.chain.consensusTelemetryService.getParticipationRate(),
            liveServices.chain.consensusTelemetryService.getLatencyMetrics(),
            liveServices.chain.consensusTelemetryService.getHealthSummary(),
            liveServices.chain.peerGraphService.listPeers(),
            liveServices.chain.peerGraphService.getTopology(),
            liveServices.chain.chainStatusService.getBlockTimeMs(),
            liveServices.chain.chainStatusService.getFinalityLag(),
            liveServices.chain.chainStatusService.getReorgEvents(5)
          ]);
          telemetry = { participation, latency, health };
          peers = { peers: peerList, topology };
          blockTimeMs = blockTime;
          finalityLag = lag;
          reorgs = reorgEvents;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : 'telemetry_failed');
        }
      } else {
        errors.push('telemetry_unavailable');
      }

      return {
        id: chain.id,
        label: chain.label,
        info,
        blockTimeMs,
        finalityLag,
        reorgs,
        telemetry,
        peers,
        rpc: rpcSnapshot,
        errors: errors.length ? errors : undefined
      };
    });

    const resolved = await Promise.all(chains);
    ghostApiSend(res, ChainOverviewSchema, { chains: resolved }, 'chain');
  });

  app.get(['/v1/wallet', '/wallet'], requirePermission('wallets:read'), ghostApiLimiter, async (_req, res) => {
    try {
      const wallets = await walletService.list();
      ghostApiSend(res, WalletsResponseSchema, { wallets: wallets.map((wallet) => sanitizeWallet(wallet)) }, 'wallets');
    } catch (err) {
      ghostApiError(res, 502, 'wallets', err instanceof Error ? err.message : 'wallets_list_failed');
    }
  });

  app.get(['/v1/validators', '/validators'], requirePermission('validator:read'), ghostApiLimiter, async (_req, res) => {
    if (!servicesBase.validators) {
      ghostApiError(res, 503, 'validator-service', 'missing');
      return;
    }
    const validatorsRes = await ghostApiFetch(`${servicesBase.validators}/validators`, 'validator-service');
    if (!validatorsRes.ok) {
      res.status(validatorsRes.status).json(validatorsRes.error);
      return;
    }
    const validators = Array.isArray((validatorsRes.data as { validators?: unknown }).validators)
      ? ((validatorsRes.data as { validators?: unknown[] }).validators as unknown[])
      : [];
    ghostApiSend(res, ValidatorsResponseSchema, { validators }, 'validator-service');
  });

  app.get(['/v1/bridge', '/bridge'], requirePermission('bridge:read'), ghostApiLimiter, async (_req, res) => {
    if (!servicesBase.bridge || !servicesBase.transfers || !servicesBase.liquidity) {
      ghostApiError(res, 503, 'bridge-service', 'missing');
      return;
    }
    const [bridgesRes, transfersRes, poolsRes, signaturesRes] = await Promise.all([
      ghostApiFetch(`${servicesBase.bridge}/bridges`, 'bridge-service'),
      ghostApiFetch(`${servicesBase.transfers}/transfers`, 'transfer-lifecycle-service'),
      ghostApiFetch(`${servicesBase.liquidity}/liquidity`, 'liquidity-service'),
      ghostApiFetch(`${servicesBase.bridge}/bridges/signatures`, 'bridge-service')
    ]);
    const error = [bridgesRes, transfersRes, poolsRes, signaturesRes].find((entry) => !entry.ok);
    if (error && !error.ok) {
      res.status(error.status).json(error.error);
      return;
    }
    const bridges = Array.isArray((bridgesRes.data as { bridges?: unknown }).bridges)
      ? ((bridgesRes.data as { bridges?: unknown[] }).bridges as unknown[])
      : [];
    const transfers = Array.isArray((transfersRes.data as { transfers?: unknown }).transfers)
      ? ((transfersRes.data as { transfers?: unknown[] }).transfers as unknown[])
      : [];
    const pools = Array.isArray((poolsRes.data as { pools?: unknown }).pools)
      ? ((poolsRes.data as { pools?: unknown[] }).pools as unknown[])
      : [];
    const signatures = Array.isArray((signaturesRes.data as { signatures?: unknown }).signatures)
      ? ((signaturesRes.data as { signatures?: unknown[] }).signatures as unknown[])
      : [];
    ghostApiSend(res, BridgeSummarySchema, { bridges, pools, transfers, signatures }, 'bridge-service');
  });

  app.get(['/v1/contracts', '/contracts'], requirePermission('contracts:read'), ghostApiLimiter, async (_req, res) => {
    const registryRes = servicesBase.contracts
      ? await ghostApiFetch(`${servicesBase.contracts}/contracts`, 'contract-registry-service')
      : { ok: false as const, status: 503, error: { error: 'SERVICE_UNAVAILABLE', service: 'contract-registry-service', hint: 'missing' } };
    if (!registryRes.ok) {
      res.status(registryRes.status).json(registryRes.error);
      return;
    }
    const riskRes = servicesBase.contractRisk
      ? await ghostApiFetch(`${servicesBase.contractRisk}/risk`, 'contract-risk-service')
      : { ok: true as const, data: { contracts: [] } };
    if (!riskRes.ok) {
      res.status(riskRes.status).json(riskRes.error);
      return;
    }
    const registryContracts = Array.isArray((registryRes.data as { contracts?: unknown }).contracts)
      ? ((registryRes.data as { contracts?: unknown[] }).contracts as Array<Record<string, unknown>>)
      : [];
    const risks = Array.isArray((riskRes.data as { contracts?: unknown }).contracts)
      ? ((riskRes.data as { contracts?: unknown[] }).contracts as Array<Record<string, unknown>>)
      : [];
    const localRegistry = listRegisteredContracts();
    const localAddressSet = new Set(localRegistry.map((entry) => entry.address.toLowerCase()));
    const sourceContracts: Array<Record<string, unknown>> = [
      ...registryContracts.filter((entry) => {
        const address = typeof entry.address === 'string' ? entry.address.trim().toLowerCase() : '';
        if (!address) return false;
        return !localAddressSet.has(address);
      }),
      ...localRegistry.map((entry) => ({
        id: entry.name,
        name: entry.name,
        address: entry.address,
        registry: entry.address,
        layer: entry.layer,
        chainId: entry.chainId,
        abi: entry.abi,
        abiHash: entry.abiHash,
        version: entry.version,
        verified: true
      }))
    ];
    const merged = sourceContracts.map((contract) => {
      const address = typeof contract.address === 'string' ? contract.address : '';
      const risk = risks.find((r) => (r.address as string | undefined)?.toLowerCase() === address.toLowerCase());
      return {
        address,
        name: typeof contract.name === 'string' ? contract.name : undefined,
        abi: contract.abi,
        verified: Boolean(contract.verified),
        proxyType: typeof contract.proxyType === 'string' ? contract.proxyType : undefined,
        owner: typeof contract.owner === 'string' ? contract.owner : undefined,
        layer: typeof contract.layer === 'string' ? contract.layer : undefined,
        chainId: typeof contract.chainId === 'number' ? contract.chainId : undefined,
        abiHash: typeof contract.abiHash === 'string' ? contract.abiHash : undefined,
        version: typeof contract.version === 'string' ? contract.version : undefined,
        risk
      };
    });
    ghostApiSend(
      res,
      ContractsResponseSchema,
      {
        contracts: merged,
        meta: {
          registryCount: registryContracts.length,
          localCount: localRegistry.length,
          riskCount: risks.length
        }
      },
      'contract-registry'
    );
  });

  app.get(['/v1/tokenomics', '/tokenomics'], requirePermission('treasury:read'), ghostApiLimiter, async (_req, res) => {
    if (!servicesBase.supply || !servicesBase.treasury || !servicesBase.feeModel || !servicesBase.payouts) {
      ghostApiError(res, 503, 'tokenomics', 'missing');
      return;
    }
    const [supplyRes, treasuryRes, feeModelRes, payoutsRes] = await Promise.all([
      ghostApiFetch(`${servicesBase.supply}/supply`, 'supply-service'),
      ghostApiFetch(`${servicesBase.treasury}/treasury`, 'treasury-service'),
      ghostApiFetch(`${servicesBase.feeModel}/model`, 'fee-model-service'),
      ghostApiFetch(`${servicesBase.payouts}/payouts`, 'payout-service')
    ]);
    const error = [supplyRes, treasuryRes, feeModelRes, payoutsRes].find((entry) => !entry.ok);
    if (error && !error.ok) {
      res.status(error.status).json(error.error);
      return;
    }
    const supply = supplyRes.data as { supply?: string; emissions?: string };
    const feeModel = feeModelRes.data as { baseFee?: string; targetGas?: string; mode?: string };
    const payouts = Array.isArray((payoutsRes.data as { payouts?: unknown }).payouts)
      ? ((payoutsRes.data as { payouts?: unknown[] }).payouts as unknown[])
      : [];
    const snapshots = [
      {
        total: supply.supply || '0',
        circulating: supply.supply || '0',
        burned: '0',
        minted: supply.emissions || '0',
        time: new Date().toISOString()
      }
    ];
    ghostApiSend(res, TokenomicsSummarySchema, { snapshots, feeModel, payouts }, 'tokenomics');
  });

  app.get(['/v1/treasury', '/treasury'], requirePermission('treasury:read'), ghostApiLimiter, async (_req, res) => {
    if (!servicesBase.treasury || !servicesBase.payouts) {
      ghostApiError(res, 503, 'treasury-service', 'missing');
      return;
    }
    const [treasuryRes, payoutsRes] = await Promise.all([
      ghostApiFetch(`${servicesBase.treasury}/treasury`, 'treasury-service'),
      ghostApiFetch(`${servicesBase.payouts}/payouts`, 'payout-service')
    ]);
    const error = [treasuryRes, payoutsRes].find((entry) => !entry.ok);
    if (error && !error.ok) {
      res.status(error.status).json(error.error);
      return;
    }
    const balance = treasuryRes.data as { balance?: string };
    const payouts = Array.isArray((payoutsRes.data as { payouts?: unknown }).payouts)
      ? ((payoutsRes.data as { payouts?: unknown[] }).payouts as unknown[])
      : [];
    ghostApiSend(res, TreasurySummarySchema, { balance, proposals: treasuryProposals, payouts }, 'treasury-service');
  });

  app.get(['/v1/governance', '/governance'], requirePermission('governance:read'), ghostApiLimiter, async (_req, res) => {
    if (!servicesBase.governance) {
      ghostApiError(res, 503, 'governance-service', 'missing');
      return;
    }
    const [proposalsRes, votesRes, queueRes, delegationsRes] = await Promise.all([
      ghostApiFetch(`${servicesBase.governance}/proposals`, 'governance-service'),
      ghostApiFetch(`${servicesBase.governance}/votes`, 'governance-service'),
      ghostApiFetch(`${servicesBase.governance}/queue`, 'governance-service'),
      ghostApiFetch(`${servicesBase.governance}/delegations`, 'governance-service')
    ]);
    const error = [proposalsRes, votesRes, queueRes, delegationsRes].find((entry) => !entry.ok);
    if (error && !error.ok) {
      res.status(error.status).json(error.error);
      return;
    }
    const proposals = Array.isArray((proposalsRes.data as { proposals?: unknown }).proposals)
      ? ((proposalsRes.data as { proposals?: unknown[] }).proposals as unknown[])
      : [];
    const votes = Array.isArray((votesRes.data as { votes?: unknown }).votes)
      ? ((votesRes.data as { votes?: unknown[] }).votes as unknown[])
      : [];
    const queue = Array.isArray((queueRes.data as { queue?: unknown }).queue)
      ? ((queueRes.data as { queue?: unknown[] }).queue as unknown[])
      : [];
    const delegations = Array.isArray((delegationsRes.data as { delegations?: unknown }).delegations)
      ? ((delegationsRes.data as { delegations?: unknown[] }).delegations as unknown[])
      : [];
    ghostApiSend(res, GovernanceSummarySchema, { proposals, votes, queue, delegations }, 'governance-service');
  });

  app.get(['/v1/compliance', '/compliance'], requirePermission('iam:read'), ghostApiLimiter, async (_req, res) => {
    ghostApiSend(res, ComplianceSummarySchema, { reports: complianceReports }, 'compliance');
  });

  app.get(['/v1/integration', '/integration'], requirePermission('integrations:read'), ghostApiLimiter, async (_req, res) => {
    const integrations = await integrationsStorePromise;
    ghostApiSend(
      res,
      IntegrationsSummarySchema,
      { definitions: integrations.listDefinitions(), instances: integrations.listInstances() },
      'integrations'
    );
  });

  app.get(['/v1/devops', '/devops'], requirePermission('devops:read'), ghostApiLimiter, async (_req, res) => {
    if (!servicesBase.devops) {
      ghostApiError(res, 503, 'devops-service', 'missing');
      return;
    }
    const [releasesRes, forksRes, upgradesRes] = await Promise.all([
      ghostApiFetch(`${servicesBase.devops}/releases`, 'devops-service'),
      ghostApiFetch(`${servicesBase.devops}/forks`, 'devops-service'),
      ghostApiFetch(`${servicesBase.devops}/upgrades`, 'devops-service')
    ]);
    const error = [releasesRes, forksRes, upgradesRes].find((entry) => !entry.ok);
    if (error && !error.ok) {
      res.status(error.status).json(error.error);
      return;
    }
    const releases = Array.isArray((releasesRes.data as { releases?: unknown }).releases)
      ? ((releasesRes.data as { releases?: unknown[] }).releases as unknown[])
      : [];
    const forks = Array.isArray((forksRes.data as { forks?: unknown }).forks)
      ? ((forksRes.data as { forks?: unknown[] }).forks as unknown[])
      : [];
    const upgrades = Array.isArray((upgradesRes.data as { upgrades?: unknown }).upgrades)
      ? ((upgradesRes.data as { upgrades?: unknown[] }).upgrades as unknown[])
      : [];
    ghostApiSend(res, DevopsSummarySchema, { releases, forks, upgrades }, 'devops-service');
  });

  app.get(['/v1/observability', '/observability'], observabilityGuard, ghostApiLimiter, async (_req, res) => {
    try {
      const [alerts, dashboards, logs] = await Promise.all([
        liveServices.observability.alertRulesService.list(),
        liveServices.observability.metricsService.listDashboards(),
        liveServices.observability.logsService.search('', 50)
      ]);
      ghostApiSend(res, ObservabilitySummarySchema, { alerts, dashboards, logs }, 'observability');
    } catch (err) {
      ghostApiError(res, 502, 'observability', err instanceof Error ? err.message : 'observability_summary_failed');
    }
  });

  app.get(['/v1/ai', '/ai'], requirePermission('ai:read'), ghostApiLimiter, async (_req, res) => {
    const status = servicesBase.ai && servicesBase.explainability ? 'ok' : 'degraded';
    ghostApiSend(
      res,
      AiSummarySchema,
      {
        status,
        modules: [
          'tx-intel',
          'wallet-intel',
          'contract-intel',
          'network-intel',
          'bridge-intel',
          'governance-intel',
          'forecasting',
          'explainability'
        ],
        lastUpdated: new Date().toISOString()
      },
      'ai'
    );
  });

  app.get(['/v1/explorer', '/explorer'], explorerGuard, ghostApiLimiter, async (req, res) => {
    const chain = typeof req.query.chain === 'string' ? req.query.chain : undefined;
    const blockLimit = Math.min(Number(req.query.blockLimit) || 5, 20);
    const txLimit = Math.min(Number(req.query.txLimit) || 10, 50);
    try {
      const latestHex = (await rpcCall<HexString>('ghost_blockNumber', [], chain)) as HexString;
      const latest = parseInt(latestHex, 16);
      const blocks = await Promise.all(
        Array.from({ length: blockLimit }, (_, i) => latest - i)
          .filter((n) => n >= 0)
          .map(async (num) => {
            const block = (await rpcCall<RpcBlock>(
              'ghost_getBlockByNumber',
              ['0x' + num.toString(16), true],
              chain
            )) as RpcBlock;
            return {
              number: parseInt(block.number, 16),
              hash: block.hash || '',
              proposer: block.miner,
              txCount: Array.isArray(block.transactions) ? block.transactions.length : 0,
              size: block.size ? parseInt(block.size, 16) : undefined,
              time: new Date(parseInt(block.timestamp, 16) * 1000).toISOString()
            };
          })
      );
      const collected: ExplorerTx[] = [];
      const maxDepth = Math.max(txLimit * 10, 200);
      for (let num = latest; num >= 0 && collected.length < txLimit && latest - num <= maxDepth; num--) {
        const block = (await rpcCall<RpcBlock>(
          'ghost_getBlockByNumber',
          ['0x' + num.toString(16), true],
          chain
        )) as RpcBlock;
        const blockTime = new Date(parseInt(block.timestamp, 16) * 1000).toISOString();
        for (const t of block.transactions || []) {
          if (collected.length >= txLimit) break;
          const txObj = typeof t === 'string' ? await rpcCall<RpcTx>('ghost_getTransactionByHash', [t], chain) : (t as RpcTx);
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
      const status = (await rpcCall<{ pending?: string; queued?: string }>('txpool_status', [], chain).catch(
        () =>
          ({
            pending: '0x0',
            queued: '0x0'
          } as { pending: string; queued: string })
      )) as { pending?: string; queued?: string };
      const pending = status.pending ? parseInt(status.pending, 16) || 0 : 0;
      const queued = status.queued ? parseInt(status.queued, 16) || 0 : 0;
      const mempool = {
        pending,
        queued,
        fairnessScore: Number((Math.max(0, 1 - pending / 1000)).toFixed(2)),
        mevRisk: pending > 500 ? 'elevated' : 'low'
      };
      ghostApiSend(res, ExplorerSummarySchema, { blocks, txs: collected.slice(0, txLimit), mempool }, 'explorer');
    } catch (err) {
      ghostApiError(res, 502, 'explorer', err instanceof Error ? err.message : 'explorer_summary_failed');
    }
  });
});

const normalizeChain = (chain?: string) => {
  if (chain === 'l1' || chain === 'L1') return 'l1' as const;
  if (chain === 'l3' || chain === 'L3') return 'l3' as const;
  return 'l2' as const;
};

const rpcCall = async <T = unknown>(method: string, params: unknown[] = [], chain?: string) => {
  const target = normalizeChain(chain);
  return ghostWalletRpcManager.withProvider(target, (provider) => provider.send(method, params) as Promise<T>);
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

app.post(['/v1/api/bridge/incidents', '/api/bridge/incidents'], requirePermission('bridge:write'), assertRoutingLawMiddleware, async (req, res) => {
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

app.post(['/v1/api/bridge/pause', '/api/bridge/pause'], requirePermission('bridge:write'), assertRoutingLawMiddleware, async (req, res) => {
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

app.post(['/v1/api/bridge/resume', '/api/bridge/resume'], requirePermission('bridge:write'), assertRoutingLawMiddleware, async (req, res) => {
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

app.post(['/v1/api/bridge/fees', '/api/bridge/fees'], requirePermission('bridge:write'), assertRoutingLawMiddleware, async (req, res) => {
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

app.get(['/v1/api/contracts', '/api/contracts'], requirePermission('contracts:read'), async (req, res) => {
  const correlationId = String(req.correlationId || crypto.randomUUID());
  const requestHeaders: Record<string, string> = { 'x-request-id': correlationId };
  const registry: { contracts?: Array<Record<string, unknown>> } = { contracts: [] };
  const risks: { contracts?: Array<Record<string, unknown>> } = { contracts: [] };
  let registryError: string | undefined;
  let riskError: string | undefined;

  if (!servicesBase.contracts) {
    registryError = 'contracts_service_missing';
  } else {
    try {
      const upstream = await fetch(`${servicesBase.contracts}/contracts`, {
        headers: requestHeaders
      });
      if (!upstream.ok) {
        registryError = `contracts_status_${upstream.status}`;
      } else {
        const body = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
        const contractsValue = (body as { contracts?: unknown }).contracts;
        if (Array.isArray(contractsValue)) registry.contracts = contractsValue as Array<Record<string, unknown>>;
      }
    } catch (err) {
      registryError = err instanceof Error ? err.message : 'contracts_fetch_failed';
    }
  }
  if (registryError) {
    logContractEvent('warn', 'contracts.registry.fetch_failed', { correlationId, error: registryError });
  }

  if (!servicesBase.contractRisk) {
    riskError = 'contract_risk_service_missing';
  } else {
    try {
      const upstream = await fetch(`${servicesBase.contractRisk}/risk`, {
        headers: requestHeaders
      });
      if (!upstream.ok) {
        riskError = `contract_risk_status_${upstream.status}`;
      } else {
        const body = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
        const contractsValue = (body as { contracts?: unknown }).contracts;
        if (Array.isArray(contractsValue)) risks.contracts = contractsValue as Array<Record<string, unknown>>;
      }
    } catch (err) {
      riskError = err instanceof Error ? err.message : 'contract_risk_fetch_failed';
    }
  }
  if (riskError) {
    logContractEvent('warn', 'contracts.risk.fetch_failed', { correlationId, error: riskError });
  }

  const localRegistry = listRegisteredContracts();
  const localAddressSet = new Set(localRegistry.map((entry) => entry.address.toLowerCase()));
  const pausedFlags = contractMetadata.pauseQuery ? await prometheus.query(contractMetadata.pauseQuery).catch(() => []) : [];
  const upgradeabilityFlags = contractMetadata.upgradeabilityQuery ? await prometheus.query(contractMetadata.upgradeabilityQuery).catch(() => []) : [];

  const sourceContracts: Array<Record<string, unknown>> = [
    ...((registry.contracts || []) as Array<Record<string, unknown>>).filter((entry) => {
      const address = typeof entry.address === 'string' ? entry.address.trim().toLowerCase() : '';
      if (!address) return false;
      return !localAddressSet.has(address);
    }),
    ...localRegistry.map((entry) => ({
      id: entry.name,
      name: entry.name,
      address: entry.address,
      registry: entry.address,
      layer: entry.layer,
      chainId: entry.chainId,
      abi: entry.abi,
      abiHash: entry.abiHash,
      version: entry.version,
      verified: true
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
  if (!merged.length) {
    logContractEvent('warn', 'contracts.registry.empty', {
      correlationId,
      registryCount: registry.contracts?.length || 0,
      localCount: localRegistry.length
    });
  }
  res.json({
    ok: true,
    networks: merged,
    meta: {
      registryCount: registry.contracts?.length || 0,
      localCount: localRegistry.length,
      riskCount: risks.contracts?.length || 0,
      registryError,
      riskError
    }
  });
});

app.get(['/v1/api/contracts/readiness', '/api/contracts/readiness'], requirePermission('contracts:read'), async (_req, res) => {
  const seedEnv = loadSeedEnv();
  const l1FinalityOracleAddress = String(seedEnv.L1_FINALITY_ORACLE_ADDRESS || '').trim();
  const aiPolicyHashCandidates = [
    { source: 'AI_POLICY_HASH', value: String(seedEnv.AI_POLICY_HASH || '').trim() },
    { source: 'CHAIN_POLICY_CHECKPOINT_HASH', value: String(seedEnv.CHAIN_POLICY_CHECKPOINT_HASH || '').trim() }
  ];
  const aiPolicyHashConfig = aiPolicyHashCandidates.find((candidate) => BYTES32_REGEX.test(candidate.value)) || null;

  if (!CONTRACT_ADDRESS_REGEX.test(l1FinalityOracleAddress)) {
    res.json({
      ok: true,
      l1FinalityOracleAddress: l1FinalityOracleAddress || null,
      aiPolicyHash: aiPolicyHashConfig?.value || null,
      aiPolicyHashAccepted: null,
      policyHashSource: aiPolicyHashConfig?.source || null,
      detail: 'L1_FINALITY_ORACLE_ADDRESS missing or invalid'
    });
    return;
  }

  let resolvedPolicyHash = aiPolicyHashConfig?.value || null;
  let policyHashSource = aiPolicyHashConfig?.source || null;
  let resolutionDetail = '';
  let resolvedFromL1Block: number | null = null;

  if (!resolvedPolicyHash) {
    try {
      const latestFinalized = await readLatestFinalizedPolicyHashOnL1(l1FinalityOracleAddress);
      if (latestFinalized?.policyHash && BYTES32_REGEX.test(latestFinalized.policyHash)) {
        resolvedPolicyHash = latestFinalized.policyHash;
        policyHashSource = 'L1BlockFinalized.event';
        resolvedFromL1Block = latestFinalized.l1BlockNumber;
        resolutionDetail = `derived from latest L1BlockFinalized event at L1 block ${latestFinalized.l1BlockNumber}`;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'l1_finalized_event_lookup_failed';
      res.json({
        ok: true,
        l1FinalityOracleAddress,
        aiPolicyHash: null,
        aiPolicyHashAccepted: null,
        policyHashSource: null,
        detail: `AI policy hash not configured and fallback lookup failed: ${message}`
      });
      return;
    }
  }

  if (!resolvedPolicyHash) {
    res.json({
      ok: true,
      l1FinalityOracleAddress,
      aiPolicyHash: null,
      aiPolicyHashAccepted: null,
      policyHashSource: null,
      detail: 'AI policy hash not configured and no L1BlockFinalized event policy hash found'
    });
    return;
  }

  try {
    const accepted = await readAcceptedPolicyHashOnL1(l1FinalityOracleAddress, resolvedPolicyHash);
    const baseDetail = accepted ? 'policy hash accepted on L1 finality oracle' : 'policy hash not accepted on L1 finality oracle';
    const sourceDetail = resolutionDetail || (resolvedFromL1Block !== null ? `derived from L1 block ${resolvedFromL1Block}` : '');
    res.json({
      ok: true,
      l1FinalityOracleAddress,
      aiPolicyHash: resolvedPolicyHash,
      aiPolicyHashAccepted: accepted,
      policyHashSource,
      detail: sourceDetail ? `${baseDetail}; ${sourceDetail}` : baseDetail
    });
  } catch (err) {
    res.json({
      ok: true,
      l1FinalityOracleAddress,
      aiPolicyHash: resolvedPolicyHash,
      aiPolicyHashAccepted: null,
      policyHashSource,
      detail: err instanceof Error ? err.message : 'l1_policy_hash_check_failed'
    });
  }
});

app.get(['/v1/api/contracts/state', '/api/contracts/state'], requirePermission('contracts:read'), async (_req, res) => {
  res.json({ ok: true, contracts: contractStates });
});

app.post(['/v1/api/contracts/seed', '/api/contracts/seed'], requirePermission('contracts:write'), async (req, res) => {
  const correlationId = req.correlationId ?? crypto.randomUUID();
  const result = seedContractsRegistry();
  if (!result.ok) {
    logContractEvent('warn', 'contracts.seed.empty', {
      correlationId,
      errors: result.errors.length
    });
    res.status(409).json({ error: 'no_seed_contracts', errors: result.errors });
    return;
  }
  const verification = verifyContractsStored(
    result.stored.map((entry) => ({ address: entry.address, chainId: entry.chainId })),
    result.contracts.map((entry) => ({ address: entry.address, chainId: entry.chainId }))
  );
  const actorId = req.session?.userId || 'unknown';
  logContractEvent('info', 'contracts.seeded', {
    correlationId,
    actorId,
    registered: result.contracts.length,
    storedCount: result.stored.length,
    errors: result.errors.length
  });
  await auditLogService?.append({
    actorId,
    action: 'contracts:seed',
    resource: 'contracts',
    meta: {
      correlationId,
      registered: result.contracts.length,
      storedCount: result.stored.length,
      errors: result.errors.length
    }
  });
  if (!verification.ok) {
    logContractEvent('error', 'contracts.seed.mismatch', {
      correlationId,
      missing: verification.missing
    });
    res.status(500).json({ error: 'registry_mismatch', missing: verification.missing, errors: result.errors });
    return;
  }
  res.json({
    ok: true,
    registeredCount: result.contracts.length,
    storedCount: result.stored.length,
    errors: result.errors
  });
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
    logContractEvent('warn', 'contracts.register.missing', { correlationId: req.correlationId });
    res.status(400).json({ error: 'contract_required' });
    return;
  }
  const normalized: Array<z.infer<typeof contractRegistrationSchema>> = [];
  const errors: Array<Record<string, unknown>> = [];
  entries.forEach((entry, index) => {
    const result = normalizeContractEntry(entry, index);
    if (result.ok) {
      normalized.push(result.value);
    } else {
      errors.push(result.error);
    }
  });
  if (!normalized.length) {
    logContractEvent('warn', 'contracts.register.invalid', {
      correlationId: req.correlationId,
      errors
    });
    res.status(400).json({ error: 'invalid_contracts', details: errors });
    return;
  }
  const stored = registerContracts(normalized);
  const persisted = listRegisteredContracts();
  const verification = verifyContractsStored(persisted, normalized);
  const actorId = req.session?.userId || (hasContractsToken(req) ? 'contracts-token' : 'unknown');
  logContractEvent('info', 'contracts.registered', {
    correlationId: req.correlationId,
    actorId,
    count: normalized.length,
    missing: verification.missing.length,
    storedCount: stored.length,
    persistedCount: persisted.length,
    names: normalized.map((entry) => entry.name),
    addresses: normalized.map((entry) => entry.address),
    chainIds: normalized.map((entry) => entry.chainId),
    versions: normalized.map((entry) => entry.version)
  });
  await auditLogService?.append({
    actorId,
    action: 'contracts:register',
    resource: 'contracts',
    meta: {
      correlationId: req.correlationId,
      count: normalized.length,
      missing: verification.missing.length
    }
  });
  if (!verification.ok) {
    logContractEvent('error', 'contracts.register.mismatch', {
      correlationId: req.correlationId,
      missing: verification.missing
    });
    res.status(500).json({ error: 'registry_mismatch', missing: verification.missing });
    return;
  }
  res.json({ ok: true, contracts: stored, verification: { ok: true, count: normalized.length } });
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
  // SECURITY: Strict filename validation to prevent path traversal
  const sanitizedName = String(nameParam).replace(/[^a-zA-Z0-9._-]/g, '');
  if (!sanitizedName || sanitizedName.includes('..')) {
    res.status(400).json({ error: 'invalid_filename' });
    return;
  }
  // SECURITY: Whitelist allowed file extensions
  const allowedExtensions = ['.png', '.svg', '.jpg', '.jpeg', '.json', '.md'];
  const ext = path.extname(sanitizedName).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    res.status(400).json({ error: 'invalid_file_type' });
    return;
  }
  const filePath = path.join(diagramsDir, sanitizedName);
  // SECURITY: Ensure resolved path is within allowed directory
  const resolvedPath = path.resolve(filePath);
  const resolvedDir = path.resolve(diagramsDir);
  if (!resolvedPath.startsWith(resolvedDir)) {
    res.status(403).json({ error: 'access_denied' });
    return;
  }
  if (!fs.existsSync(resolvedPath)) {
    res.status(404).json({ error: 'diagram_not_found' });
    return;
  }
  res.sendFile(resolvedPath);
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

app.get(['/v1/api/stocks', '/api/stocks'], requirePermission('treasury:read'), async (_req, res) => {
  const [supply, treasury, forecasts, anomalies, explanations] = await Promise.all([
    proxyJson<{ supply?: string; emissions?: string }>(`${servicesBase.supply}/supply`, { supply: '0', emissions: '0' }),
    proxyJson<{ balance?: string }>(`${servicesBase.treasury}/treasury`, { balance: '0' }),
    proxyJson<{ forecasts?: Array<{ metric?: string; horizon?: string; value?: number; confidence?: number }> }>(
      `${servicesBase.forecasting}/forecast`,
      { forecasts: [] }
    ).catch(() => ({ forecasts: [] })),
    proxyJson<{ anomalies?: Array<{ id?: string; score?: number; reasons?: string[] }> }>(`${servicesBase.ai}/anomalies`, { anomalies: [] }).catch(
      () => ({ anomalies: [] })
    ),
    proxyJson<{ explanations?: Array<{ id?: string; metric?: string; value?: string; reasons?: string[] }> }>(
      `${servicesBase.explainability}/explain`,
      { explanations: [] }
    ).catch(() => ({ explanations: [] }))
  ]);

  const supplyValue = parseNumber(supply.supply);
  const treasuryValue = parseNumber(treasury.balance);
  const riskForecast = forecasts.forecasts?.find((f) => f.metric === 'risk');
  const congestionForecast = forecasts.forecasts?.find((f) => f.metric === 'congestion');
  const recommendations = buildMarketRecommendations({
    risk: parseNumber(riskForecast?.value),
    congestion: parseNumber(congestionForecast?.value),
    treasuryBalance: treasuryValue,
    supply: supplyValue,
    anomalies: anomalies.anomalies
  });

  const tokens = marketData.tokens.map((token) => {
    const enriched: MarketToken = { ...token };
    if (token.chainId === 'l2' || token.chainId === 'l3' || token.chainId === 'l1') {
      if (supply.supply) enriched.supply = supply.supply;
      if (supply.emissions) enriched.emissions = supply.emissions;
    }
    if (treasury.balance) enriched.treasuryHoldings = treasury.balance;
    enriched.updatedAt = new Date().toISOString();
    return enriched;
  });

  res.json({
    ok: true,
    tokens,
    treasury: { balance: treasury.balance || '0' },
    forecasts: forecasts.forecasts || [],
    anomalies: anomalies.anomalies || [],
    explanations: explanations.explanations || [],
    recommendations,
    updatedAt: new Date().toISOString()
  });
});

app.post(['/v1/api/stocks/tokens', '/api/stocks/tokens'], requirePermission('treasury:write'), async (req, res) => {
  const schema = z.object({
    tokens: z.array(
      z.object({
        symbol: z.string(),
        chainId: z.string(),
        name: z.string().optional(),
        priceUsd: z.string().optional(),
        change24h: z.string().optional(),
        marketCapUsd: z.string().optional(),
        treasuryHoldings: z.string().optional()
      })
    )
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  marketData = {
    tokens: parsed.data.tokens.map((token) => normalizeMarketToken({ id: '', ...token }))
  };
  saveMarketData(marketData);
  res.json({ ok: true, tokens: marketData.tokens });
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

app.get(['/v1/api/treasury/payouts', '/api/treasury/payouts'], requirePermission('treasury:read'), async (_req, res) => {
  if (!servicesBase.payouts) {
    res.status(503).json({ error: 'payout_service_missing' });
    return;
  }
  try {
    const upstream = await fetch(`${servicesBase.payouts}/payouts`);
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      res.status(upstream.status).json(body);
      return;
    }
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'payout_fetch_failed' });
  }
});

app.get(['/v1/api/treasury/status', '/api/treasury/status'], requirePermission('treasury:read'), async (_req, res) => {
  const data = await proxyJson<Record<string, unknown>>(`${servicesBase.treasuryEngine}/v1/treasury/status`, {
    ok: false,
    error: 'treasury_engine_unavailable'
  }).catch(() => ({ ok: false, error: 'treasury_engine_unavailable' }));
  res.json(data);
});

app.get(['/v1/api/revenue/l3', '/api/revenue/l3'], requirePermission('treasury:read'), async (_req, res) => {
  const data = await proxyJson<Record<string, unknown>>(`${servicesBase.l3Revenue}/v1/revenue/l3`, {
    ok: false,
    error: 'l3_revenue_unavailable',
    eventCount: 0,
    totalWei: '0',
    bySource: [],
    recent: []
  }).catch(() => ({ ok: false, error: 'l3_revenue_unavailable', eventCount: 0, totalWei: '0', bySource: [], recent: [] }));
  res.json(data);
});

app.get(['/v1/api/revenue/l2', '/api/revenue/l2'], requirePermission('treasury:read'), async (_req, res) => {
  const data = await proxyJson<Record<string, unknown>>(`${servicesBase.l2Revenue}/v1/revenue/l2`, {
    ok: false,
    error: 'l2_revenue_unavailable',
    eventCount: 0,
    totalWei: '0',
    pendingCount: 0,
    recentBatches: []
  }).catch(() => ({ ok: false, error: 'l2_revenue_unavailable', eventCount: 0, totalWei: '0', pendingCount: 0, recentBatches: [] }));
  res.json(data);
});

app.get(['/v1/api/allocation/history', '/api/allocation/history'], requirePermission('treasury:read'), async (_req, res) => {
  const data = await proxyJson<{ ok?: boolean; allocations?: unknown[] }>(`${servicesBase.treasuryEngine}/v1/allocation/history`, {
    ok: true,
    allocations: []
  }).catch(() => ({ ok: false, allocations: [] }));
  res.json({ ok: data.ok !== false, allocations: data.allocations || [] });
});

app.get(['/v1/api/reward/cycles', '/api/reward/cycles'], requirePermission('treasury:read'), async (_req, res) => {
  const data = await proxyJson<{ ok?: boolean; cycles?: unknown[] }>(`${servicesBase.rewardDistributor}/v1/reward/cycles`, {
    ok: true,
    cycles: []
  }).catch(() => ({ ok: false, cycles: [] }));
  res.json({ ok: data.ok !== false, cycles: data.cycles || [] });
});

app.get(['/v1/api/federation/status', '/api/federation/status'], requirePermission('treasury:read'), async (_req, res) => {
  const data = await proxyJson<Record<string, unknown>>(`${servicesBase.treasuryEngine}/v1/treasury/federation`, {
    ok: true,
    membersActive: 0,
    exposureByMember: [],
    violationsTotal: 0
  }).catch(() => ({ ok: false, membersActive: 0, exposureByMember: [], violationsTotal: 0 }));
  res.json(data);
});

app.get(['/v1/api/solvency/latest', '/api/solvency/latest'], requirePermission('treasury:read'), async (_req, res) => {
  const data = await proxyJson<Record<string, unknown>>(`${servicesBase.treasuryEngine}/v1/treasury/solvency/latest`, {
    ok: true,
    latest: null
  }).catch(() => ({ ok: false, latest: null }));
  res.json(data);
});

app.post(['/v1/api/solvency/snapshot', '/api/solvency/snapshot'], requirePermission('treasury:write'), async (req, res) => {
  try {
    const upstream = await fetch(`${servicesBase.treasuryEngine}/v1/treasury/solvency/snapshot`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(req.header('x-admin-token') ? { 'x-admin-token': String(req.header('x-admin-token')) } : {})
      },
      body: JSON.stringify(req.body || {})
    });
    const body = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(body);
  } catch (error) {
    res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'solvency_snapshot_unavailable' });
  }
});

app.get(['/v1/api/mainnet/readiness', '/api/mainnet/readiness'], requirePermission('governance:read'), async (_req, res) => {
  try {
    const data = await readMainnetReadiness();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'mainnet_readiness_failed'
    });
  }
});

app.get(['/v1/api/governor/proposals', '/api/governor/proposals'], requirePermission('governance:read'), async (_req, res) => {
  const data = await proxyJson<{ ok?: boolean; proposals?: unknown[] }>(`${servicesBase.hyperGovernor}/proposals`, {
    ok: true,
    proposals: []
  }).catch(() => ({ ok: false, proposals: [] }));
  res.json({ ok: data.ok !== false, proposals: data.proposals || [] });
});

app.post(['/v1/api/governor/proposals/draft', '/api/governor/proposals/draft'], requirePermission('governance:write'), async (req, res) => {
  try {
    const upstream = await fetch(`${servicesBase.hyperGovernor}/proposals/draft`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(req.header('x-admin-token') ? { 'x-admin-token': String(req.header('x-admin-token')) } : {})
      },
      body: JSON.stringify(req.body || {})
    });
    const body = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(body);
  } catch (error) {
    res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'hyper_governor_unavailable' });
  }
});

app.get(
  ['/v1/api/governor/proposals/:id/evidence', '/api/governor/proposals/:id/evidence'],
  requirePermission('governance:read'),
  async (req, res) => {
    const proposalId = String(req.params.id || '').trim();
    if (!proposalId) {
      res.status(400).json({ ok: false, error: 'proposal_id_required' });
      return;
    }
    try {
      const upstream = await fetch(`${servicesBase.hyperGovernor}/proposals/${proposalId}/evidence`);
      const body = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json(body);
    } catch (error) {
      res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'hyper_governor_unavailable' });
    }
  }
);

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
  const space = env.SNAPSHOT_SPACE || 'ghostldao';
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
  const pool = ghostWalletRpcManager.getPoolSnapshot();
  for (const chain of ghostchainConfig) {
    const layer = chain.id === 'l1' ? 'L1' : chain.id === 'l2' ? 'L2' : 'L3';
    const endpoint = (pool[layer] || []).find((entry) => entry.protocol === 'http');
    if (!endpoint) {
      items.push({
        id: `${chain.id}-validator`,
        address: `ghost-${chain.id}`,
        status: 'unknown',
        stake: 'N/A',
        commission: 0,
        power: 0
      });
      continue;
    }
    try {
      const provider = new JsonRpcProvider(endpoint.url);
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
  try {
    const latestHex = (await rpcCall<HexString>('ghost_blockNumber', [], chain)) as HexString;
    const latest = parseInt(latestHex, 16);
    const blocks = await Promise.all(
      Array.from({ length: limit }, (_, i) => latest - i)
        .filter((n) => n >= 0)
        .map(async (num) => {
          const block = (await rpcCall<RpcBlock>(
            'ghost_getBlockByNumber',
            ['0x' + num.toString(16), true],
            chain
          )) as RpcBlock;
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
  let pending = 0;
  let queued = 0;
  try {
    const status = (await rpcCall<Record<string, string>>('txpool_status', [], chain)) || {};
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
  try {
    const latestHex = (await rpcCall<HexString>('ghost_blockNumber', [], chain)) as HexString;
    const latest = parseInt(latestHex, 16);
    const collected: ExplorerTx[] = [];
    const maxDepth = Math.max(limit * 10, 500);
    for (let num = latest; num >= 0 && collected.length < limit && latest - num <= maxDepth; num--) {
      const block = (await rpcCall<RpcBlock>(
        'ghost_getBlockByNumber',
        ['0x' + num.toString(16), true],
        chain
      )) as RpcBlock;
      const blockTime = new Date(parseInt(block.timestamp, 16) * 1000).toISOString();
      for (const t of block.transactions || []) {
        if (collected.length < limit) {
          let txObj: RpcTx | null = null;
          if (typeof t === 'string') {
            txObj = (await rpcCall<RpcTx>('ghost_getTransactionByHash', [t], chain)) || null;
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
    const balanceHex = (await rpcCall('ghost_getBalance', [address, 'latest'])) as HexString;
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

app.post(['/v1/swap/execute', '/swap/execute'], assertRoutingLawMiddleware, async (req, res) => {
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
  // SECURITY: Log full error details server-side only
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      correlationId: req.correlationId,
      message: err.message,
      stack: err.stack
    })
  );
  // SECURITY: Return generic error message to client, no stack trace
  res.status(500).json({ 
    error: 'internal_error', 
    message: 'An internal error occurred',
    correlationId: req.correlationId 
  });
});

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || '0.0.0.0';
const shouldListen = require.main === module || process.env.FORCE_LISTEN === 'true';
if (shouldListen) {
  app.listen(port, host, () => {
    console.log(`API listening on ${host}:${port}`);
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
