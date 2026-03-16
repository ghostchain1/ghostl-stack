import type { LokiClient } from '../../clients/loki';
import type {
  LogAggregateResult,
  LogAnomaly,
  LogIncident,
  LogInsightReport,
  LogLayer,
  LogQuery,
  LogSeverity,
  NormalizedLogEvent,
  RiskLevel
} from '@ghostchain/types/observability';
import { flattenLokiEntries, isCriticalSeverity, normalizeLogEvents, normalizeLogEvent } from './log-helpers';
import type { AuditLog } from './services';
import { CriticalLogStore } from './critical-log-store';
import { detectLogAnomalies } from '../../../../../observability/ai/anomaly_detection';
import { analyzeRootCause } from '../../../../../observability/ai/root_cause_analysis';
import { summarizeLogIncidents } from '../../../../../observability/ai/incident_summarizer';

export interface LogIntelDeps {
  loki?: LokiClient;
  anomalyUrl?: string;
  explainabilityUrl?: string;
  auditLog?: AuditLog;
  criticalStore?: CriticalLogStore;
  maxLimit?: number;
}

const parseList = (value?: string | string[]) => {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value.join(',') : value;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const filterEvents = (events: NormalizedLogEvent[], query: LogQuery) => {
  const layers = query.layers;
  const chains = query.chains;
  const components = query.components;
  const severities = query.severities;
  return events.filter((event) => {
    if (layers && layers.length && !layers.includes(event.layer)) return false;
    if (chains && chains.length && !chains.includes(event.chain)) return false;
    if (components && components.length && !components.includes(event.component)) return false;
    if (severities && severities.length && !severities.includes(event.severity)) return false;
    return true;
  });
};

const fetchJson = async <T = Record<string, unknown>>(url: string, timeoutMs = 4000): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`status_${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
};

const riskFromEvents = (events: NormalizedLogEvent[], anomalies: LogAnomaly[]): RiskLevel => {
  const critical = events.filter((event) => isCriticalSeverity(event.severity));
  if (critical.length > 0) return 'HIGH';
  if (anomalies.some((a) => a.score >= 80)) return 'HIGH';
  if (events.some((event) => event.severity === 'ERROR' || event.severity === 'CONSENSUS_RISK')) return 'MEDIUM';
  return 'LOW';
};

const recommendedActions = (events: NormalizedLogEvent[], anomalies: LogAnomaly[]): string[] => {
  const actions: string[] = [];
  if (events.some((event) => event.severity === 'SLASHING_RISK')) {
    actions.push('Pause proposer outputs and review validator slashing conditions.');
  }
  if (events.some((event) => event.severity === 'CONSENSUS_RISK')) {
    actions.push('Throttle output cadence and validate finality before submitting batches.');
  }
  if (events.some((event) => event.severity === 'SECURITY_EVENT')) {
    actions.push('Rotate affected keys and enforce vault token revocation.');
  }
  if (anomalies.length) {
    actions.push('Inspect anomaly window in logs and confirm RPC health/latency.');
  }
  if (!actions.length) actions.push('Continue monitoring. No immediate action required.');
  return actions;
};

export class LogIntelService {
  private readonly deps: LogIntelDeps;

  constructor(deps: LogIntelDeps) {
    this.deps = deps;
  }

  async query(raw: LogQuery): Promise<NormalizedLogEvent[]> {
    if (!this.deps.loki) return [];
    const now = Date.now();
    const startMs = raw.startMs ?? now - 5 * 60 * 1000;
    const endMs = raw.endMs ?? now;
    const maxLimit = this.deps.maxLimit ?? 500;
    const limit = Math.min(raw.limit ?? 200, maxLimit);
    const query = raw.q || '{job!=""}';
    const entries = await this.deps.loki.queryRange(query, startMs * 1_000_000, endMs * 1_000_000, limit);
    const flattened = flattenLokiEntries(entries);
    const normalized = normalizeLogEvents(flattened);
    const filtered = filterEvents(normalized, raw);
    filtered.sort((a, b) => {
      const aTs = Number(a.timestampNs || Date.parse(a.timestamp) * 1_000_000);
      const bTs = Number(b.timestampNs || Date.parse(b.timestamp) * 1_000_000);
      return bTs - aTs;
    });
    const sliced = filtered.slice(0, limit);
    this.deps.criticalStore?.appendMany(sliced.filter((event) => isCriticalSeverity(event.severity)));
    return sliced;
  }

  async aggregate(raw: LogQuery, groupBy: 'component' | 'severity' | 'layer' | 'chain' | 'event'): Promise<LogAggregateResult> {
    const events = await this.query(raw);
    const buckets = new Map<string, { count: number; severityCounts: Record<LogSeverity, number> }>();
    events.forEach((event) => {
      const key = event[groupBy] || 'unknown';
      if (!buckets.has(key)) {
        buckets.set(key, {
          count: 0,
          severityCounts: {
            INFO: 0,
            WARN: 0,
            ERROR: 0,
            CRITICAL: 0,
            SLASHING_RISK: 0,
            CONSENSUS_RISK: 0,
            SECURITY_EVENT: 0,
            AI_DECISION: 0
          }
        });
      }
      const entry = buckets.get(key)!;
      entry.count += 1;
      entry.severityCounts[event.severity] += 1;
    });
    return {
      total: events.length,
      buckets: Array.from(buckets.entries()).map(([key, value]) => ({
        key,
        count: value.count,
        severityCounts: value.severityCounts
      }))
    };
  }

  async incidents(raw: LogQuery): Promise<LogIncident[]> {
    const events = await this.query(raw);
    return summarizeLogIncidents(events);
  }

  async insights(raw: LogQuery): Promise<LogInsightReport> {
    const events = await this.query({ ...raw, limit: Math.min(raw.limit || 200, this.deps.maxLimit || 500) });
    let anomalies: LogAnomaly[] = detectLogAnomalies(events);
    if (this.deps.anomalyUrl) {
      try {
        const resp = await fetchJson<{ anomalies?: any[] }>(`${this.deps.anomalyUrl}/anomalies`);
        const external =
          resp?.anomalies?.map((entry: any) => ({
            id: String(entry.id || entry.entity || 'anomaly'),
            score: Number(entry.score || 0),
            reason: (entry.reasons || []).join(', ') || 'anomaly_detected',
            time: new Date(entry.time || Date.now()).toISOString(),
            layer: entry.layer,
            chain: entry.chain,
            component: entry.component,
            traceId: entry.trace_id || entry.traceId
          })) || [];
        const seen = new Set(anomalies.map((a) => a.id));
        external.forEach((entry: LogAnomaly) => {
          if (!seen.has(entry.id)) anomalies.push(entry);
        });
      } catch {
        // keep local anomalies
      }
    }
    let explanations: LogInsightReport['explanations'] = [];
    if (this.deps.explainabilityUrl) {
      try {
        const resp = await fetchJson<{ explanations?: any[] }>(`${this.deps.explainabilityUrl}/explain`);
        explanations =
          resp?.explanations?.map((entry: any) => ({
            id: String(entry.id || entry.metric || 'explain'),
            summary: `${entry.metric || 'metric'}=${entry.value}`,
            confidence: 0.6,
            evidence: entry.reasons || [],
            metrics: entry.value ? { [entry.metric || 'metric']: Number(entry.value) } : undefined
          })) || [];
      } catch {
        explanations = [];
      }
    }
    explanations = [...explanations, ...analyzeRootCause(events)];
    const incidents = await this.incidents(raw);
    const riskLevel = riskFromEvents(events, anomalies);
    const recommended = recommendedActions(events, anomalies);
    const report: LogInsightReport = {
      generatedAt: new Date().toISOString(),
      riskLevel,
      incidents,
      anomalies,
      explanations,
      recommendedActions: recommended
    };
    if (this.deps.auditLog) {
      await this.deps.auditLog.append({
        actorId: 'system',
        action: 'observability:ai:report',
        resource: `risk:${riskLevel}`,
        meta: { incidents: incidents.length, anomalies: anomalies.length }
      });
    }
    if (events.length) {
      const aiEvent = normalizeLogEvent(
        {
          source: 'observability-ai',
          level: 'info',
          message: `ai_decision risk=${riskLevel} incidents=${incidents.length} anomalies=${anomalies.length}`,
          time: new Date().toISOString(),
          labels: { component: 'observability-ai', layer: 'infra' }
        },
        String(Date.now() * 1_000_000)
      );
      this.deps.criticalStore?.append(aiEvent);
    }
    return report;
  }

  async correlation(raw: LogQuery) {
    const events = await this.query(raw);
    const traces: Record<string, NormalizedLogEvent[]> = {};
    const layerCounts: Record<LogLayer, number> = { L1: 0, L2: 0, L3: 0, INFRA: 0, UNKNOWN: 0 };
    events.forEach((event) => {
      const trace = event.traceId || 'unlinked';
      if (!traces[trace]) traces[trace] = [];
      traces[trace].push(event);
      layerCounts[event.layer] = (layerCounts[event.layer] || 0) + 1;
    });
    Object.values(traces).forEach((group) =>
      group.sort((a, b) => {
        const aTs = Number(a.timestampNs || Date.parse(a.timestamp) * 1_000_000);
        const bTs = Number(b.timestampNs || Date.parse(b.timestamp) * 1_000_000);
        return aTs - bTs;
      })
    );
    return {
      traces,
      layerCounts,
      total: events.length
    };
  }

  tail(raw: LogQuery, onEvent: (event: NormalizedLogEvent) => void) {
    if (!this.deps.loki) return () => undefined;
    let active = true;
    let lastNs = Date.now() * 1_000_000;
    const interval = setInterval(async () => {
      if (!active) return;
      const endNs = Date.now() * 1_000_000;
      try {
        const entries = await this.deps.loki!.queryRange(raw.q || '{job!=""}', lastNs, endNs, 200);
        const flattened = flattenLokiEntries(entries);
        const normalized = normalizeLogEvents(flattened);
        const filtered = filterEvents(normalized, raw);
        filtered.sort((a, b) => {
          const aTs = Number(a.timestampNs || Date.parse(a.timestamp) * 1_000_000);
          const bTs = Number(b.timestampNs || Date.parse(b.timestamp) * 1_000_000);
          return aTs - bTs;
        });
        filtered.forEach((event) => onEvent(event));
        if (filtered.length) {
          const maxNs = Math.max(
            ...filtered.map((event) => Number(event.timestampNs || Date.parse(event.timestamp) * 1_000_000))
          );
          lastNs = maxNs + 1;
          this.deps.criticalStore?.appendMany(filtered.filter((event) => isCriticalSeverity(event.severity)));
        } else {
          lastNs = endNs;
        }
      } catch {
        // swallow; next poll will retry
      }
    }, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }

  static parseQueryParams(input: Record<string, string | string[] | undefined>): LogQuery {
    const limit = input.limit ? Number(input.limit) : undefined;
    return {
      q: typeof input.q === 'string' ? input.q : undefined,
      layers: parseList(input.layers) as LogLayer[] | undefined,
      chains: parseList(input.chains),
      components: parseList(input.components),
      severities: parseList(input.severities) as LogSeverity[] | undefined,
      startMs: input.start ? Number(input.start) : undefined,
      endMs: input.end ? Number(input.end) : undefined,
      limit: Number.isFinite(limit) ? limit : undefined
    };
  }
}
