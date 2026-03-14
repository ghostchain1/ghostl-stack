'use client';

/**
 * DockerLogsPanel — container log viewer for the DevOps page.
 *
 * Fetches container list from /api/docker/containers, lets the operator
 * select a container, then tails its logs via /api/events (SSE) with a
 * container filter — or falls back to a polling fetch if the kernel
 * log endpoint is available.
 *
 * Write actions (restart/stop) proxy through /api/hypervisor/container/action
 * which is gated by the kernel safety guard.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface ContainerSummary {
  id:    string;
  name:  string;
  state: string;
  image?: string;
  cpuPercent?: number;
  memMb?: number;
}

interface ContainerList {
  containers: ContainerSummary[];
  total:   number;
  running: number;
  stopped: number;
}

function stateColor(state: string): string {
  if (state === 'running')    return '#22c55e';
  if (state === 'paused')     return '#f59e0b';
  if (state === 'restarting') return '#a78bfa';
  return '#ef4444';
}

const GAIS_URL = '/api/system'; // we use the BFF from the browser

export function DockerLogsPanel() {
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [selected,   setSelected]   = useState<string | null>(null);
  const [logs,       setLogs]       = useState<string[]>([]);
  const [busy,       setBusy]       = useState<Record<string, boolean>>({});
  const [feedback,   setFeedback]   = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError,   setListError]   = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // ── Fetch container list ────────────────────────────────────────────────
  const refreshList = useCallback(async () => {
    try {
      const res = await fetch('/api/docker/containers', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ContainerList;
      setContainers(data.containers ?? []);
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'unavailable');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
    const id = setInterval(() => void refreshList(), 20_000);
    return () => clearInterval(id);
  }, [refreshList]);

  // ── Fetch logs for selected container ──────────────────────────────────
  const fetchLogs = useCallback(async (name: string) => {
    setLogs([`[INFO] fetching logs for ${name}…`]);
    try {
      const res = await fetch(
        `/api/hypervisor/container/logs?name=${encodeURIComponent(name)}&tail=100`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        setLogs([`[${res.status}] Log endpoint not available — check if GAIS log streaming is enabled.`]);
        return;
      }
      const text = await res.text();
      setLogs(text.split('\n').filter(Boolean));
    } catch {
      setLogs(['[WARN] Log streaming unavailable — confirm GAIS_URL and KERNEL_LOG_ENDPOINT are configured.']);
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    void fetchLogs(selected);
  }, [selected, fetchLogs]);

  // Scroll to bottom on new logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  // ── Container action ───────────────────────────────────────────────────
  const doAction = useCallback(async (name: string, action: 'start' | 'stop' | 'restart') => {
    setBusy(b => ({ ...b, [name]: true }));
    setFeedback(null);
    try {
      const res = await fetch('/api/hypervisor/container/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, action }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; dryRun?: boolean; error?: string };
      setFeedback(
        data.ok
          ? `${action} ${name} — ${data.dryRun ? '(DRY RUN) ' : ''}${data.message ?? 'ok'}`
          : `✕ ${data.error ?? 'action failed'}`,
      );
      setTimeout(() => void refreshList(), 2000);
    } catch (e) {
      setFeedback(`✕ ${e instanceof Error ? e.message : 'kernel unreachable'}`);
    } finally {
      setBusy(b => ({ ...b, [name]: false }));
    }
  }, [refreshList]);

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    cursor: 'pointer',
  };

  const btn = (color: string, disabled: boolean): React.CSSProperties => ({
    padding: '3px 10px', borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11, fontWeight: 600, background: `${color}22`, color, opacity: disabled ? 0.5 : 1,
  });

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
        Docker Containers
        <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--color-muted, #9ca3af)', fontWeight: 400 }}>
          {containers.filter(c => c.state === 'running').length}/{containers.length} running
        </span>
      </div>

      {feedback && (
        <div style={{
          marginBottom: 10, padding: '6px 12px', borderRadius: 6, fontSize: 12,
          background: feedback.startsWith('✕') ? '#ef444422' : '#22c55e22',
          color:      feedback.startsWith('✕') ? '#ef4444'   : '#22c55e',
          border: `1px solid ${feedback.startsWith('✕') ? '#ef444444' : '#22c55e44'}`,
        }}>
          {feedback}
        </div>
      )}

      {listError ? (
        <div style={{ color: '#ef4444', fontSize: 12 }}>Container list unavailable: {listError}</div>
      ) : loadingList ? (
        <div style={{ color: 'var(--color-muted, #9ca3af)', fontSize: 12 }}>Loading containers…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 12 }}>
          {/* Container list */}
          <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
            {containers.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--color-muted, #9ca3af)', fontSize: 12 }}>No containers found.</div>
            ) : containers.map(c => (
              <div
                key={c.id ?? c.name}
                style={{
                  ...row,
                  background: selected === c.name ? 'rgba(255,255,255,0.06)' : 'transparent',
                }}
                onClick={() => setSelected(c.name)}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: stateColor(c.state), flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </span>
                {c.cpuPercent !== undefined && (
                  <span style={{ fontSize: 11, color: 'var(--color-muted, #9ca3af)', whiteSpace: 'nowrap' }}>
                    CPU {c.cpuPercent.toFixed(1)}%
                  </span>
                )}
                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button style={btn('#22c55e', !!busy[c.name])} disabled={!!busy[c.name]} onClick={() => void doAction(c.name, 'start')}>start</button>
                  <button style={btn('#ef4444', !!busy[c.name])} disabled={!!busy[c.name]} onClick={() => void doAction(c.name, 'stop')}>stop</button>
                  <button style={btn('#a78bfa', !!busy[c.name])} disabled={!!busy[c.name]} onClick={() => void doAction(c.name, 'restart')}>restart</button>
                </div>
              </div>
            ))}
          </div>

          {/* Log pane */}
          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Logs: {selected}</span>
                <button
                  onClick={() => void fetchLogs(selected)}
                  style={{ ...btn('#60a5fa', false), marginLeft: 'auto' }}
                >
                  refresh
                </button>
                <button onClick={() => setSelected(null)} style={btn('#9ca3af', false)}>✕</button>
              </div>
              <div
                ref={logRef}
                style={{
                  height: 260, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11,
                  background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6, padding: '8px 10px', lineHeight: 1.6,
                  color: '#d1d5db',
                }}
              >
                {logs.map((line, i) => (
                  <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
