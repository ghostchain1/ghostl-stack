import type { ChainInfo, Node, NodeMetrics, Alert, LogEvent } from '@ghostl/types';
import type { PrometheusAlert, PrometheusVectorResult } from '../clients/prometheus';
import { PrometheusClient } from '../clients/prometheus';
import { GrafanaClient } from '../clients/grafana';
import { RelayerClient } from '../clients/relayer';
import { LokiClient } from '../clients/loki';
import { GuardClient } from '../clients/guard';
import { AlertmanagerClient } from '../clients/alertmanager';
import type {
  ChainStatusService,
  ConsensusTelemetryService,
  PeerGraphService
} from '../modules/chain/services';
import type { NodeHealthService, NodeInventoryService } from '../modules/nodes/services';
import type {
  AlertRulesService,
  LogsService,
  MetricsService,
  NotificationRouterService
} from '../modules/observability/services';
import type { ReleaseService, ForkSchedulerService } from '../modules/devops/services';
import type { Release, ForkEvent } from '@ghostl/types/devops';

const parsePromValue = (value?: [number, string]) => {
  if (!value) return undefined;
  const parsed = parseFloat(value[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const queryNumber = async (client: PrometheusClient, query: string) => {
  try {
    const result = await client.query(query);
    return parsePromValue(result[0]?.value);
  } catch {
    return undefined;
  }
};

const readJsonEnv = <T>(key: string): T | undefined => {
  const raw = process.env[key];
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};

type GuardAlert = {
  tx?: string;
  nonce?: string;
  from?: string;
  to?: string;
  amountWei?: string;
  reasons?: string[];
  ts?: number;
};

export const createLiveServices = (deps: {
  prometheus: PrometheusClient;
  grafana: GrafanaClient;
  relayer: RelayerClient;
  loki?: LokiClient;
  guard?: GuardClient;
  alertmanager?: AlertmanagerClient;
}) => {
  const nodeJobsSelector =
    process.env.PROM_NODE_JOB_SELECTOR ||
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
  const participationQuery = process.env.PROM_PARTICIPATION_QUERY || 'op_gate_participation_rate';
  const latencyP50Query = process.env.PROM_LATENCY_P50_QUERY || 'op_gate_network_latency_ms';

  const chainStatusService: ChainStatusService = {
    async getChainInfo(): Promise<ChainInfo> {
      const defaultInfo: ChainInfo = {
        chainId: process.env.CHAIN_ID || '901',
        name: process.env.CHAIN_NAME || 'GhostL2 Devnet',
        env: process.env.CHAIN_ENV || 'devnet',
        consensus: process.env.CONSENSUS || 'OP-Stack'
      };
      return defaultInfo;
    },
    async getEpochInfo() {
      const current = (await queryNumber(deps.prometheus, epochQuery)) || 0;
      return { epoch: current, round: 0, start: '', end: '' };
    },
    async getBlockTimeMs() {
      const val =
        (await queryNumber(deps.prometheus, 'op_gate_block_time_seconds')) ||
        (await queryNumber(deps.prometheus, 'block_time_seconds'));
      return (val || 2) * 1000;
    },
    async getFinalityLag() {
      const head = await queryNumber(deps.prometheus, blockHeightQuery);
      const finalized = await queryNumber(deps.prometheus, finalizedHeightQuery);
      if (head && finalized) return head - finalized;
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
      } catch {
        return [];
      }
    }
  };

  const consensusTelemetryService: ConsensusTelemetryService = {
    async getParticipationRate() {
      const val = await queryNumber(deps.prometheus, participationQuery);
      if (val !== undefined) return val;
      return (await queryNumber(deps.prometheus, 'participation_rate')) || 0;
    },
    async getLatencyMetrics() {
      const latency =
        (await queryNumber(deps.prometheus, latencyP50Query)) ||
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

  const peerGraphService: PeerGraphService = {
    async listPeers() {
      try {
        const result = await deps.prometheus.query('peer_count');
        return result.map((item) => ({
          id: item.metric.peer || item.metric.instance || 'peer',
          address: item.metric.instance || '',
          latencyMs: parsePromValue(item.value)
        }));
      } catch {
        return [];
      }
    },
    async getTopology() {
      return { generatedAt: Date.now() };
    }
  };

  const configuredNodes = readJsonEnv<Node[]>('NODE_INVENTORY');
  const defaultNodes: Node[] = [
    { id: 'ghostl1', type: 'full', host: 'localhost:8545', version: 'local', status: 'online' },
    { id: 'ghostl2', type: 'validator', host: 'localhost:9545', version: 'local', status: 'online' },
    { id: 'ghostl3', type: 'validator', host: 'localhost:10545', version: 'local', status: 'online' }
  ];
  const listNodes = async (): Promise<Node[]> => {
    if (configuredNodes) return configuredNodes;
    return defaultNodes;
  };

  const nodeInventoryService: NodeInventoryService = {
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
    async get(id: string) {
      const list = await listNodes();
      return list.find((n) => n.id === id) || null;
    },
    async create(input) {
      const list = await listNodes();
      const node: Node = { id: input.host, status: 'online', lastSeenAt: new Date().toISOString(), ...input } as Node;
      list.push(node);
      return node;
    },
    async update(id, input) {
      const list = await listNodes();
      const node = list.find((n) => n.id === id);
      if (!node) throw new Error('node not found');
      Object.assign(node, input);
      return node;
    }
  };

  const nodeHealthService: NodeHealthService = {
    async getHealth(id: string): Promise<NodeMetrics> {
      const instance = id;
      let cpuResult: PrometheusVectorResult[] = [];
      let memResult: PrometheusVectorResult[] = [];
      let diskResult: PrometheusVectorResult[] = [];
      let iopsResult: PrometheusVectorResult[] = [];
      let peersResult: PrometheusVectorResult[] = [];
      let lagResult: PrometheusVectorResult[] = [];
      try {
        cpuResult = await deps.prometheus.query(`node_cpu_usage_percent{instance="${instance}"}`);
        memResult = await deps.prometheus.query(`node_memory_usage_percent{instance="${instance}"}`);
        diskResult = await deps.prometheus.query(`node_filesystem_usage_percent{instance="${instance}"}`);
        iopsResult = await deps.prometheus.query(`node_disk_iops{instance="${instance}"}`);
        peersResult = await deps.prometheus.query(`peer_count{instance="${instance}"}`);
        lagResult = await deps.prometheus.query(`finality_lag_blocks{instance="${instance}"}`);
      } catch {
        // fall back to zeros
      }
      return {
        cpu: parsePromValue(cpuResult[0]?.value) || 0,
        mem: parsePromValue(memResult[0]?.value) || 0,
        disk: parsePromValue(diskResult[0]?.value) || 0,
        iops: parsePromValue(iopsResult[0]?.value),
        peers: parsePromValue(peersResult[0]?.value) || 0,
        lag: parsePromValue(lagResult[0]?.value)
      };
    },
    async getLogs(_id: string, _tail?: number) {
      return [];
    }
  };

  const metricsService: MetricsService = {
    async queryPrometheus(query: string) {
      return deps.prometheus.query(query);
    },
    async queryPrometheusRange(query: string, startMs: number, endMs: number, stepSeconds = 15) {
      return deps.prometheus.queryRange(query, startMs, endMs, stepSeconds);
    },
    async listDashboards() {
      try {
        const dashboards = await deps.grafana.listDashboards();
        return dashboards.map((d) => ({ id: String(d.id), name: d.title, url: d.url }));
      } catch {
        return [];
      }
    }
  };

  const logsService: LogsService = {
    async search(query: string, limit = 100, startMs?: number, endMs?: number): Promise<LogEvent[]> {
      if (!deps.loki) return [];
      const now = Date.now();
      const end = endMs || now;
      const start = startMs || end - 5 * 60 * 1000;
      const result = await deps.loki.queryRange(query || '{job!=""}', start * 1_000_000, end * 1_000_000, limit);
      const events: LogEvent[] = [];
      result.forEach((entry) => {
        entry.values.forEach(([ts, msg]) => {
          events.push({
            source: entry.stream.job || entry.stream.instance || 'loki',
            level: (entry.stream.level as LogEvent['level']) || 'info',
            message: msg,
            time: new Date(parseInt(ts, 10) / 1_000_000).toISOString(),
            labels: entry.stream
          });
        });
      });
      return events;
    },
    tail(_source: string, _onEvent: (event: LogEvent) => void) {
      return () => undefined;
    }
  };

  const alertRulesService: AlertRulesService = {
    async list(): Promise<Alert[]> {
      try {
        const alerts: PrometheusAlert[] = await deps.prometheus.alerts();
        return alerts.map((a) => ({
          id: a.labels?.alertname || 'alert',
          severity: (a.labels?.severity as Alert['severity']) || 'info',
          source: a.labels?.job || 'prometheus',
          state: a.state === 'firing' ? 'firing' : 'resolved',
          firedAt: a.activeAt || new Date().toISOString(),
          resolvedAt: a.value !== undefined && Number(a.value) === 0 ? new Date().toISOString() : undefined,
          labels: a.labels,
          message: a.annotations?.description || a.annotations?.summary
        }));
      } catch {
        if (deps.guard) {
          try {
            const guardAlerts = (await deps.guard.listAlerts()) as GuardAlert[];
            return guardAlerts.map((g) => ({
              id: g.tx || g.nonce || g.from || `guard-${g.ts}`,
              severity: 'critical' as Alert['severity'],
              source: 'guard',
              state: 'firing',
              firedAt: new Date(g.ts ?? Date.now()).toISOString(),
              message: g.reasons?.join(', ') || 'Guard alert',
              labels: {
                ...(g.from ? { from: g.from } : {}),
                ...(g.to ? { to: g.to } : {}),
                ...(g.amountWei ? { amountWei: g.amountWei } : {})
              }
            }));
          } catch {
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
        } catch {
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
    async resolve(_id: string) {
      return;
    }
  };

  const notificationRouterService: NotificationRouterService = {
    async listChannels() {
      return [];
    },
    async send(_alert, _channels) {
      return;
    }
  };

  const releaseService: ReleaseService = {
    async list() {
      const releasesEnv = readJsonEnv<Release[]>('DEVOPS_RELEASES');
      return releasesEnv || [];
    },
    async plan(release) {
      return { ...release, status: 'planned', components: release.components || [] };
    },
    async start(version) {
      return { version, status: 'running', components: [], startedAt: new Date().toISOString() };
    },
    async complete(version) {
      return { version, status: 'completed', components: [], completedAt: new Date().toISOString() };
    }
  };

  const forkService: ForkSchedulerService = {
    async list() {
      const forksEnv = readJsonEnv<ForkEvent[]>('DEVOPS_FORKS');
      return forksEnv || [];
    },
    async schedule(event) {
      return event;
    }
  };

  return {
    chain: { chainStatusService, consensusTelemetryService, peerGraphService },
    nodes: { nodeInventoryService, nodeHealthService },
    observability: { metricsService, logsService, alertRulesService, notificationRouterService },
    devops: { releaseService, forkService }
  };
};
