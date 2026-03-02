import type { Metadata } from 'next';
import { Card } from '@ghostl/ui';
import { localRoute } from '../../../src/lib/local-route';
import type { LogEntry, LogLevel } from '../../api/logs/route';

export const metadata: Metadata = {
  title: 'Logs — GhostChain Employee',
};

type LogsResponse = { logs: LogEntry[]; total: number; services: string[]; levels: LogLevel[] };
const LOG_ENTRIES_FALLBACK: LogEntry[] = [];

const LEVEL_COLOR: Record<string, string> = {
  INFO:  '#00C2FF',
  WARN:  '#C9A227',
  ERROR: '#FF3B3B',
  DEBUG: '#4A5568',
  AUDIT: '#7A5CFF',
};

const ALL_LEVELS: LogLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG', 'AUDIT'];

/** Show just time portion of an ISO timestamp */
const fmtTime = (iso: string) => iso.split('T')[1]?.slice(0, 12) ?? iso;

export default async function LogsPage() {
  const data       = await localRoute<LogsResponse>('/api/logs');
  const LOG_ENTRIES = data?.logs     ?? LOG_ENTRIES_FALLBACK;
  const SERVICES    = data?.services ?? [];
  const LEVELS      = data?.levels   ?? ALL_LEVELS;
  const errorCount  = LOG_ENTRIES.filter(e => e.level === 'ERROR').length;
  const warnCount   = LOG_ENTRIES.filter(e => e.level === 'WARN').length;

  return (
    <div className="content">
      {/* Header */}
      <div className="spread" style={{ marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0 }}>Logs</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Aggregated service logs — last 15 minutes
            {errorCount > 0 && <> · <span style={{ color: '#FF3B3B' }}>{errorCount} error{errorCount !== 1 ? 's' : ''}</span></>}
            {warnCount  > 0 && <> · <span style={{ color: '#C9A227' }}>{warnCount} warning{warnCount !== 1 ? 's' : ''}</span></>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="chip" style={{ cursor: 'pointer' }}>Grafana Loki →</button>
          <button className="chip" style={{ cursor: 'pointer' }}>Export</button>
        </div>
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Level filter */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: '0.72rem', flexShrink: 0 }}>Level:</span>
            {LEVELS.map(l => (
              <button key={l} className="chip" style={{ cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: LEVEL_COLOR[l], background: `${LEVEL_COLOR[l]}10`, border: `1px solid ${LEVEL_COLOR[l]}28` }}>{l}</button>
            ))}
          </div>
          {/* Service filter */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: '0.72rem', flexShrink: 0 }}>Service:</span>
            <select style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#E8EDF5', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', padding: '3px 8px', cursor: 'pointer' }}>
              <option value="">All services</option>
              {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* Search */}
          <input
            type="text"
            placeholder="Search logs…"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#E8EDF5', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', padding: '4px 10px', outline: 'none', minWidth: 180 }}
          />
        </div>
      </Card>

      {/* Log stream */}
      <Card style={{ padding: '8px 0', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', overflow: 'auto', maxHeight: '60vh' }}>
        {LOG_ENTRIES.map((e, i) => (
          <div key={e.id ?? i} style={{
            display: 'grid',
            gridTemplateColumns: '96px 52px 130px 1fr',
            gap: 10,
            padding: '5px 16px',
            borderBottom: i < LOG_ENTRIES.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            alignItems: 'baseline',
            background: e.level === 'ERROR' ? 'rgba(255,59,59,0.05)' : e.level === 'AUDIT' ? 'rgba(122,92,255,0.04)' : 'transparent',
          }}>
            {/* Timestamp */}
            <span style={{ color: '#4A5568', fontSize: '0.68rem', userSelect: 'none' }}>{fmtTime(e.ts)}</span>
            {/* Level */}
            <span style={{ fontWeight: 700, fontSize: '0.65rem', color: LEVEL_COLOR[e.level] ?? '#8A9BB5', letterSpacing: '0.05em' }}>{e.level}</span>
            {/* Service */}
            <span style={{ color: '#8A9BB5', fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.service}</span>
            {/* Message */}
            <span style={{ color: e.level === 'ERROR' ? '#FF3B3B' : e.level === 'WARN' ? '#C9A227' : '#E8EDF5', lineHeight: 1.5, wordBreak: 'break-word' }}>
              {e.msg}
              {e.trace && <span style={{ color: '#4A5568', marginLeft: 8 }}>· {e.trace}</span>}
            </span>
          </div>
        ))}
      </Card>

      {/* Pagination hint */}
      <div className="muted" style={{ fontSize: '0.7rem', marginTop: 10, textAlign: 'center' }}>
        Showing 15 of ~12,400 entries today · scroll up to load older — or use Grafana Loki for full-text search
      </div>
    </div>
  );
}
