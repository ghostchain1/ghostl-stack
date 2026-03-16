'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Button, Card } from '@ghostchain/ui';
import { resolveApiBase } from '../../../src/lib/runtime';
import type {
  LogAggregateResult,
  LogInsightReport,
  LogLayer,
  LogSeverity,
  NormalizedLogEvent
} from '@ghostl/types/observability';

const API_URL = resolveApiBase();
const DEFAULT_QUERY = '{job!=""}';
const DEFAULT_LIMIT = 200;

const LAYERS: LogLayer[] = ['L1', 'L2', 'L3', 'INFRA'];
const CHAINS = ['GhostChain', 'GhostL2', 'GhostL3'];
const SEVERITIES: LogSeverity[] = [
  'INFO',
  'WARN',
  'ERROR',
  'CRITICAL',
  'SLASHING_RISK',
  'CONSENSUS_RISK',
  'SECURITY_EVENT',
  'AI_DECISION'
];

const severityTone: Record<LogSeverity, 'default' | 'warning' | 'critical' | 'success'> = {
  INFO: 'default',
  WARN: 'warning',
  ERROR: 'critical',
  CRITICAL: 'critical',
  SLASHING_RISK: 'critical',
  CONSENSUS_RISK: 'warning',
  SECURITY_EVENT: 'critical',
  AI_DECISION: 'success'
};

type Filters = {
  query: string;
  layers: LogLayer[];
  chains: string[];
  components: string[];
  severities: LogSeverity[];
  limit: number;
  start: string;
  end: string;
};

type CorrelationResponse = {
  traces: Record<string, NormalizedLogEvent[]>;
  layerCounts: Record<LogLayer, number>;
  total: number;
};

const parseListParam = (value?: string | null): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const toDateTimeLocal = (ms: number) => {
  const date = new Date(ms);
  const offset = date.getTimezoneOffset();
  const local = new Date(ms - offset * 60_000);
  return local.toISOString().slice(0, 16);
};

const fromDateTimeLocal = (value: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.valueOf();
};

const buildParams = (filters: Filters) => {
  const params = new URLSearchParams();
  if (filters.query) params.set('q', filters.query);
  if (filters.layers.length) params.set('layers', filters.layers.join(','));
  if (filters.chains.length) params.set('chains', filters.chains.join(','));
  if (filters.components.length) params.set('components', filters.components.join(','));
  if (filters.severities.length) params.set('severities', filters.severities.join(','));
  if (filters.limit) params.set('limit', String(filters.limit));
  const startMs = fromDateTimeLocal(filters.start);
  const endMs = fromDateTimeLocal(filters.end);
  if (startMs) params.set('start', String(startMs));
  if (endMs) params.set('end', String(endMs));
  return params;
};

