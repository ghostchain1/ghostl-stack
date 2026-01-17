'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, Badge, Button } from '@ghostl/ui';
import { resolveApiBase } from '../../../src/lib/runtime';

const API_URL = resolveApiBase();

type LogEvent = {
  source: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  time: string;
  labels?: Record<string, string>;
};

const levelTone: Record<LogEvent['level'], 'default' | 'warning' | 'critical'> = {
  debug: 'default',
  info: 'default',
  warn: 'warning',
  error: 'critical'
};

export default function LogsPage() {
  return (
    <Suspense fallback={<div className="content"><span className="muted">Loading logs...</span></div>}>
      <LogsInner />
    </Suspense>
  );
}

function LogsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [query, setQuery] = useState(searchParams?.get('q') || '{job!=""}');
  const [level, setLevel] = useState<LogEvent['level'] | ''>((searchParams?.get('level') as LogEvent['level'] | '') || '');
  const [limit, setLimit] = useState(Number(searchParams?.get('limit')) || 100);
  const [streaming, setStreaming] = useState(false);
  const [startMs, setStartMs] = useState<number | null>(null);
  const [endMs, setEndMs] = useState<number | null>(null);
  const [direction, setDirection] = useState<'older' | 'newer' | 'none'>('none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const queryWithLevel = useMemo(() => {
    if (!level) return query;
    return `${query} |= "level=${level}"`;
  }, [query, level]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/observability/logs?q=${encodeURIComponent(queryWithLevel)}&limit=${encodeURIComponent(String(limit))}` +
          (startMs ? `&start=${startMs}` : '') +
          (endMs ? `&end=${endMs}` : '') +
          `&direction=${direction}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data);
      if (data.length) {
        const times = data.map((l: LogEvent) => new Date(l.time).getTime());
        setStartMs(Math.min(...times));
        setEndMs(Math.max(...times));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load logs';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [queryWithLevel, limit, startMs, endMs, direction]);

  const startStream = () => {
    if (eventSourceRef.current) return;
    const es = new EventSource(
      `${API_URL.replace('http', 'http')}/observability/logs/stream?q=${encodeURIComponent(queryWithLevel)}`
    );
    es.onmessage = (evt) => {
      try {
        const log: LogEvent = JSON.parse(evt.data);
        setLogs((prev) => [log, ...prev].slice(0, 200));
      } catch {
        // ignore
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

  useEffect(() => {
    load();
    return () => stopStream();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (level) params.set('level', level);
    if (limit) params.set('limit', String(limit));
    if (startMs) params.set('start', String(startMs));
    if (endMs) params.set('end', String(endMs));
    if (direction && direction !== 'none') params.set('direction', direction);
    router.replace(`?${params.toString()}`);
  }, [query, level, limit, startMs, endMs, direction, router]);

  return (
    <div className="content">
      <Card title="Logs" subtitle="Loki">
        <div className="inline-form" style={{ marginBottom: 12 }}>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }} />
          <select
            className="select"
            value={level}
            onChange={(e) => setLevel(e.target.value as LogEvent['level'] | '')}
          >
            <option value="">All levels</option>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <input
            className="input"
            type="number"
            min={10}
            max={500}
            step={10}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ width: 90 }}
          />
          <Button variant="secondary" onClick={load} disabled={loading}>
            Refresh
          </Button>
          {!streaming ? (
            <Button onClick={startStream}>Stream</Button>
          ) : (
            <Button variant="secondary" onClick={stopStream}>
              Stop
            </Button>
          )}
          <Button variant="secondary" onClick={() => setLimit((v) => Math.min(500, v + 100))}>
            Load more
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (!startMs) return;
              setEndMs(startMs);
              setStartMs(startMs - 5 * 60 * 1000);
              setDirection('older');
            }}
            disabled={loading}
          >
            Older
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (!endMs) return;
              const now = Date.now();
              setStartMs(endMs);
              setEndMs(now);
              setDirection('newer');
            }}
            disabled={loading}
          >
            Newer
          </Button>
        </div>
        {loading && <span className="muted">Loading...</span>}
        {error && <span className="muted" style={{ color: '#f87171' }}>{error}</span>}
        <div className="stack">
          {logs.length === 0 && !loading && <span className="muted">No logs</span>}
          {logs.map((log, idx) => (
            <div key={`${log.time}-${idx}`} className="spread" style={{ alignItems: 'flex-start' }}>
              <div>
                <div>
                  <Badge tone={levelTone[log.level]}>{log.level}</Badge>
                  <strong>{log.source}</strong>
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {new Date(log.time).toLocaleTimeString()}
                  </span>
                </div>
                <div>{log.message}</div>
                {log.labels && (
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    {Object.entries(log.labels)
                      .filter(([k]) => k !== '__name__')
                      .map(([k, v]) => `${k}=${v}`)
                      .join(' • ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
