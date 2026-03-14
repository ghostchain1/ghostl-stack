'use client';

/**
 * GhostBrainConsole — Structured AI query console.
 *
 * Operators select a query type from an allowlist, optionally specify a
 * target (validator / address / container), and send the query to
 * /api/ai/command which proxies to GhostBrain Core.
 *
 * This is NOT a shell — arbitrary command execution is intentionally
 * blocked at the BFF layer.  Only structured GhostBrain queries are
 * permitted, matching the kernel safety guard's allowlist model.
 *
 * AI-recommended actions (Approve / Reject / Queue) are forwarded to
 * the signing relay at /api/hyperghost (human ratification required).
 */

import { useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type QueryType =
  | 'validator-health'
  | 'tx-classify'
  | 'wallet-profile'
  | 'network-health'
  | 'treasury-analysis'
  | 'anomaly-scan'
  | 'recommendations'
  | 'swarm-status'
  | 'gas-estimate';

interface LogEntry {
  id:        string;
  timestamp: string;
  queryType: QueryType;
  target:    string | null;
  ok:        boolean;
  result:    unknown;
  error?:    string;
}

const QUERY_LABELS: Record<QueryType, string> = {
  'validator-health':  'Validator Health',
  'tx-classify':       'Tx Classification',
  'wallet-profile':    'Wallet Profile',
  'network-health':    'Network Health',
  'treasury-analysis': 'Treasury Analysis',
  'anomaly-scan':      'Anomaly Scan',
  'recommendations':   'AI Recommendations',
  'swarm-status':      'Swarm Status',
  'gas-estimate':      'Gas Estimate',
};

const QUERY_PLACEHOLDERS: Partial<Record<QueryType, string>> = {
  'validator-health': 'validator name or address',
  'tx-classify':      '0x transaction hash',
  'wallet-profile':   '0x wallet address',
  'anomaly-scan':     'chain: l1 | l2 | l3 (optional)',
  'gas-estimate':     'target contract address',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function GhostBrainConsole() {
  const [queryType, setQueryType] = useState<QueryType>('network-health');
  const [target,    setTarget]    = useState('');
  const [running,   setRunning]   = useState(false);
  const [log,       setLog]       = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when log grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  async function execute() {
    if (running) return;
    setRunning(true);

    const entry: LogEntry = {
      id:        crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      queryType,
      target:    target.trim() || null,
      ok:        false,
      result:    null,
    };

    try {
      const res = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryType,
          target: target.trim() || undefined,
        }),
      });

      const data = (await res.json()) as { ok: boolean; result: unknown; error?: string };
      entry.ok     = data.ok;
      entry.result = data.result;
      entry.error  = data.error;
    } catch (e) {
      entry.error = e instanceof Error ? e.message : 'fetch failed';
    } finally {
      setRunning(false);
      setLog(prev => [...prev.slice(-99), entry]); // keep last 100
    }
  }

  async function approveRecommendation(rec: unknown) {
    try {
      await fetch('/api/hyperghost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', recommendation: rec }),
      });
      setLog(prev => [
        ...prev,
        {
          id:        crypto.randomUUID(),
          timestamp: new Date().toLocaleTimeString(),
          queryType: 'recommendations',
          target:    null,
          ok:        true,
          result:    { message: 'Recommendation forwarded to signing relay for human ratification.' },
        },
      ]);
    } catch {
      // silent
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────

  function renderResult(entry: LogEntry) {
    if (!entry.ok && entry.error) {
      return <span style={{ color: '#ef4444' }}>{entry.error}</span>;
    }

    const r = entry.result;
    if (!r || typeof r !== 'object') {
      return <span style={{ color: '#9ca3af' }}>No result.</span>;
    }

    // Recommendations: show with approve button
    const rObj = r as Record<string, unknown>;
    if (entry.queryType === 'recommendations' && Array.isArray(rObj.recommendations)) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(rObj.recommendations as Array<Record<string, unknown>>).map((rec, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ flex: 1, color: '#d1d5db', fontSize: 12 }}>
                {String(rec.message ?? rec.description ?? JSON.stringify(rec))}
              </span>
              <button
                onClick={() => void approveRecommendation(rec)}
                style={{ padding: '2px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: '#22c55e22', color: '#22c55e' }}
              >
                Approve
              </button>
            </div>
          ))}
        </div>
      );
    }

    return (
      <pre style={{ margin: 0, fontSize: 11, color: '#d1d5db', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>
        {JSON.stringify(r, null, 2)}
      </pre>
    );
  }

  // ── JSX ─────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: 'inherit',
    fontSize: 13,
    padding: '7px 12px',
  };

  return (
    <div style={{ fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Console header */}
      <div style={{
        background: '#0a0a0f',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px 10px 0 0',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
        <span style={{ marginLeft: 8, fontSize: 12, color: '#22c55e', fontFamily: 'monospace' }}>GhostBrain Console</span>
        <span style={{
          marginLeft: 'auto', fontSize: 10, color: '#6b7280',
          background: '#22c55e22', border: '1px solid #22c55e44',
          borderRadius: 20, padding: '1px 8px',
        }}>QUERY-ONLY · WRITE ACTIONS REQUIRE RATIFICATION</span>
      </div>

      {/* Log output */}
      <div style={{
        background: '#030712',
        border: '1px solid rgba(255,255,255,0.08)',
        borderTop: 'none',
        minHeight: 320,
        maxHeight: 400,
        overflowY: 'auto',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {log.length === 0 ? (
          <div style={{ color: '#4b5563', fontSize: 12 }}>
            {'> '} Select a query type, enter an optional target, and press Execute.
            <br />
            {'> '} AI write actions are forwarded to the signing relay for human ratification.
          </div>
        ) : log.map(entry => (
          <div key={entry.id}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
              [{entry.timestamp}] <span style={{ color: entry.ok ? '#22c55e' : '#ef4444' }}>
                {entry.ok ? '✓' : '✗'}
              </span>{' '}
              <span style={{ color: '#a78bfa' }}>{QUERY_LABELS[entry.queryType]}</span>
              {entry.target && <span style={{ color: '#60a5fa' }}> → {entry.target}</span>}
            </div>
            <div style={{ paddingLeft: 16, borderLeft: '2px solid rgba(255,255,255,0.06)' }}>
              {renderResult(entry)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        background: '#0d1117',
        border: '1px solid rgba(255,255,255,0.1)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '0 0 10px 10px',
        padding: '12px 16px',
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <select
          value={queryType}
          onChange={e => setQueryType(e.target.value as QueryType)}
          style={{ ...inputStyle, minWidth: 180 }}
        >
          {(Object.entries(QUERY_LABELS) as [QueryType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder={QUERY_PLACEHOLDERS[queryType] ?? 'optional target…'}
          value={target}
          onChange={e => setTarget(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void execute(); }}
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />

        <button
          onClick={() => void execute()}
          disabled={running}
          style={{
            padding: '7px 20px',
            borderRadius: 8,
            cursor: running ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 700,
            background: running ? '#374151' : '#22c55e22',
            color: running ? '#6b7280' : '#22c55e',
            border: running ? '1px solid #374151' : '1px solid #22c55e44',
          } as React.CSSProperties}
        >
          {running ? 'Running…' : '▶ Execute'}
        </button>

        {log.length > 0 && (
          <button
            onClick={() => setLog([])}
            style={{ ...inputStyle, cursor: 'pointer', color: '#6b7280', border: '1px solid #374151', fontSize: 11 }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
