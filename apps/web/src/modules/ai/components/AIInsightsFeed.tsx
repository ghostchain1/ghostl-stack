'use client';

import { useEffect, useRef, useState } from 'react';
import { resolveApiBase } from '../../../lib/runtime';

type AnomalyRecord = {
  id: string;
  entity: string;
  score: number;
  reasons: string[];
  recordedAt: string;
};

const MAX_FEED_SIZE = 50;

const severityClass = (score: number) => {
  if (score >= 80) return 'bad';
  if (score >= 60) return 'warn';
  return 'ok';
};

const severityLabel = (score: number) => {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  if (score >= 20) return 'LOW';
  return 'SAFE';
};

export function AIInsightsFeed() {
  const [feed, setFeed] = useState<AnomalyRecord[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const apiBase = resolveApiBase();
    const url = `${apiBase}/api/ai/stream-alerts`;

    const connect = () => {
      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
      };

      es.onmessage = (event) => {
        try {
          const anomaly = JSON.parse(event.data as string) as AnomalyRecord;
          setFeed((prev) => {
            const next = [anomaly, ...prev];
            return next.slice(0, MAX_FEED_SIZE);
          });
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        setConnected(false);
        setError('Stream disconnected — retrying…');
        es.close();
        // EventSource auto-reconnects; we just update UI state
        setTimeout(() => {
          setError(null);
        }, 5000);
      };
    };

    connect();
    return () => {
      esRef.current?.close();
    };
  }, []);

  return (
    <div className="card">
      <div className="spread" style={{ alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>AI Insights Feed</div>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: connected ? '#22c55e' : '#ef4444',
              display: 'inline-block'
            }}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            {connected ? 'Live' : 'Connecting…'}
          </span>
        </div>
      </div>

      {error && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 6, color: '#dc3545' }}>
          {error}
        </div>
      )}

      <div className="stack" style={{ gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {feed.length === 0 && (
          <div className="muted" style={{ fontSize: 13 }}>
            No alerts yet. High-risk entities will appear here in real time.
          </div>
        )}
        {feed.map((anomaly) => (
          <div
            key={anomaly.id}
            className="row"
            style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 260
                }}
              >
                {anomaly.entity}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                {anomaly.reasons.join(' · ')}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
              <span className={`badge ${severityClass(anomaly.score)}`}>{severityLabel(anomaly.score)}</span>
              <span className="muted" style={{ fontSize: 10 }}>
                {new Date(anomaly.recordedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
