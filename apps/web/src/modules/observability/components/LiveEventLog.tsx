'use client';

/**
 * LiveEventLog.tsx — Real-time event stream viewer.
 *
 * Subscribes to the SSE /api/events endpoint and displays a scrollable
 * ring buffer of recent events — useful for debugging and ops monitoring.
 */

import { useRef, useEffect } from 'react';
import { useRealtimeEvents } from '../../../hooks/useRealtimeEvents';
import { formatSSETime } from '../../../services/sse-client';
import type { SSEEventType } from '../../../services/sse-client';

const EVENT_COLORS: Record<string, string> = {
  'chain.block':         '#22c55e',
  'chain.gas':           '#3b82f6',
  'chain.health':        '#6366f1',
  'validator.update':    '#f59e0b',
  'ai.recommendation':   '#a855f7',
  'ai.swarm':            '#8b5cf6',
  'treasury.update':     '#22d3ee',
  'infra.container':     '#fb923c',
  'infra.vm':            '#f97316',
  'governance.proposal': '#e879f9',
  'bridge.transfer':     '#34d399',
  'heartbeat':           '#374151',
};

function eventColor(type: string): string {
  return EVENT_COLORS[type] ?? '#6b7280';
}

interface Props {
  topics?: SSEEventType[];
  height?: number | string;
  maxEvents?: number;
}

export function LiveEventLog({ topics, height = 320, maxEvents = 50 }: Props) {
  const { events, connected } = useRealtimeEvents(topics, maxEvents);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Live Event Log</span>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
            SSE real-time stream
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 10,
            background: connected ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
            color: connected ? '#22c55e' : '#ef4444',
          }}
        >
          {connected ? '● LIVE' : '○ DISCONNECTED'}
        </span>
      </div>

      <div
        style={{
          height,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 12,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 6,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {events.length === 0 && (
          <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
            Waiting for events…
          </span>
        )}
        {events.map((ev, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span style={{ color: '#4b5563', minWidth: 70, flexShrink: 0 }}>
              {formatSSETime(ev.ts)}
            </span>
            <span
              style={{
                color: eventColor(ev.type),
                minWidth: 160,
                flexShrink: 0,
                fontWeight: 600,
              }}
            >
              {ev.type}
            </span>
            <span
              style={{
                color: '#9ca3af',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {JSON.stringify(ev.data).slice(0, 120)}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="muted" style={{ fontSize: 11 }}>
        Showing last {maxEvents} events · heartbeats filtered
      </div>
    </div>
  );
}
