'use client';

/**
 * HypervisorPanel.tsx — Container + VM control panel for the DevOps section.
 *
 * Shows live container/VM state from the GAIS hypervisor.
 * Write actions (restart/stop/start) call the BFF which proxies to the
 * kernel safety guard — allowlist + dry-run mode respected.
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  HypervisorSnapshot,
  ContainerInfo,
  VMInfo,
  ContainerAction,
  VMAction,
} from '../../../services/hypervisor';
import {
  fetchHypervisorSnapshot,
  containerAction,
  vmAction,
} from '../../../services/hypervisor';

// ── Colour helpers ─────────────────────────────────────────────────────────────

function stateColor(state: string): string {
  if (state === 'running') return '#22c55e';
  if (state === 'paused')  return '#f59e0b';
  return '#ef4444';
}

function healthIcon(health: string): string {
  if (health === 'healthy')   return '●';
  if (health === 'starting')  return '◌';
  if (health === 'unhealthy') return '✕';
  return '—';
}

function fmt(sec: number): string {
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

// ── Container row ─────────────────────────────────────────────────────────────

interface ContainerRowProps {
  c:       ContainerInfo;
  onAct:   (name: string, action: ContainerAction) => void;
  busy:    boolean;
}

function ContainerRow({ c, onAct, busy }: ContainerRowProps) {
  const good = c.state === 'running';
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <td style={{ padding: '8px 10px', fontWeight: 600, fontSize: 13 }}>
        <span style={{ color: stateColor(c.state), marginRight: 6 }}>
          {healthIcon(c.health)}
        </span>
        {c.name}
      </td>
      <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--color-muted, #9ca3af)' }}>
        {c.state}
      </td>
      <td style={{ padding: '8px 10px', fontSize: 12 }}>
        {c.cpuPercent.toFixed(1)}% / {Math.round(c.memMb)} MB
      </td>
      <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--color-muted, #9ca3af)' }}>
        up {fmt(c.uptimeSec)} · restarts {c.restartCount}
      </td>
      <td style={{ padding: '8px 10px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {!good && (
            <button
              disabled={busy}
              onClick={() => onAct(c.name, 'start')}
              style={btnStyle('#22c55e', busy)}
            >
              Start
            </button>
          )}
          {good && (
            <button
              disabled={busy}
              onClick={() => onAct(c.name, 'restart')}
              style={btnStyle('#f59e0b', busy)}
            >
              Restart
            </button>
          )}
          {good && (
            <button
              disabled={busy}
              onClick={() => onAct(c.name, 'stop')}
              style={btnStyle('#ef4444', busy)}
            >
              Stop
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── VM row ────────────────────────────────────────────────────────────────────

interface VMRowProps {
  vm:    VMInfo;
  onAct: (id: string, action: VMAction) => void;
  busy:  boolean;
}

function VMRow({ vm, onAct, busy }: VMRowProps) {
  const good = vm.state === 'running';
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <td style={{ padding: '8px 10px', fontWeight: 600, fontSize: 13 }}>
        <span style={{ color: stateColor(vm.state), marginRight: 6 }}>●</span>
        {vm.name}
      </td>
      <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--color-muted, #9ca3af)' }}>
        {vm.state}
      </td>
      <td style={{ padding: '8px 10px', fontSize: 12 }}>
        {vm.cpuCount} vCPU · {vm.ramMb / 1024} GB · {vm.diskGb} GB disk
      </td>
      <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--color-muted, #9ca3af)' }}>
        {vm.ipv4} · up {fmt(vm.uptimeSec)}
      </td>
      <td style={{ padding: '8px 10px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {!good && (
            <button disabled={busy} onClick={() => onAct(vm.id, 'start')} style={btnStyle('#22c55e', busy)}>
              Start
            </button>
          )}
          {good && (
            <button disabled={busy} onClick={() => onAct(vm.id, 'reboot')} style={btnStyle('#f59e0b', busy)}>
              Reboot
            </button>
          )}
          {good && (
            <button disabled={busy} onClick={() => onAct(vm.id, 'stop')} style={btnStyle('#ef4444', busy)}>
              Stop
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function btnStyle(color: string, disabled: boolean): React.CSSProperties {
  return {
    padding: '3px 10px',
    borderRadius: 5,
    border: `1px solid ${color}60`,
    background: disabled ? 'transparent' : `${color}20`,
    color: disabled ? 'var(--color-muted, #9ca3af)' : color,
    fontSize: 11,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function HypervisorPanel() {
  const [snap, setSnap]       = useState<HypervisorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [busyCon, setBusyCon] = useState<Set<string>>(new Set());
  const [busyVM, setBusyVM]   = useState<Set<string>>(new Set());
  const [toast, setToast]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchHypervisorSnapshot();
      setSnap(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hypervisor unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleContainer = useCallback(async (name: string, action: ContainerAction) => {
    setBusyCon(prev => new Set([...prev, name]));
    try {
      const r = await containerAction(name, action);
      showToast(r.dryRun ? `[DRY-RUN] ${r.message}` : r.message);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyCon(prev => { const n = new Set(prev); n.delete(name); return n; });
    }
  }, [load]);

  const handleVM = useCallback(async (id: string, action: VMAction) => {
    setBusyVM(prev => new Set([...prev, id]));
    try {
      const r = await vmAction(id, action);
      showToast(r.dryRun ? `[DRY-RUN] ${r.message}` : r.message);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyVM(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            padding: '10px 18px', borderRadius: 8,
            background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)',
            fontSize: 13, maxWidth: 380,
          }}
        >
          {toast}
        </div>
      )}

      {/* Dry-run banner */}
      {snap?.dryRunMode && (
        <div
          style={{
            padding: '8px 14px', borderRadius: 6,
            background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
            color: '#fbbf24', fontSize: 13, fontWeight: 600,
          }}
        >
          ⚠ DRY-RUN MODE — all write actions are logged but not executed
          (VM_MANAGER_DRY_RUN=1)
        </div>
      )}

      {loading && <div className="muted">Loading hypervisor snapshot…</div>}
      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>
          {error}
          <button onClick={load} style={{ marginLeft: 12, fontSize: 12, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {snap && (
        <>
          {/* Summary chips */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
            <span>
              <strong style={{ color: '#22c55e' }}>{snap.runningContainers}</strong>
              /{snap.totalContainers} containers running
            </span>
            <span>·</span>
            <span>
              <strong style={{ color: '#22c55e' }}>{snap.runningVMs}</strong>
              /{snap.totalVMs} VMs running
            </span>
            <span>·</span>
            <span className="muted">Region: {snap.region}</span>
            <span>·</span>
            <span className="muted">
              Updated {new Date(snap.collectedAt).toLocaleTimeString()}
            </span>
            <button
              onClick={load}
              style={{
                marginLeft: 'auto', fontSize: 11, padding: '3px 10px',
                borderRadius: 5, border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent', color: 'inherit', cursor: 'pointer',
              }}
            >
              ↻ Refresh
            </button>
          </div>

          {/* Containers table */}
          <div className="card" style={{ overflowX: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
              Docker Containers
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ opacity: 0.6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>State</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>CPU / Mem</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>Info</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {snap.containers.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 12, color: 'var(--color-muted, #9ca3af)' }}>No containers found</td></tr>
                )}
                {snap.containers.map(c => (
                  <ContainerRow
                    key={c.id}
                    c={c}
                    onAct={handleContainer}
                    busy={busyCon.has(c.name)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* VMs table */}
          {snap.vms.length > 0 && (
            <div className="card" style={{ overflowX: 'auto' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
                Virtual Machines (GAIS)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ opacity: 0.6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px' }}>State</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px' }}>Resources</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px' }}>Network</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.vms.map(vm => (
                    <VMRow
                      key={vm.id}
                      vm={vm}
                      onAct={handleVM}
                      busy={busyVM.has(vm.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
