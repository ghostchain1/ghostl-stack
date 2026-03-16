'use client';

/**
 * app/ghostbrain/page.tsx — GhostBrain Autonomous Infrastructure Orchestrator UI.
 *
 * Control panel for the orchestrator running on port 7895.
 * Displays chain health, node status, validator metrics, anomalies, and
 * container info.  Provides action buttons: Scan, Repair, Scale, Patch.
 *
 * All mutating actions are forwarded through the BFF at /api/orchestrator/*
 * which attaches HMAC credentials before proxying to the orchestrator service.
 */

import { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../../src/lib/api';

// ── Types (mirrors orchestrator/src/types.ts) ─────────────────────────────────

interface ChainHealth {
  layer:       'l1' | 'l2' | 'l3';
  chainId:     number;
  blockNumber: number;
  syncing:     boolean;
  latencyMs:   number;
  ok:          boolean;
  checkedAt:   number;
  error?:      string;
}

interface OrchestratorNode {
  id:          string;
  role:        string;
  endpoint:    string;
  status:      'healthy' | 'degraded' | 'offline' | 'unknown';
  latencyMs:   number;
  blockNumber: number;
  lastChecked: number;
  error?:      string;
}

interface ContainerInfo {
  id:           string;
  name:         string;
  image:        string;
  status:       string;
  state:        string;
  restartCount: number;
}

interface AnomalyEvent {
  id:         string;
  severity:   'info' | 'warning' | 'critical';
  type:       string;
  details:    string;
  detectedAt: number;
  resolved:   boolean;
}

interface ValidatorStatus {
  address:      string;
  moniker:      string;
  jailed:       boolean;
  uptime:       number;
  missedBlocks: number;
}

interface OrchestratorSnapshot {
  tick:           number;
  timestamp:      number;
  chains:         ChainHealth[];
  nodes:          OrchestratorNode[];
  validators:     ValidatorStatus[];
  infra:          { containers: ContainerInfo[]; totalUp: number; totalDown: number };
  anomalies:      AnomalyEvent[];
  nodesHealthy:   number;
  nodesDegraded:  number;
  nodesOffline:   number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LAYER_LABELS: Record<string, string> = {
  l1: 'GhostChain L1',
  l2: 'GhostL2',
  l3: 'GhostL3',
};

const CHAIN_IDS: Record<string, number> = {
  l1: 14000101,
  l2: 901,
  l3: 903,
};

function statusColor(status: OrchestratorNode['status'] | 'ok' | boolean): string {
  if (status === true || status === 'healthy' || status === 'ok') return 'var(--accent)';
  if (status === 'degraded') return 'var(--accent-2)';
  return 'var(--danger)';
}

function severityColor(severity: AnomalyEvent['severity']): string {
  if (severity === 'critical') return 'var(--danger)';
  if (severity === 'warning')  return 'var(--accent-2)';
  return 'var(--accent-3)';
}

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1_000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChainCard({ chain }: { chain: ChainHealth }) {
  const color = statusColor(chain.ok);
  const label = LAYER_LABELS[chain.layer] ?? chain.layer.toUpperCase();
  return (
    <div
      className="cyber-panel"
      style={{ borderColor: color, transition: 'border-color 0.4s' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {label}
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
            #{chain.blockNumber.toLocaleString()}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.65rem', opacity: 0.5 }}>Chain {chain.chainId}</div>
          <div style={{ fontSize: '0.75rem', color }}>
            {chain.ok ? (chain.syncing ? '⟳ SYNCING' : '● LIVE') : '✗ OFFLINE'}
          </div>
          <div style={{ fontSize: '0.65rem', opacity: 0.5 }}>{chain.latencyMs}ms</div>
        </div>
      </div>
      {chain.error && (
        <div style={{ fontSize: '0.7rem', color: 'var(--danger)', marginTop: 6 }}>{chain.error}</div>
      )}
    </div>
  );
}

function AnomalyRow({ ev }: { ev: AnomalyEvent }) {
  return (
    <tr>
      <td style={{ color: severityColor(ev.severity), fontSize: '0.7rem', textTransform: 'uppercase' }}>
        {ev.severity}
      </td>
      <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{ev.type}</td>
      <td style={{ fontSize: '0.75rem', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {ev.details}
      </td>
      <td style={{ fontSize: '0.7rem', opacity: 0.5, whiteSpace: 'nowrap' }}>
        {relativeTime(ev.detectedAt)}
      </td>
    </tr>
  );
}

function NodeRow({ node }: { node: OrchestratorNode }) {
  const color = statusColor(node.status);
  return (
    <tr>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color }}>
        {node.role.toUpperCase()}
      </td>
      <td style={{ color, fontSize: '0.75rem', textTransform: 'uppercase' }}>
        {node.status}
      </td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
        #{node.blockNumber.toLocaleString()}
      </td>
      <td style={{ fontSize: '0.7rem', opacity: 0.5 }}>{node.latencyMs}ms</td>
      <td style={{ fontSize: '0.7rem', opacity: 0.4 }}>{relativeTime(node.lastChecked)}</td>
    </tr>
  );
}

function ContainerRow({
  c,
  onRepair,
  onPatch,
  repairing,
}: {
  c: ContainerInfo;
  onRepair: (name: string) => void;
  onPatch:  (name: string) => void;
  repairing: string | null;
}) {
  const isUp    = c.state === 'running';
  const loading = repairing === c.name;
  return (
    <tr>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{c.name}</td>
      <td style={{ fontSize: '0.72rem', color: isUp ? 'var(--accent)' : 'var(--danger)' }}>
        {c.state}
      </td>
      <td style={{ fontSize: '0.68rem', opacity: 0.5 }}>{c.image.slice(0, 32)}</td>
      <td style={{ fontSize: '0.7rem', color: c.restartCount >= 5 ? 'var(--danger)' : 'inherit' }}>
        {c.restartCount}
      </td>
      <td>
        <button
          disabled={loading}
          onClick={() => onRepair(c.name)}
          style={{
            fontSize: '0.68rem', padding: '2px 8px', marginRight: 4,
            background: 'transparent', border: '1px solid var(--accent)',
            color: 'var(--accent)', cursor: 'pointer', borderRadius: 2,
          }}
        >
          {loading ? '…' : 'Restart'}
        </button>
        <button
          disabled={loading}
          onClick={() => onPatch(c.name)}
          style={{
            fontSize: '0.68rem', padding: '2px 8px',
            background: 'transparent', border: '1px solid var(--accent-3)',
            color: 'var(--accent-3)', cursor: 'pointer', borderRadius: 2,
          }}
        >
          Patch
        </button>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GhostBrainPage() {
  const [snap,     setSnap]     = useState<OrchestratorSnapshot | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [scanning, setScanning] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const result = await apiRequest<OrchestratorSnapshot>('/api/orchestrator/status');
    if (result.ok) {
      setSnap(result.data);
      setError(null);
    } else {
      setError(result.error.message ?? 'Orchestrator unreachable');
    }
    setLoading(false);
  }, []);

  // Poll every 10 s
  useEffect(() => {
    void fetchStatus();
    const t = setInterval(() => void fetchStatus(), 10_000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  const handleScan = async () => {
    setScanning(true);
    setLastAction(null);
    const result = await apiRequest('/api/orchestrator/scan', { init: { method: 'POST' } });
    if (result.ok) {
      setLastAction('Scan complete — fresh snapshot loaded');
      void fetchStatus();
    } else {
      setLastAction(`Scan error: ${result.error.message ?? 'unknown'}`);
    }
    setScanning(false);
  };

  const handleRepair = async (name: string) => {
    setRepairing(name);
    setLastAction(null);
    const result = await apiRequest(`/api/orchestrator/repair/${encodeURIComponent(name)}`, { init: { method: 'POST' } });
    const msg = result.ok
      ? ((result.data as { message?: string } | null)?.message ?? 'ok')
      : result.error.message;
    setLastAction(`Repair "${name}": ${msg}`);
    setRepairing(null);
  };

  const handlePatch = async (name: string) => {
    setRepairing(name);
    setLastAction(null);
    const result = await apiRequest(`/api/orchestrator/patch/${encodeURIComponent(name)}`, { init: { method: 'POST' } });
    const msg = result.ok
      ? ((result.data as { message?: string } | null)?.message ?? 'ok')
      : result.error.message;
    setLastAction(`Patch "${name}": ${msg}`);
    setRepairing(null);
  };

  const handleScale = async () => {
    setLastAction(null);
    const result = await apiRequest('/api/orchestrator/scale', { init: { method: 'POST' } });
    const msg = result.ok
      ? ((result.data as { message?: string } | null)?.message ?? 'ok')
      : result.error.message;
    setLastAction(`Scale: ${msg}`);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page-wrap">
        <div className="cyber-panel" style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="neon-green">INITIALISING GHOSTBRAIN ORCHESTRATOR…</div>
        </div>
      </div>
    );
  }

  const chains     = snap?.chains     ?? [];
  const nodes      = snap?.nodes      ?? [];
  const validators = snap?.validators ?? [];
  const anomalies  = snap?.anomalies  ?? [];
  const containers = snap?.infra?.containers ?? [];

  return (
    <div className="page-wrap">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title neon-green">GhostBrain Orchestrator</h1>
          <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>
            Autonomous Infrastructure Control &nbsp;·&nbsp; Port 7895
            {snap && (
              <> &nbsp;·&nbsp; Tick #{snap.tick} &nbsp;·&nbsp; {relativeTime(snap.timestamp)}</>
            )}
          </div>
        </div>
        {error && (
          <div className="cyber-panel cyber-panel--danger" style={{ padding: '0.5rem 1rem', fontSize: '0.78rem' }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          className="btn-primary"
          disabled={scanning}
          onClick={() => void handleScan()}
        >
          {scanning ? '⟳ Scanning…' : '⟳ Scan Infrastructure'}
        </button>
        <button
          className="btn-secondary"
          onClick={() => void handleScale()}
        >
          ↑ Propose Scaling
        </button>
        <button
          className="btn-secondary"
          onClick={() => void fetchStatus()}
        >
          ↺ Refresh
        </button>
      </div>

      {lastAction && (
        <div className="cyber-panel cyber-panel--info" style={{ marginBottom: '1rem', fontSize: '0.8rem' }}>
          {lastAction}
        </div>
      )}

      {/* ── Chain Health ────────────────────────────────────────────────── */}
      <div className="section-header" style={{ marginBottom: '0.75rem' }}>
        <span className="neon-blue">Chain Health</span>
      </div>
      <div className="cyber-grid" style={{ marginBottom: '1.5rem' }}>
        {chains.map((c) => <ChainCard key={c.layer} chain={c} />)}
        {chains.length === 0 && (
          <div className="cyber-panel" style={{ opacity: 0.4, fontSize: '0.8rem' }}>
            No chain data — run a scan to poll RPC nodes
          </div>
        )}
      </div>

      {/* ── Node Status + Validator Summary ─────────────────────────────── */}
      <div className="cyber-grid cyber-grid--wide" style={{ marginBottom: '1.5rem' }}>
        {/* Nodes */}
        <div className="cyber-panel" style={{ padding: 0, overflow: 'auto' }}>
          <div style={{ padding: '0.75rem 1rem 0.5rem', borderBottom: '1px solid var(--border)' }}>
            <span className="neon-blue" style={{ fontSize: '0.78rem' }}>NODES</span>
            <span style={{ float: 'right', fontSize: '0.68rem', opacity: 0.5 }}>
              ↑{snap?.nodesHealthy ?? 0} /{snap?.nodesDegraded ?? 0} /{snap?.nodesOffline ?? 0}
            </span>
          </div>
          <table className="cyber-table">
            <thead>
              <tr>
                <th>Role</th><th>Status</th><th>Block</th><th>Latency</th><th>Checked</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => <NodeRow key={n.id} node={n} />)}
              {nodes.length === 0 && (
                <tr><td colSpan={5} style={{ opacity: 0.3, textAlign: 'center' }}>No nodes</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Validators */}
        <div className="cyber-panel" style={{ padding: 0, overflow: 'auto' }}>
          <div style={{ padding: '0.75rem 1rem 0.5rem', borderBottom: '1px solid var(--border)' }}>
            <span className="neon-blue" style={{ fontSize: '0.78rem' }}>VALIDATORS</span>
            <span style={{ float: 'right', fontSize: '0.68rem', opacity: 0.5 }}>
              {validators.filter(v => !v.jailed).length}/{validators.length} active
            </span>
          </div>
          <table className="cyber-table">
            <thead>
              <tr><th>Moniker</th><th>Status</th><th>Uptime</th><th>Missed</th></tr>
            </thead>
            <tbody>
              {validators.slice(0, 20).map((v) => (
                <tr key={v.address}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{v.moniker}</td>
                  <td style={{ fontSize: '0.72rem', color: v.jailed ? 'var(--danger)' : 'var(--accent)' }}>
                    {v.jailed ? 'JAILED' : 'ACTIVE'}
                  </td>
                  <td style={{ fontSize: '0.72rem' }}>{v.uptime.toFixed(1)}%</td>
                  <td style={{ fontSize: '0.72rem', color: v.missedBlocks > 100 ? 'var(--accent-2)' : 'inherit' }}>
                    {v.missedBlocks}
                  </td>
                </tr>
              ))}
              {validators.length === 0 && (
                <tr><td colSpan={4} style={{ opacity: 0.3, textAlign: 'center' }}>No validator data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Anomalies ───────────────────────────────────────────────────── */}
      <div className="section-header" style={{ marginBottom: '0.75rem' }}>
        <span className={anomalies.length > 0 ? 'neon-red' : 'neon-green'}>
          Anomalies {anomalies.length > 0 ? `(${anomalies.length})` : '(none)'}
        </span>
      </div>
      {anomalies.length > 0 ? (
        <div className="cyber-panel" style={{ padding: 0, overflow: 'auto', marginBottom: '1.5rem' }}>
          <table className="cyber-table">
            <thead>
              <tr><th>Severity</th><th>Type</th><th>Details</th><th>Detected</th></tr>
            </thead>
            <tbody>
              {anomalies.map((ev) => <AnomalyRow key={ev.id} ev={ev} />)}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cyber-panel cyber-panel--info" style={{ marginBottom: '1.5rem', fontSize: '0.8rem', opacity: 0.7 }}>
          No active anomalies detected
        </div>
      )}

      {/* ── Containers ──────────────────────────────────────────────────── */}
      <div className="section-header" style={{ marginBottom: '0.75rem' }}>
        <span className="neon-blue">Containers</span>
        {snap && (
          <span style={{ fontSize: '0.7rem', opacity: 0.5, marginLeft: '0.75rem' }}>
            {snap.infra.totalUp} up / {snap.infra.totalDown} down
          </span>
        )}
      </div>
      <div className="cyber-panel" style={{ padding: 0, overflow: 'auto' }}>
        <table className="cyber-table">
          <thead>
            <tr><th>Name</th><th>State</th><th>Image</th><th>Restarts</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {containers.map((c) => (
              <ContainerRow
                key={c.id}
                c={c}
                onRepair={handleRepair}
                onPatch={handlePatch}
                repairing={repairing}
              />
            ))}
            {containers.length === 0 && (
              <tr><td colSpan={5} style={{ opacity: 0.3, textAlign: 'center' }}>
                No containers — Docker socket may not be mounted
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
