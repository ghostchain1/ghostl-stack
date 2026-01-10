import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import cors from 'cors';
import { fetch } from 'undici';
import type {} from './types/session';
import { Interface, JsonRpcProvider, Wallet } from 'ethers';
import { buildAppShellRouter } from './modules/app-shell/router';
import { buildIdentityAccessRouter } from './modules/identity-access/router';
import { buildChainRouter } from './modules/chain/router';
import { buildNodeRouter } from './modules/nodes/router';
import { buildObservabilityRouter } from './modules/observability/router';
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

const app = express();
const FileStore = FileStoreFactory(session);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new FileStore({ path: env.SESSION_STORE_PATH, retries: 1 }),
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 60 * 1000
    }
  })
);

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
    // eslint-disable-next-line no-console
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
const liveServices = createLiveServices({ prometheus, grafana, relayer, loki, guard, alertmanager });
const identityServicesPromise = createPersistentIdentityServices();
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
  explorerRpc: env.EXPLORER_RPC_URL || env.RPC_L2 || 'http://localhost:29545',
  swap: env.SWAP_SERVICE_URL
};
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

const sendNotification = async (alert: { id?: string; message?: string; severity?: string }, channels: string[]) => {
  const targets = notificationChannels.filter((c) => channels.includes(c.id));
  await Promise.all(
    targets.map(async (ch) => {
      if (!ch.target) return;
      const payload =
        ch.type === 'slack'
          ? { text: `[${alert.severity || 'info'}] ${alert.id || 'alert'} - ${alert.message || 'incident'}` }
          : ch.type === 'discord'
            ? { content: `[${alert.severity || 'info'}] ${alert.id || 'alert'} - ${alert.message || 'incident'}` }
            : { alert };
      await fetch(ch.target, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => undefined);
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
let treasuryProposals = loadTreasuryProposals();

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
let contractStates = loadContractState();
const pausableAbi = ['function pause()', 'function unpause()'];
const proxyAdminAbi = ['function upgrade(address proxy, address implementation)', 'function upgradeTo(address implementation)'];
const ownableAbi = ['function transferOwnership(address newOwner)'];
const guardianAbi = ['function setGuardian(address)'];
const pausableInterface = new Interface(pausibleAbi);
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
  const data = pausableInterface.encodeFunctionData(method);
  return sendRawTx(target, data);
};

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

app.use(['/v1/app-shell', '/app-shell'], buildAppShellRouter(services.appShell));
app.use(
  ['/v1/chain', '/chain'],
  requirePermission('chain:read'),
  buildChainRouter({
    status: liveServices.chain.chainStatusService,
    telemetry: liveServices.chain.consensusTelemetryService,
    peers: liveServices.chain.peerGraphService
  })
);
app.use(
  ['/v1/nodes', '/nodes'],
  requirePermission('nodes:read'),
  buildNodeRouter({
    inventory: liveServices.nodes.nodeInventoryService,
    health: liveServices.nodes.nodeHealthService
  })
);
app.use(
  ['/v1/stack', '/stack'],
  requirePermission('chain:read'),
  buildStackRouter({
    prometheus,
    guard,
    relayer
  })
);
app.use(['/v1/wallet', '/wallet'], buildWalletRouter());

identityServicesPromise.then((identity) => {
  auditLogService = identity.auditLogService;
  app.use(['/v1', '/'], buildIdentityAccessRouter(identity));
  app.use(
    ['/v1/observability', '/observability'],
    requirePermission('observability:read'),
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
      alertProxy: alertmanager ? (payload: AlertmanagerAlert) => alertmanager.send(payload) : undefined
    })
  );
});

const rpcCall = async <T = unknown>(method: string, params: unknown[] = []) => {
  const res = await fetch(servicesBase.explorerRpc, {
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
  const bridges = await proxyJson<{ bridges?: unknown[] }>(`${servicesBase.bridge}/bridges`, { bridges: [] });
  const transfers = await proxyJson<{ transfers?: unknown[] }>(`${servicesBase.transfers}/transfers`, { transfers: [] });
  const pools = await proxyJson<{ pools?: unknown[] }>(`${servicesBase.liquidity}/liquidity`, { pools: [] });
  res.json({ ok: true, networks: bridges.bridges || [], transfers: transfers.transfers || [], pools: pools.pools || [] });
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
  const pausedFlags = contractMetadata.pauseQuery ? await prometheus.query(contractMetadata.pauseQuery).catch(() => []) : [];
  const upgradeabilityFlags = contractMetadata.upgradeabilityQuery ? await prometheus.query(contractMetadata.upgradeabilityQuery).catch(() => []) : [];

  const merged =
    registry.contracts?.map((c) => {
      const address = (c.address as string) || '';
      const pausedMetric = pausedFlags.find((p) => p.metric.address?.toLowerCase() === address.toLowerCase());
      const upgradeMetric = upgradeabilityFlags.find((u) => u.metric.address?.toLowerCase() === address.toLowerCase());
      return {
        id: address || (c.name as string) || 'contract',
        address,
        name: c.name,
        proxies: c.proxyType,
        ownership: c.owner,
        verified: c.verified,
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
  const admin = env.CONTRACT_PROXY_ADMIN_ADDRESS || proxy;
  if (!proxy || !implementation) {
    res.status(400).json({ error: 'proxyAddress and implementation required' });
    return;
  }
  try {
    const data =
      env.CONTRACT_PROXY_ADMIN_ADDRESS && env.CONTRACT_PROXY_ADMIN_ADDRESS !== proxy
        ? proxyAdminInterface.encodeFunctionData('upgrade', [proxy, implementation])
        : proxyAdminInterface.encodeFunctionData('upgradeTo', [implementation]);
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

app.get(['/v1/api/token', '/api/token'], requirePermission('treasury:read'), async (_req, res) => {
  const supply = await proxyJson<{ supply?: string; emissions?: string }>(`${servicesBase.supply}/supply`, { supply: '0', emissions: '0' });
  const treasury = await proxyJson<{ balance?: string }>(`${servicesBase.treasury}/treasury`, { balance: '0' });
  res.json({
    ok: true,
    networks: [
      {
        id: 'l2',
        supply: supply.supply || '0',
        emissions: supply.emissions || '0',
        multisig: treasury.balance || '0'
      }
    ]
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

app.get(['/v1/api/validators', '/api/validators'], requirePermission('validator:read'), async (_req, res) => {
  const data = await proxyJson<{ validators?: unknown[] }>(`${servicesBase.validators}/validators`, { validators: [] });
  res.json(data);
});

app.get(['/v1/api/validators/metrics', '/api/validators/metrics'], requirePermission('validator:read'), async (_req, res) => {
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
  res.json({
    ok: true,
    metrics: {
      missedBlocks,
      finalityLag: finalityLag ?? 0
    }
  });
});

app.get(['/v1/api/ai', '/api/ai'], requirePermission('ai:read'), async (_req, res) => {
  const data = await proxyJson<{ networks?: unknown[] }>(`${servicesBase.ai}/anomalies`, { networks: [] });
  res.json(data || { networks: [] });
});

app.get(['/v1/explorer/blocks', '/explorer/blocks'], async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  try {
    const latestHex = (await rpcCall<HexString>('eth_blockNumber')) as HexString;
    const latest = parseInt(latestHex, 16);
    const blocks = await Promise.all(
      Array.from({ length: limit }, (_, i) => latest - i)
        .filter((n) => n >= 0)
        .map(async (num) => {
          const block = (await rpcCall<RpcBlock>('eth_getBlockByNumber', ['0x' + num.toString(16), true])) as RpcBlock;
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
    res.json({ blocks });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message, blocks: [] });
  }
});

app.get(['/v1/explorer/txs', '/explorer/txs'], async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  try {
    const latestHex = (await rpcCall<HexString>('eth_blockNumber')) as HexString;
    const latest = parseInt(latestHex, 16);
    const collected: ExplorerTx[] = [];
    const maxDepth = Math.max(limit * 10, 500);
    for (let num = latest; num >= 0 && collected.length < limit && latest - num <= maxDepth; num--) {
      const block = (await rpcCall<RpcBlock>('eth_getBlockByNumber', ['0x' + num.toString(16), true])) as RpcBlock;
      const blockTime = new Date(parseInt(block.timestamp, 16) * 1000).toISOString();
      for (const t of block.transactions || []) {
        if (collected.length < limit) {
          let txObj: RpcTx | null = null;
          if (typeof t === 'string') {
            txObj = (await rpcCall<RpcTx>('eth_getTransactionByHash', [t])) || null;
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
    res.json({ txs });
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

app.get(['/v1/integrations/rpc', '/integrations/rpc'], async (_req, res) => {
  const data = await proxyJson<{ endpoints?: unknown[] }>(`${servicesBase.rpc}/endpoints`, { endpoints: [] });
  res.json(data.endpoints || []);
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

app.get(['/v1/integrations/usage', '/integrations/usage'], async (_req, res) => {
  const data = await proxyJson<{ usage?: unknown[] }>(`${servicesBase.usage}/usage`, { usage: [] });
  res.json(data.usage || []);
});

app.get(['/v1/integrations/webhooks', '/integrations/webhooks'], async (_req, res) => {
  const data = await proxyJson<{ webhooks?: unknown[] }>(`${servicesBase.webhooks}/webhooks`, { webhooks: [] });
  res.json(data.webhooks || []);
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
