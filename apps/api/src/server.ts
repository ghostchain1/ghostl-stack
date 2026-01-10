import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import cors from 'cors';
import { fetch } from 'undici';
import nodemailer from 'nodemailer';
import type {} from './types/session';
import { Interface, JsonRpcProvider, Wallet } from 'ethers';
import type { Transfer } from '@ghostl/types/bridge';
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
import { buildDevopsRouter } from './modules/devops/router';
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
          const currentImpl = await provider.getStorageAt(proxy, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc');
          if (currentImpl.toLowerCase().endsWith(impl.toLowerCase().replace('0x', '').padStart(64, '0'))) {
            return undefined;
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
app.use(
  ['/v1/devops', '/devops'],
  buildDevopsRouter({
    releases: liveServices.devops.releaseService,
    forks: liveServices.devops.forkService
  })
);

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
    updatedAt: new Date().toISOString()
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

app.get(['/v1/api/ai', '/api/ai'], requirePermission('ai:read'), async (_req, res) => {
  const data = await proxyJson<{ networks?: unknown[] }>(`${servicesBase.ai}/anomalies`, { networks: [] });
  const sybil: { id: string; cluster: string; score: number; size: number; tags?: string[] }[] = [
    { id: 'syb-1', cluster: 'cluster-a', score: 0.82, size: 12, tags: ['new wallets', 'bridges'] },
    { id: 'syb-2', cluster: 'cluster-b', score: 0.41, size: 5, tags: ['low activity'] }
  ];
  const contractRisk: { address: string; risk: number; notes?: string[] }[] = [
    { address: env.CONTRACT_TARGET_ADDRESS || '0xcontract', risk: 0.2, notes: ['allowlisted'] }
  ];
  res.json({ networks: data.networks || [], sybil, contractRisk });
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

app.get(['/v1/explorer/mempool', '/explorer/mempool'], async (_req, res) => {
  let pending = 0;
  let queued = 0;
  try {
    const status = (await rpcCall<Record<string, string>>('txpool_status')) || {};
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

app.get(['/v1/integrations/partners', '/integrations/partners'], async (_req, res) => {
  res.json({
    partners: [
      { name: 'IndexerOne', type: 'indexer', status: 'pending', url: 'https://indexer.example.com' },
      { name: 'OracleX', type: 'oracle', status: 'connected', url: 'https://oracle.example.com' },
      { name: 'KYC Corp', type: 'kyc', status: 'error', url: 'https://kyc.example.com' }
    ]
  });
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
app.post(['/v1/webhooks/alerts', '/webhooks/alerts'], async (req, res) => {
  if (!env.ALERT_WEBHOOK_SECRET) {
    res.status(503).json({ error: 'webhook verification not configured' });
    return;
  }
  const signature = req.header('x-signature-sha256');
  const ts = req.header('x-signature-ts');
  if (!signature || !ts) {
    res.status(400).json({ error: 'missing signature headers' });
    return;
  }
  const body = JSON.stringify(req.body || {});
  const hmac = crypto.createHmac('sha256', env.ALERT_WEBHOOK_SECRET);
  hmac.update(`${ts}:${body}`);
  const expected = hmac.digest('hex');
  if (expected !== signature) {
    res.status(401).json({ error: 'invalid signature' });
    return;
  }
  res.json({ ok: true });
});
