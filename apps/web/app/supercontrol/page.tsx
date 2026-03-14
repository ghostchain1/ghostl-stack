'use client';

/**
 * SuperControl — GhostStack Autonomous Control Plane Console
 *
 * Provides a unified real-time overview of the entire GhostStack ecosystem:
 *
 *   • Live health metrics (validators, chains, liquidity, AI)
 *   • Anomaly alert feed from useAutonomousMonitor
 *   • Human-initiated proposal flow via /api/hyperghost
 *
 * GOVERNANCE MODEL: All write actions require human approval via the
 * "Propose" button which forwards to the signing relay for on-chain
 * governance ratification.  Nothing executes autonomously.
 */

import { useAutonomousMonitor, type MonitorAlert } from '../../src/hooks/useAutonomousMonitor';
import { useRealtime } from '../../src/hooks/useRealtime';
import { useState } from 'react';

// ── Severity colours ───────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444',
  warning:  '#f59e0b',
  info:     '#3b82f6',
};

const SEV_BG: Record<string, string> = {
  critical: '#450a0a',
  warning:  '#1c0f00',
  info:     '#0c1a2e',
};

// ── Alert card ─────────────────────────────────────────────────────────────────

function AlertCard({
  alert, proposing,
  onPropose, onDismiss,
}: {
  alert:     MonitorAlert;
  proposing: boolean;
  onPropose: () => void;
  onDismiss: () => void;
}) {
  const c  = SEV_COLOR[alert.severity] ?? '#6b7280';
  const bg = SEV_BG[alert.severity]   ?? '#111827';
  return (
    <div style={{
      background: bg, border: `1px solid ${c}44`, borderLeft: `3px solid ${c}`,
      borderRadius: 6, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
          <span style={{ fontSize: 9, color: c, border: `1px solid ${c}`, padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase', fontWeight: 700 }}>
            {alert.severity}
          </span>
          <span style={{ fontSize: 10, color: '#6b7280' }}>{alert.type}</span>
          <span style={{ fontSize: 10, color: '#4b5563', marginLeft: 'auto' }}>
            {new Date(alert.detectedAt).toLocaleTimeString()}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 3 }}>{alert.message}</div>
        <div style={{ fontSize: 10, color: '#4b5563' }}>Target: {alert.target}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button
          onClick={onPropose}
          disabled={proposing}
          style={{
            background: '#1c1917', border: '1px solid #6b728066', color: '#9ca3af',
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600,
          }}
        >
          {proposing ? '…' : '⟳ Propose'}
        </button>
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', color: '#4b5563',
            cursor: 'pointer', fontSize: 10, padding: '3px 10px',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ── Metric widget ──────────────────────────────────────────────────────────────

function Metric({ label, value, sub, color }: { label:string; value:string|number; sub?:string; color?:string }) {
  return (
    <div style={{ background:'#111827', border:'1px solid #1e1e2e', borderRadius:8, padding:'10px 14px' }}>
      <div style={{ fontSize:9, color:'#6b7280', textTransform:'uppercase', marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:700, color: color ?? '#e2e8f0', fontFamily:'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'#4b5563', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SuperControl() {
  const monitor  = useAutonomousMonitor();
  const realtime = useRealtime();
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [toast,  setToast]  = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5_000);
  };

  const handlePropose = async (alertId: string) => {
    await monitor.propose(alertId);
    showToast('Proposal forwarded to governance relay for human ratification');
  };

  const filteredAlerts: MonitorAlert[] = monitor.alerts.filter(a => {
    if (filter === 'critical') return a.severity === 'critical';
    if (filter === 'warning')  return a.severity === 'warning';
    return true;
  });

  const critCount = monitor.alerts.filter(a => a.severity === 'critical').length;
  const warnCount = monitor.alerts.filter(a => a.severity === 'warning').length;

  // WS-based L1/L2/L3 block numbers
  const l1Block = realtime.blockByChain['GhostChain L1'] ?? realtime.blockByChain['l1'];
  const l2Block = realtime.blockByChain['GhostL2']       ?? realtime.blockByChain['l2'];
  const l3Block = realtime.blockByChain['GhostL3']       ?? realtime.blockByChain['l3'];

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0f', color:'#e2e8f0', fontFamily:'monospace' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:16, right:16, zIndex:9999, background:'#052e16', border:'1px solid #16a34a', color:'#86efac', borderRadius:8, padding:'10px 16px', fontSize:13, boxShadow:'0 4px 20px #0008' }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth:1200, margin:'0 auto', padding:'24px 20px' }}>
        {/* Header */}
        <div style={{ marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:22, fontWeight:700, color:'#a855f7' }}>GhostStack SuperControl</div>
            <div style={{ fontSize:12, color:'#6b7280', marginTop:3 }}>
              Unified Autonomous Control Plane · All writes require governance ratification
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background: realtime.connected ? '#22c55e' : '#ef4444' }} />
            <span style={{ fontSize:11, color:'#6b7280' }}>{realtime.connected ? 'WS Live' : 'WS Offline'}</span>
          </div>
        </div>

        {/* Top metrics row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:24 }}>
          <Metric label="Validators"  value={monitor.metrics.validatorCount}                    color="#c4b5fd" />
          <Metric label="Jailed"      value={monitor.metrics.jailedCount}                       color={monitor.metrics.jailedCount > 0 ? '#ef4444' : '#22c55e'} />
          <Metric label="Avg CPU"     value={`${monitor.metrics.avgCpu}%`}                      color={monitor.metrics.avgCpu > 80 ? '#ef4444' : '#22c55e'} />
          <Metric label="Chains"      value={monitor.metrics.chainsOnline}                      color="#3b82f6" sub="online" />
          <Metric label="Total TVL"   value={monitor.metrics.totalTvlGST > 0 ? `${monitor.metrics.totalTvlGST.toFixed(1)} GST` : '—'} color="#fbbf24" />
          <Metric label="Anomalies"   value={monitor.alerts.length}                             color={monitor.alerts.length > 0 ? '#f59e0b' : '#22c55e'} />
        </div>

        {/* Realtime block numbers */}
        {(l1Block || l2Block || l3Block) && (
          <div style={{ display:'flex', gap:12, marginBottom:20 }}>
            {[
              { label:'L1 Block', val:l1Block, color:'#a855f7' },
              { label:'L2 Block', val:l2Block, color:'#3b82f6' },
              { label:'L3 Block', val:l3Block, color:'#22c55e' },
            ].filter(b => b.val != null).map(b => (
              <div key={b.label} style={{ background:'#111827', border:'1px solid #1e1e2e', borderRadius:6, padding:'6px 14px', display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:10, color:'#6b7280' }}>{b.label}</span>
                <span style={{ fontSize:13, fontWeight:700, color:b.color }}>#{b.val?.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {/* Layout: alerts + AI status */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:20 }}>
          {/* Alert feed */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#9ca3af' }}>Anomaly Feed</div>
              <div style={{ display:'flex', gap:6, marginLeft:8 }}>
                {(['all','critical','warning'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      background: filter === f ? '#1e1035' : '#111827',
                      border:     `1px solid ${filter === f ? '#7c3aed' : '#374151'}`,
                      color:      filter === f ? '#c4b5fd' : '#6b7280',
                      padding:    '2px 10px', borderRadius:20, cursor:'pointer', fontSize:10, fontWeight:600,
                    }}
                  >
                    {f === 'all'
                      ? `All (${monitor.alerts.length})`
                      : f === 'critical'
                        ? `Critical (${critCount})`
                        : `Warning (${warnCount})`}
                  </button>
                ))}
              </div>
              {monitor.metrics.lastPollTime && (
                <span style={{ marginLeft:'auto', fontSize:10, color:'#374151' }}>
                  Polled {new Date(monitor.metrics.lastPollTime).toLocaleTimeString()}
                </span>
              )}
            </div>

            {filteredAlerts.length === 0 ? (
              <div style={{ background:'#0d1117', border:'1px solid #1e1e2e', borderRadius:8, padding:40, textAlign:'center', color:'#374151', fontSize:12 }}>
                {monitor.alerts.length === 0 ? '✓ No anomalies detected' : 'No alerts match this filter'}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'60vh', overflowY:'auto' }}>
                {filteredAlerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    proposing={monitor.proposing.has(alert.id)}
                    onPropose={() => void handlePropose(alert.id)}
                    onDismiss={() => monitor.dismiss(alert.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* AI & system status sidebar */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {/* GhostBrain AI status */}
            {realtime.ai && (
              <div style={{ background:'#111827', border:'1px solid #1e1e2e', borderRadius:8, padding:'14px 16px' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#c4b5fd', marginBottom:10 }}>GhostBrain AI</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, fontSize:11, color:'#9ca3af' }}>
                  <div>Alert Level: <span style={{ color: realtime.ai.alertLevel === 'high' ? '#ef4444' : realtime.ai.alertLevel === 'medium' ? '#f59e0b' : '#22c55e', fontWeight:700 }}>
                    {realtime.ai.alertLevel}
                  </span></div>
                  <div>Active Agents: <b style={{ color:'#e2e8f0' }}>{realtime.ai.activeAgents}</b></div>
                  <div>Anomalies (24h): <b style={{ color: realtime.ai.anomaliesDetected24h > 0 ? '#f59e0b' : '#22c55e' }}>{realtime.ai.anomaliesDetected24h}</b></div>
                </div>
              </div>
            )}

            {/* Chain health per WS */}
            <div style={{ background:'#111827', border:'1px solid #1e1e2e', borderRadius:8, padding:'14px 16px' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#9ca3af', marginBottom:10 }}>Chain Health</div>
              {Object.entries(realtime.healthByChain).length === 0 ? (
                <div style={{ fontSize:11, color:'#374151' }}>Waiting for WS data…</div>
              ) : (
                Object.entries(realtime.healthByChain).map(([chain, status]) => (
                  <div key={chain} style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:11 }}>
                    <span style={{ color:'#9ca3af' }}>{chain}</span>
                    <span style={{ color: status === 'online' ? '#22c55e' : '#ef4444', fontWeight:700 }}>{status}</span>
                  </div>
                ))
              )}
            </div>

            {/* Quick links */}
            <div style={{ background:'#111827', border:'1px solid #1e1e2e', borderRadius:8, padding:'14px 16px' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#9ca3af', marginBottom:10 }}>Subsystems</div>
              {[
                { href:'/network',              label:'3D Topology',          color:'#a855f7' },
                { href:'/network/heatmap',      label:'Node Heatmap',         color:'#22c55e' },
                { href:'/validators/control',   label:'Validator Control',    color:'#c4b5fd' },
                { href:'/treasury/intelligence',label:'Treasury Intel',       color:'#fbbf24' },
                { href:'/bridge/liquidity',     label:'Liquidity Monitor',    color:'#3b82f6' },
                { href:'/ai/console',           label:'AI Console',           color:'#ec4899' },
              ].map(l => (
                <a
                  key={l.href}
                  href={l.href}
                  style={{ display:'block', color:l.color, fontSize:11, marginBottom:6, textDecoration:'none', fontWeight:600 }}
                >
                  ↗ {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Footer safeguard notice */}
        <div style={{ marginTop:24, padding:'8px 14px', background:'#0d1117', border:'1px solid #1e1e2e', borderRadius:6, fontSize:10, color:'#374151' }}>
          <b style={{ color:'#4b5563' }}>Governance Model</b> — This panel is observe-and-recommend only.
          &quot;Propose&quot; forwards detected anomalies to the signing relay (port 7910) for human ratification via governance quorum.
          No autonomous write commands are issued from this interface.
        </div>
      </div>
    </div>
  );
}
