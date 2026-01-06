import express from 'express';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import cors from 'cors';
import { fetch } from 'undici';
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
type HexString = string;

const app = express();
const FileStore = FileStoreFactory(session);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    store: new FileStore({ path: process.env.SESSION_STORE_PATH || '.sessions', retries: 1 }),
    cookie: { secure: false }
  })
);

const services = createStubServices();
const prometheus = new PrometheusClient(process.env.PROMETHEUS_URL || 'http://localhost:9090');
const grafana = new GrafanaClient(process.env.GRAFANA_URL || 'http://localhost:3000', process.env.GRAFANA_API_KEY);
const relayer = new RelayerClient(process.env.RELAYER_URL || 'http://localhost:7171');
const loki = process.env.LOKI_URL ? new LokiClient(process.env.LOKI_URL) : undefined;
const guard = process.env.GUARD_URL ? new GuardClient(process.env.GUARD_URL, process.env.GUARD_ADMIN_TOKEN) : undefined;
const alertmanager = process.env.ALERTMANAGER_URL ? new AlertmanagerClient(process.env.ALERTMANAGER_URL) : undefined;
const liveServices = createLiveServices({ prometheus, grafana, relayer, loki, guard, alertmanager });
const identityServicesPromise = createPersistentIdentityServices();

const proxyJson = async <T>(url: string, fallback: T): Promise<T> => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
};

const servicesBase = {
  bridge: process.env.BRIDGE_SERVICE_URL || 'http://localhost:7604',
  transfers: process.env.TRANSFER_SERVICE_URL || 'http://localhost:7605',
  liquidity: process.env.LIQUIDITY_SERVICE_URL || 'http://localhost:7606',
  contracts: process.env.CONTRACT_REGISTRY_URL || 'http://localhost:7608',
  contractRisk: process.env.CONTRACT_RISK_URL || 'http://localhost:7609',
  supply: process.env.SUPPLY_SERVICE_URL || 'http://localhost:7614',
  feeModel: process.env.FEE_MODEL_SERVICE_URL || 'http://localhost:7615',
  treasury: process.env.TREASURY_SERVICE_URL || 'http://localhost:7628',
  payouts: process.env.PAYOUT_SERVICE_URL || 'http://localhost:7629',
  governance: process.env.GOVERNANCE_SERVICE_URL || 'http://localhost:7645',
  validators: process.env.VALIDATOR_SERVICE_URL || 'http://localhost:7607',
  devops: process.env.DEVOPS_SERVICE_URL || 'http://localhost:7623',
  rpc: process.env.RPC_SERVICE_URL || 'http://localhost:7650',
  usage: process.env.USAGE_SERVICE_URL || 'http://localhost:7651',
  webhooks: process.env.WEBHOOKS_SERVICE_URL || 'http://localhost:7652',
  ai: process.env.AI_SERVICE_URL || 'http://localhost:7660',
  explorerRpc: process.env.EXPLORER_RPC_URL || process.env.RPC_L2 || 'http://localhost:29545'
};

app.use('/app-shell', buildAppShellRouter(services.appShell));
identityServicesPromise.then((identity) => {
  app.use('/', buildIdentityAccessRouter(identity));
});
app.use(
  '/chain',
  buildChainRouter({
    status: liveServices.chain.chainStatusService,
    telemetry: liveServices.chain.consensusTelemetryService,
    peers: liveServices.chain.peerGraphService
  })
);
app.use(
  '/nodes',
  buildNodeRouter({
    inventory: liveServices.nodes.nodeInventoryService,
    health: liveServices.nodes.nodeHealthService
  })
);
app.use(
  '/observability',
  buildObservabilityRouter({
    metrics: liveServices.observability.metricsService,
    logs: liveServices.observability.logsService,
    alerts: liveServices.observability.alertRulesService,
    notifications: liveServices.observability.notificationRouterService,
    guard: guard,
    alertProxy: alertmanager ? (payload: AlertmanagerAlert) => alertmanager.send(payload) : undefined
  })
);
app.use(
  '/stack',
  buildStackRouter({
    prometheus,
    guard,
    relayer
  })
);
app.use('/wallet', buildWalletRouter());

