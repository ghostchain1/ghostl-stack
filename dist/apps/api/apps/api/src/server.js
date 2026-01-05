"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const session_file_store_1 = __importDefault(require("session-file-store"));
const cors_1 = __importDefault(require("cors"));
const router_1 = require("./modules/app-shell/router");
const router_2 = require("./modules/identity-access/router");
const router_3 = require("./modules/chain/router");
const router_4 = require("./modules/nodes/router");
const router_5 = require("./modules/observability/router");
const stubs_1 = require("./stubs");
const prometheus_1 = require("./clients/prometheus");
const grafana_1 = require("./clients/grafana");
const relayer_1 = require("./clients/relayer");
const live_1 = require("./services/live");
const auth_store_1 = require("./services/auth-store");
const loki_1 = require("./clients/loki");
const guard_1 = require("./clients/guard");
const alertmanager_1 = require("./clients/alertmanager");
const router_6 = require("./modules/stack/router");
const router_7 = require("./modules/wallet/router");
const app = (0, express_1.default)();
const FileStore = (0, session_file_store_1.default)(express_session_1.default);
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json());
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    store: new FileStore({ path: process.env.SESSION_STORE_PATH || '.sessions', retries: 1 }),
    cookie: { secure: false }
}));
const services = (0, stubs_1.createStubServices)();
const prometheus = new prometheus_1.PrometheusClient(process.env.PROMETHEUS_URL || 'http://localhost:9090');
const grafana = new grafana_1.GrafanaClient(process.env.GRAFANA_URL || 'http://localhost:3000', process.env.GRAFANA_API_KEY);
const relayer = new relayer_1.RelayerClient(process.env.RELAYER_URL || 'http://localhost:7171');
const loki = process.env.LOKI_URL ? new loki_1.LokiClient(process.env.LOKI_URL) : undefined;
const guard = process.env.GUARD_URL ? new guard_1.GuardClient(process.env.GUARD_URL, process.env.GUARD_ADMIN_TOKEN) : undefined;
const alertmanager = process.env.ALERTMANAGER_URL ? new alertmanager_1.AlertmanagerClient(process.env.ALERTMANAGER_URL) : undefined;
const liveServices = (0, live_1.createLiveServices)({ prometheus, grafana, relayer, loki, guard, alertmanager });
const identityServicesPromise = (0, auth_store_1.createPersistentIdentityServices)();
app.use('/app-shell', (0, router_1.buildAppShellRouter)(services.appShell));
identityServicesPromise.then((identity) => {
    app.use('/', (0, router_2.buildIdentityAccessRouter)(identity));
});
app.use('/chain', (0, router_3.buildChainRouter)({
    status: liveServices.chain.chainStatusService,
    telemetry: liveServices.chain.consensusTelemetryService,
    peers: liveServices.chain.peerGraphService
}));
app.use('/nodes', (0, router_4.buildNodeRouter)({
    inventory: liveServices.nodes.nodeInventoryService,
    health: liveServices.nodes.nodeHealthService
}));
app.use('/observability', (0, router_5.buildObservabilityRouter)({
    metrics: liveServices.observability.metricsService,
    logs: liveServices.observability.logsService,
    alerts: liveServices.observability.alertRulesService,
    notifications: liveServices.observability.notificationRouterService,
    guard: guard,
    alertProxy: alertmanager ? (payload) => alertmanager.send(payload) : undefined
}));
app.use('/stack', (0, router_6.buildStackRouter)({
    prometheus,
    guard,
    relayer
}));
app.use('/wallet', (0, router_7.buildWalletRouter)());
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error', message: err.message });
});
const port = process.env.PORT || 4000;
if (require.main === module) {
    app.listen(port, () => {
        console.log(`API listening on :${port}`);
    });
}
exports.default = app;