const exportJson = (events: NormalizedLogEvent[]) => {
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `observability-logs-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

const exportCsv = (events: NormalizedLogEvent[]) => {
  const headers = [
    'timestamp',
    'layer',
    'chain',
    'component',
    'severity',
    'event',
    'message',
    'traceId',
    'requestId',
    'txHash',
    'blockNumber',
    'nodeId'
  ];
  const rows = events.map((event) =>
    headers
      .map((key) => {
        const value = (event as unknown as Record<string, unknown>)[key];
        return JSON.stringify(value ?? '');
      })
      .join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `observability-logs-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

export default function LogsPage() {
  return (
    <Suspense fallback={<div className="content"><span className="muted">Loading logs...</span></div>}>
      <LogsConsole />
    </Suspense>
  );
}

function LogsConsole() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [logs, setLogs] = useState<NormalizedLogEvent[]>([]);
  const [insights, setInsights] = useState<LogInsightReport | null>(null);
  const [severityAgg, setSeverityAgg] = useState<LogAggregateResult | null>(null);
  const [componentAgg, setComponentAgg] = useState<LogAggregateResult | null>(null);
  const [correlation, setCorrelation] = useState<CorrelationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const initialFilters = useMemo<Filters>(() => {
    const startDefault = toDateTimeLocal(Date.now() - 15 * 60 * 1000);
    const endDefault = toDateTimeLocal(Date.now());
    return {
      query: searchParams?.get('q') || DEFAULT_QUERY,
      layers: parseListParam(searchParams?.get('layers')) as LogLayer[],
      chains: parseListParam(searchParams?.get('chains')),
      components: parseListParam(searchParams?.get('components')),
      severities: parseListParam(searchParams?.get('severities')) as LogSeverity[],
      limit: Number(searchParams?.get('limit')) || DEFAULT_LIMIT,
      start: searchParams?.get('start') ? toDateTimeLocal(Number(searchParams.get('start'))) : startDefault,
      end: searchParams?.get('end') ? toDateTimeLocal(Number(searchParams.get('end'))) : endDefault
    };
  }, [searchParams]);

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [applied, setApplied] = useState<Filters>(initialFilters);

  const applyFilters = useCallback(() => {
    if (streaming) stopStream();
    setApplied(filters);
  }, [filters, streaming]);

  useEffect(() => {
    const params = buildParams(applied);
    router.replace(`?${params.toString()}`);
  }, [applied, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildParams(applied);
      const [logsRes, sevRes, compRes, insightsRes, corrRes] = await Promise.all([
        fetch(`${API_URL}/observability/logs/api/query?${params.toString()}`, { credentials: 'include' }),
        fetch(`${API_URL}/observability/logs/api/aggregate?${params.toString()}&groupBy=severity`, { credentials: 'include' }),
        fetch(`${API_URL}/observability/logs/api/aggregate?${params.toString()}&groupBy=component`, { credentials: 'include' }),
        fetch(`${API_URL}/observability/logs/api/insights?${params.toString()}`, { credentials: 'include' }),
        fetch(`${API_URL}/observability/logs/api/correlation?${params.toString()}`, { credentials: 'include' })
      ]);
      if (!logsRes.ok) throw new Error(`HTTP ${logsRes.status}`);
      const logsJson = (await logsRes.json()) as NormalizedLogEvent[];
      setLogs(logsJson);
      if (sevRes.ok) setSeverityAgg((await sevRes.json()) as LogAggregateResult);
      if (compRes.ok) setComponentAgg((await compRes.json()) as LogAggregateResult);
      if (insightsRes.ok) setInsights((await insightsRes.json()) as LogInsightReport);
      if (corrRes.ok) setCorrelation((await corrRes.json()) as CorrelationResponse);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load logs';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    load();
    return () => stopStream();
  }, [load]);

  const startStream = () => {
    if (eventSourceRef.current) return;
    const params = buildParams(applied);
    const es = new EventSource(`${API_URL}/observability/logs/api/stream?${params.toString()}`, { withCredentials: true });
    es.onmessage = (evt) => {
      try {
        const log = JSON.parse(evt.data) as NormalizedLogEvent;
        setLogs((prev) => {
          const seen = new Set<string>();
          const next = [log, ...prev].filter((entry) => {
            if (seen.has(entry.id)) return false;
            seen.add(entry.id);
            return true;
          });
          return next.slice(0, 2000);
        });
      } catch {
        // ignore malformed events
      }
    };
    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setStreaming(false);
    };
    eventSourceRef.current = es;
    setStreaming(true);
  };

  const stopStream = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setStreaming(false);
  };

  const layerCounts = correlation?.layerCounts || { L1: 0, L2: 0, L3: 0, INFRA: 0, UNKNOWN: 0 };
  const components = componentAgg?.buckets?.slice(0, 12) || [];

  return (
    <div className="content">
      <Card title="Observability Logs" subtitle="Unified, AI-assisted logging across GhostChain, GhostL2, GhostL3">
        <div className="stack" style={{ gap: 12 }}>
          <div className="inline-form" style={{ flexWrap: 'wrap' }}>
            <input
              className="input"
              value={filters.query}
              onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
              placeholder="LogQL query"
              style={{ minWidth: 280, flex: 1 }}
            />
            <input
              className="input"
              type="number"
              min={50}
              max={2000}
              value={filters.limit}
              onChange={(e) => setFilters((prev) => ({ ...prev, limit: Number(e.target.value) }))}
              style={{ width: 120 }}
            />
            <input
              className="input"
              type="datetime-local"
              value={filters.start}
              onChange={(e) => setFilters((prev) => ({ ...prev, start: e.target.value }))}
            />
            <input
              className="input"
              type="datetime-local"
              value={filters.end}
              onChange={(e) => setFilters((prev) => ({ ...prev, end: e.target.value }))}
            />
            <Button variant="secondary" onClick={applyFilters} disabled={loading}>
              Apply
            </Button>
            <Button variant="secondary" onClick={load} disabled={loading}>
              Refresh
            </Button>
            {!streaming ? (
              <Button onClick={startStream}>Live</Button>
            ) : (
              <Button variant="secondary" onClick={stopStream}>
                Stop
              </Button>
            )}
            <Button variant="secondary" onClick={() => exportJson(logs)}>
              Export JSON
            </Button>
            <Button variant="secondary" onClick={() => exportCsv(logs)}>
              Export CSV
            </Button>
          </div>
          <div className="inline-form" style={{ flexWrap: 'wrap' }}>
            <FilterGroup
              title="Layers"
              values={LAYERS}
              selected={filters.layers}
              onToggle={(value) => toggleFilter(value, filters.layers, (next) => setFilters((prev) => ({ ...prev, layers: next })))}
            />
            <FilterGroup
              title="Chains"
              values={CHAINS}
              selected={filters.chains}
              onToggle={(value) => toggleFilter(value, filters.chains, (next) => setFilters((prev) => ({ ...prev, chains: next })))}
            />
            <FilterGroup
              title="Severity"
              values={SEVERITIES}
              selected={filters.severities}
              onToggle={(value) =>
                toggleFilter(value, filters.severities, (next) => setFilters((prev) => ({ ...prev, severities: next })))}
            />
            <div className="stack" style={{ gap: 4 }}>
              <span className="muted">Components</span>
              <input
                className="input"
                value={filters.components.join(', ')}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    components: e.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean)
                  }))
                }
                placeholder="proposer, batcher, rpc"
                style={{ minWidth: 220 }}
              />
              <div className="log-chips">
                {components.map((bucket) => (
                  <button
                    key={bucket.key}
                    className="chip"
                    onClick={() =>
                      toggleFilter(bucket.key, filters.components, (next) => setFilters((prev) => ({ ...prev, components: next })))}
                  >
                    {bucket.key} ({bucket.count})
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="logs-grid">
        <Card title="Live Log Stream" subtitle={streaming ? 'Streaming from Loki' : 'Query results'}>
          {loading && <span className="muted">Loading...</span>}
          {error && <span className="muted" style={{ color: '#f87171' }}>{error}</span>}
          <SeveritySummary aggregate={severityAgg} />
          <VirtualLogList
            items={logs}
            height={520}
            rowHeight={84}
            renderItem={(log) => <LogRow key={log.id} log={log} />}
          />
          {!logs.length && !loading && <span className="muted">No logs available for the selected window.</span>}
        </Card>

        <div className="stack" style={{ gap: 16 }}>
          <Card title="AI Incident Center" subtitle={insights?.riskLevel ? `Risk: ${insights.riskLevel}` : 'Awaiting data'}>
            <AiInsightsPanel insights={insights} />
          </Card>
          <Card title="Cross-layer Flow" subtitle="L3 -> L2 -> L1 correlation">
            <FlowPanel layerCounts={layerCounts} total={correlation?.total || 0} />
          </Card>
          <Card title="Trace Correlation" subtitle="Timeline view across services">
            <TracePanel correlation={correlation} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function toggleFilter<T extends string>(
  value: T,
  selected: T[],
  apply: (next: T[]) => void
) {
  const exists = selected.includes(value);
  apply(exists ? selected.filter((item) => item !== value) : [...selected, value]);
}

function FilterGroup<T extends string>({
  title,
  values,
  selected,
  onToggle
}: {
  title: string;
  values: T[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="muted">{title}</span>
      <div className="log-chips">
        {values.map((value) => (
          <button key={value} className={`chip ${selected.includes(value) ? 'active' : ''}`} onClick={() => onToggle(value)}>
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function SeveritySummary({ aggregate }: { aggregate: LogAggregateResult | null }) {
  if (!aggregate?.buckets?.length) return null;
  return (
    <div className="log-summary">
      {aggregate.buckets.map((bucket) => (
        <div key={bucket.key} className="pill">
          <Badge tone={severityTone[bucket.key as LogSeverity] || 'default'}>{bucket.key}</Badge>
          <strong>{bucket.count}</strong>
        </div>
      ))}
    </div>
  );
}

function LogRow({ log }: { log: NormalizedLogEvent }) {
  return (
    <div className="log-row">
      <div className="stack" style={{ gap: 6 }}>
        <Badge tone={severityTone[log.severity] || 'default'}>{log.severity}</Badge>
        <span className="muted">{new Date(log.timestamp).toLocaleTimeString()}</span>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="spread">
          <strong>{log.component}</strong>
          <span className="badge">{log.layer}</span>
        </div>
        <div className="log-message log-clamp">{log.message}</div>
        <div className="log-meta">
          <span>{log.event}</span>
          {log.traceId && <span>trace:{log.traceId.slice(0, 10)}</span>}
          {log.txHash && <span>tx:{log.txHash.slice(0, 10)}</span>}
          {log.blockNumber !== undefined && <span>block:{log.blockNumber}</span>}
        </div>
      </div>
      <div className="stack" style={{ gap: 6, alignItems: 'flex-end' }}>
        <span className="badge">{log.chain}</span>
        <span className="muted">{log.nodeId || 'node: n/a'}</span>
      </div>
    </div>
  );
}

function AiInsightsPanel({ insights }: { insights: LogInsightReport | null }) {
  if (!insights) return <span className="muted">No AI insight data yet.</span>;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="pill">
        <span className="muted">Risk</span>
        <strong>{insights.riskLevel}</strong>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <strong>Recommended Actions</strong>
        {insights.recommendedActions.map((action) => (
          <div key={action} className="muted">
            - {action}
          </div>
        ))}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <strong>Incidents</strong>
        {insights.incidents.slice(0, 4).map((incident) => (
          <div key={incident.id} className="pill">
            <Badge tone={severityTone[incident.severity]}>{incident.severity}</Badge>
            <span>{incident.title}</span>
          </div>
        ))}
        {!insights.incidents.length && <span className="muted">No incidents detected.</span>}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <strong>Anomalies</strong>
        {insights.anomalies.slice(0, 4).map((anomaly) => (
          <div key={anomaly.id} className="pill">
            <span>{anomaly.reason}</span>
            <span className="muted">score {anomaly.score}</span>
          </div>
        ))}
        {!insights.anomalies.length && <span className="muted">No anomalies flagged.</span>}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <strong>Explanations</strong>
        {insights.explanations.slice(0, 3).map((explain) => (
          <div key={explain.id} className="muted">
            {explain.summary}
          </div>
        ))}
        {!insights.explanations.length && <span className="muted">No explanations available.</span>}
      </div>
    </div>
  );
}

function FlowPanel({ layerCounts, total }: { layerCounts: Record<LogLayer, number>; total: number }) {
  return (
    <div className="flow-grid">
      <div className="flow-node">
        <div className="muted">L3</div>
        <strong>{layerCounts.L3}</strong>
      </div>
      <div className="flow-arrow">-&gt;</div>
      <div className="flow-node">
        <div className="muted">L2</div>
        <strong>{layerCounts.L2}</strong>
      </div>
      <div className="flow-arrow">-&gt;</div>
      <div className="flow-node">
        <div className="muted">L1</div>
        <strong>{layerCounts.L1}</strong>
      </div>
      <div className="flow-node">
        <div className="muted">Infra</div>
        <strong>{layerCounts.INFRA}</strong>
      </div>
      <div className="muted" style={{ gridColumn: '1 / -1' }}>
        {total} events correlated
      </div>
    </div>
  );
}

function TracePanel({ correlation }: { correlation: CorrelationResponse | null }) {
  if (!correlation) return <span className="muted">No correlation data yet.</span>;
  const traces = Object.entries(correlation.traces).slice(0, 4);
  if (!traces.length) return <span className="muted">No trace-linked logs detected.</span>;
  return (
    <div className="stack" style={{ gap: 12 }}>
      {traces.map(([traceId, events]) => (
        <TraceTimeline key={traceId} traceId={traceId} events={events} />
      ))}
    </div>
  );
}

function TraceTimeline({ traceId, events }: { traceId: string; events: NormalizedLogEvent[] }) {
  const times = events.map((event) => new Date(event.timestamp).getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(1, max - min);
  return (
    <div className="trace-timeline">
      <div className="trace-header">
        <strong>{traceId === 'unlinked' ? 'Unlinked events' : `Trace ${traceId.slice(0, 12)}`}</strong>
        <span className="muted">{events.length} events</span>
      </div>
      <div className="trace-bar">
        {events.map((event) => {
          const left = ((new Date(event.timestamp).getTime() - min) / span) * 100;
          return (
            <span
              key={event.id}
              className={`trace-dot severity-${event.severity.toLowerCase()}`}
              style={{ left: `${left}%` }}
              title={`${event.component} - ${event.event}`}
            />
          );
        })}
      </div>
      <div className="trace-events">
        {events.slice(0, 3).map((event) => (
          <div key={event.id} className="muted">
            {event.component} - {event.event}
          </div>
        ))}
      </div>
    </div>
  );
}

function VirtualLogList({
  items,
  height,
  rowHeight,
  renderItem
}: {
  items: NormalizedLogEvent[];
  height: number;
  rowHeight: number;
  renderItem: (item: NormalizedLogEvent) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const totalHeight = items.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 4);
  const visibleCount = Math.ceil(height / rowHeight) + 8;
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const offsetY = startIndex * rowHeight;

  return (
    <div
      ref={containerRef}
      className="log-scroll"
      style={{ height }}
      onScroll={(event) => setScrollTop((event.target as HTMLDivElement).scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
          {items.slice(startIndex, endIndex).map(renderItem)}
        </div>
      </div>
    </div>
  );
}
