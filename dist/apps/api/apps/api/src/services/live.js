"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLiveServices = void 0;
const parsePromValue = (value) => {
    if (!value)
        return undefined;
    const parsed = parseFloat(value[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const queryNumber = async (client, query) => {
    try {
        const result = await client.query(query);
        return parsePromValue(result[0]?.value);
    }
    catch {
        return undefined;
    }
};
const readJsonEnv = (key) => {
    const raw = process.env[key];
    if (!raw)
        return undefined;
    try {
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
};
const createLiveServices = (deps) => {
    const nodeJobsSelector = process.env.PROM_NODE_JOB_SELECTOR ||
        'ghost-guard|ghost-relayer|rollup-proposer-l2|rollup-proposer-l3|rollup-challenger-l2|rollup-challenger-l3|opstack-node|opstack-batcher|opstack-proposer|op-gate';
    const guardMetrics = {
        depositsSeen: 'ghost_guard_deposits_seen_total',
        alertsTotal: 'ghost_guard_alerts_total',
        allowDecisions: 'op_gate_guard_decisions{result="allow"}'
    };
    const relayerMetrics = {
        depositsSeen: 'ghost_relayer_deposits_seen_total',
        finalized: 'ghost_relayer_finalized_total',
        errors: 'ghost_relayer_errors_total'
    };
    const blockHeightQuery = process.env.PROM_BLOCK_HEIGHT_QUERY || 'op_gate_head_block';
    const finalizedHeightQuery = process.env.PROM_FINALIZED_HEIGHT_QUERY || 'op_gate_finalized_block';
    const epochQuery = process.env.PROM_EPOCH_QUERY || 'epoch_number';
    const chainStatusService = {
        async getChainInfo() {
            const defaultInfo = {
                chainId: process.env.CHAIN_ID || '7192',
                name: process.env.CHAIN_NAME || 'GhostL2',
                env: process.env.CHAIN_ENV || 'local',
                consensus: process.env.CONSENSUS || 'IBFT'
            };
            return defaultInfo;
        },
        async getEpochInfo() {
            const current = (await queryNumber(deps.prometheus, epochQuery)) || 0;
            return { epoch: current, round: 0, start: '', end: '' };
        },
        async getBlockTimeMs() {
            const val = (await queryNumber(deps.prometheus, 'op_gate_block_time_seconds')) ||
                (await queryNumber(deps.prometheus, 'block_time_seconds'));
            return (val || 0) * 1000;
        },
        async getFinalityLag() {
            const head = await queryNumber(deps.prometheus, blockHeightQuery);
            const finalized = await queryNumber(deps.prometheus, finalizedHeightQuery);
            if (head && finalized)
                return head - finalized;
            const val = await queryNumber(deps.prometheus, 'finality_lag_blocks');
            return val || 0;
        },
        async getReorgEvents(limit = 10) {
            try {
                const result = await deps.prometheus.query('reorg_events_total');
                return result.slice(0, limit).map((item) => ({
                    depth: parseInt(item.metric.depth || '0', 10),
                    fromBlock: parseInt(item.metric.from || '0', 10),
                    toBlock: parseInt(item.metric.to || '0', 10),
                    time: new Date().toISOString()
                }));
            }
            catch {
                return [];
            }
        }
    };
    const consensusTelemetryService = {
        async getParticipationRate() {
            const val = await queryNumber(deps.prometheus, 'op_gate_participation_rate');
            if (val !== undefined)
                return val;
            return (await queryNumber(deps.prometheus, 'participation_rate')) || 0;
        },
        async getLatencyMetrics() {
            const latency = (await queryNumber(deps.prometheus, 'op_gate_network_latency_ms')) ||
                (await queryNumber(deps.prometheus, 'network_latency_ms'));
            return { p50: latency || 0 };
        },
        async getHealthSummary() {
            const up = await deps.prometheus.query(`up{job=~"${nodeJobsSelector}"}`);
            const guardDeposits = await queryNumber(deps.prometheus, guardMetrics.depositsSeen);
            const guardAlerts = await queryNumber(deps.prometheus, guardMetrics.alertsTotal);
            const relayerFinalized = await queryNumber(deps.prometheus, relayerMetrics.finalized);
            const relayerErrors = await queryNumber(deps.prometheus, relayerMetrics.errors);
            const allowDecisions = await queryNumber(deps.prometheus, guardMetrics.allowDecisions);
            const head = await queryNumber(deps.prometheus, blockHeightQuery);
            const finalized = await queryNumber(deps.prometheus, finalizedHeightQuery);
            return {
                timestamp: Date.now(),
                services: up.map((s) => ({ job: s.metric.job, instance: s.metric.instance, up: s.value?.[1] === '1' })),
                guard: { deposits: guardDeposits || 0, alerts: guardAlerts || 0, allowDecisions: allowDecisions || 0 },
                relayer: { finalized: relayerFinalized || 0, errors: relayerErrors || 0 },
                chain: { head: head || 0, finalized: finalized || 0 }
            };
        }
    };
    const peerGraphService = {
        async listPeers() {
            try {
                const result = await deps.prometheus.query('peer_count');
                return result.map((item) => ({
                    id: item.metric.peer || item.metric.instance || 'peer',
                    address: item.metric.instance || '',
                    latencyMs: parsePromValue(item.value)
                }));
            }
            catch {
                return [];
            }
        },
        async getTopology() {
            return { generatedAt: Date.now() };
        }
    };
    const configuredNodes = readJsonEnv('NODE_INVENTORY');
    const defaultNodes = [
        { id: 'ghostl1', type: 'full', host: 'localhost:8545', version: 'local', status: 'online' },
        { id: 'ghostl2', type: 'validator', host: 'localhost:9545', version: 'local', status: 'online' },
        { id: 'ghostl3', type: 'validator', host: 'localhost:10545', version: 'local', status: 'online' }
    ];
    const listNodes = async () => {
        if (configuredNodes)
            return configuredNodes;
        return defaultNodes;
    };
    const nodeInventoryService = {
        async list() {
            const list = await listNodes();
            const statuses = await deps.prometheus.query(`up{job=~"${nodeJobsSelector}"}`);
            return list.map((node) => {
                const match = statuses.find((s) => s.metric.instance?.includes(node.host));
                if (match) {
                    node.status = match.value?.[1] === '1' ? 'online' : 'offline';
                    const ts = String(match.value?.[0] ?? '0');
                    node.lastSeenAt = new Date(parseFloat(ts) * 1000).toISOString();
                }
                return node;
            });
        },
        async get(id) {
            const list = await listNodes();
            return list.find((n) => n.id === id) || null;
        },
        async create(input) {
            const list = await listNodes();
            const node = { id: input.host, status: 'online', lastSeenAt: new Date().toISOString(), ...input };
            list.push(node);
            return node;
        },
        async update(id, input) {
            const list = await listNodes();
            const node = list.find((n) => n.id === id);
            if (!node)
                throw new Error('node not found');
            Object.assign(node, input);
            return node;
        }
    };
    const nodeHealthService = {
        async getHealth(id) {
            let cpuResult = [];
            let peersResult = [];
            let lagResult = [];
            try {
                cpuResult = await deps.prometheus.query(`node_cpu_usage_percent{instance="${id}"}`);
                peersResult = await deps.prometheus.query(`peer_count{instance="${id}"}`);
                lagResult = await deps.prometheus.query(`finality_lag_blocks{instance="${id}"}`);
            }
            catch {
                // fall back to zeros
            }
            return {
                cpu: parsePromValue(cpuResult[0]?.value) || 0,
                mem: 0,
                disk: 0,
                iops: undefined,
                peers: parsePromValue(peersResult[0]?.value) || 0,
                lag: parsePromValue(lagResult[0]?.value)
            };
        },
        async getLogs(_id, _tail) {
            return [];
        }
    };
    const metricsService = {
        async queryPrometheus(query) {
            return deps.prometheus.query(query);
        },
        async queryPrometheusRange(query, startMs, endMs, stepSeconds = 15) {
            return deps.prometheus.queryRange(query, startMs, endMs, stepSeconds);
        },
        async listDashboards() {
            try {
                const dashboards = await deps.grafana.listDashboards();
                return dashboards.map((d) => ({ id: String(d.id), name: d.title, url: d.url }));
            }
            catch {
                return [];
            }
        }
    };
    const logsService = {
        async search(query, limit = 100, startMs, endMs) {
            if (!deps.loki)
                return [];
            const now = Date.now();
            const end = endMs || now;
            const start = startMs || end - 5 * 60 * 1000;
            const result = await deps.loki.queryRange(query || '{job!=\"\"}', start * 1_000_000, end * 1_000_000, limit);
            const events = [];
            result.forEach((entry) => {
                entry.values.forEach(([ts, msg]) => {
                    events.push({
                        source: entry.stream.job || entry.stream.instance || 'loki',
                        level: entry.stream.level || 'info',
                        message: msg,
                        time: new Date(parseInt(ts, 10) / 1_000_000).toISOString(),
                        labels: entry.stream
                    });
                });
            });
            return events;
        },
        tail(_source, _onEvent) {
            return () => undefined;
        }
    };
    const alertRulesService = {
        async list() {
            try {
                const alerts = await deps.prometheus.alerts();
                return alerts.map((a) => ({
                    id: a.labels?.alertname || 'alert',
                    severity: a.labels?.severity || 'info',
                    source: a.labels?.job || 'prometheus',
                    state: a.state === 'firing' ? 'firing' : 'resolved',
                    firedAt: a.activeAt,
                    resolvedAt: a.value === 0 ? new Date().toISOString() : undefined,
                    labels: a.labels,
                    message: a.annotations?.description || a.annotations?.summary
                }));
            }
            catch {
                if (deps.guard) {
                    try {
                        const guardAlerts = (await deps.guard.listAlerts());
                        return guardAlerts.map((g) => ({
                            id: g.tx || g.nonce || g.from || `guard-${g.ts}`,
                            severity: 'critical',
                            source: 'guard',
                            state: 'firing',
                            firedAt: new Date(g.ts || Date.now()).toISOString(),
                            message: g.reasons?.join(', ') || 'Guard alert',
                            labels: { from: g.from, to: g.to, amountWei: g.amountWei }
                        }));
                    }
                    catch {
                        return [];
                    }
                }
                return [];
            }
        },
        async create(rule) {
            if (deps.alertmanager) {
                try {
                    await deps.alertmanager.send(rule);
                }
                catch {
                    // fall back to synthetic response
                }
            }
            const id = `rule-${Date.now()}`;
            return {
                ...rule,
                id,
                state: 'firing',
                firedAt: new Date().toISOString()
            };
        },
        async resolve(_id) {
            return;
        }
    };
    const notificationRouterService = {
        async listChannels() {
            return [];
        },
        async send(_alert, _channels) {
            return;
        }
    };
    return {
        chain: { chainStatusService, consensusTelemetryService, peerGraphService },
        nodes: { nodeInventoryService, nodeHealthService },
        observability: { metricsService, logsService, alertRulesService, notificationRouterService }
    };
};
exports.createLiveServices = createLiveServices;
