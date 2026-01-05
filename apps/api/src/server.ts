import express from 'express';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import cors from 'cors';
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
import { buildStackRouter } from './modules/stack/router';
import { buildWalletRouter } from './modules/wallet/router';

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
    alertProxy: alertmanager ? (payload) => alertmanager.send(payload) : undefined
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