const rpcCall = async (method: string, params: unknown[] = []) => {
  const res = await fetch(servicesBase.explorerRpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`);
  const body = (await res.json()) as { result?: any; error?: any };
  if (body.error) throw new Error(body.error.message || 'rpc_error');
  return body.result;
};

app.get('/api/bridge', async (_req, res) => {
  const bridges = await proxyJson<{ bridges?: unknown[] }>(`${servicesBase.bridge}/bridges`, { bridges: [] });
  const transfers = await proxyJson<{ transfers?: unknown[] }>(`${servicesBase.transfers}/transfers`, { transfers: [] });
  const pools = await proxyJson<{ pools?: unknown[] }>(`${servicesBase.liquidity}/liquidity`, { pools: [] });
  res.json({ ok: true, networks: bridges.bridges || [], transfers: transfers.transfers || [], pools: pools.pools || [] });
});

app.get('/api/contracts', async (_req, res) => {
  const registry = await proxyJson<{ contracts?: any[] }>(`${servicesBase.contracts}/contracts`, { contracts: [] });
  const risks = await proxyJson<{ contracts?: any[] }>(`${servicesBase.contractRisk}/risk`, { contracts: [] });
  const merged =
    registry.contracts?.map((c) => ({
      id: c.address || c.name || 'contract',
      address: c.address,
      name: c.name,
      proxies: c.proxyType,
      ownership: c.owner,
      verified: c.verified,
      risk: risks.contracts?.find((r) => r.address === c.address)
    })) || [];
  res.json({ ok: true, networks: merged });
});

app.get('/api/token', async (_req, res) => {
  const supply = await proxyJson<{ supply?: string; emissions?: string }>(`${servicesBase.supply}/supply`, {});
  const treasury = await proxyJson<{ balance?: string }>(`${servicesBase.treasury}/treasury`, {});
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

app.get('/devops/releases', async (_req, res) => {
  const data = await proxyJson<{ releases?: unknown[] }>(`${servicesBase.devops}/releases`, { releases: [] });
  res.json(data.releases || []);
});

app.get('/devops/forks', async (_req, res) => {
  const data = await proxyJson<{ forks?: unknown[] }>(`${servicesBase.devops}/forks`, { forks: [] });
  res.json(data.forks || []);
});

app.get('/devops/upgrades', async (_req, res) => {
  const data = await proxyJson<{ upgrades?: unknown[] }>(`${servicesBase.devops}/upgrades`, { upgrades: [] });
  res.json(data.upgrades || []);
});

app.get('/governance/proposals', async (_req, res) => {
  const data = await proxyJson<{ proposals?: unknown[] }>(`${servicesBase.governance}/proposals`, { proposals: [] });
  res.json(data.proposals || []);
});

app.get('/governance/votes', async (_req, res) => {
  const data = await proxyJson<{ votes?: unknown[] }>(`${servicesBase.governance}/votes`, { votes: [] });
  res.json(data.votes || []);
});

app.get('/api/validators', async (_req, res) => {
  const data = await proxyJson<{ validators?: unknown[] }>(`${servicesBase.validators}/validators`, { validators: [] });
  res.json(data);
});

app.get('/api/ai', async (_req, res) => {
  const data = await proxyJson<{ networks?: unknown[] }>(`${servicesBase.ai}/anomalies`, { networks: [] });
  res.json(data);
});

app.get('/explorer/blocks', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  try {
    const latestHex = (await rpcCall('eth_blockNumber')) as HexString;
    const latest = parseInt(latestHex, 16);
    const blocks = await Promise.all(
      Array.from({ length: limit }, (_, i) => latest - i)
        .filter((n) => n >= 0)
        .map(async (num) => {
          const block = (await rpcCall('eth_getBlockByNumber', ['0x' + num.toString(16), true])) as any;
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

app.get('/explorer/txs', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  try {
    const latestHex = (await rpcCall('eth_blockNumber')) as HexString;
    const latest = parseInt(latestHex, 16);
    const block = (await rpcCall('eth_getBlockByNumber', ['0x' + latest.toString(16), true])) as any;
    const txs = (block.transactions || []).slice(0, limit).map((t: any) => ({
      hash: t.hash,
      from: t.from,
      to: t.to,
      value: t.value,
      gas: parseInt(t.gas, 16),
      status: 'success',
      nonce: parseInt(t.nonce, 16),
      blockNumber: latest,
      time: new Date(parseInt(block.timestamp, 16) * 1000).toISOString()
    }));
    res.json({ txs });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message, txs: [] });
  }
});

app.get('/integrations/rpc', async (_req, res) => {
  const data = await proxyJson<{ endpoints?: unknown[] }>(`${servicesBase.rpc}/endpoints`, { endpoints: [] });
  res.json(data.endpoints || []);
});

app.get('/integrations/usage', async (_req, res) => {
  const data = await proxyJson<{ usage?: unknown[] }>(`${servicesBase.usage}/usage`, { usage: [] });
  res.json(data.usage || []);
});

app.get('/integrations/webhooks', async (_req, res) => {
  const data = await proxyJson<{ webhooks?: unknown[] }>(`${servicesBase.webhooks}/webhooks`, { webhooks: [] });
  res.json(data.webhooks || []);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

const port = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`API listening on :${port}`);
  });
}

export default app;
