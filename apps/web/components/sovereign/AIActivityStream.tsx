'use client';

import { useEffect, useState } from 'react';
import { LayerBadge } from '@/components/brand/LayerBadge';

type AISystem = 'GasEngine' | 'ValidatorEQ' | 'TreasuryAI' | 'GhostLoad' | 'GhostDNS' | 'GhostSentinel';
type ActionOutcome = 'SUCCESS' | 'ADVISORY' | 'BLOCKED' | 'MONITORING';

interface AIAction {
  id: string;
  system: AISystem;
  action: string;
  outcome: ActionOutcome;
  timestamp: string;
  detail?: string;
  boundaryPct?: number; // % of constitutional boundary used
}

interface AISystemStatus {
  system: AISystem;
  label: string;
  status: 'ACTIVE' | 'IDLE' | 'ALERT';
  lastAction: string;
  metric: string;
  metricValue: string;
  boundaryPct: number;
}

interface AIActivityStreamProps {
  systems?: AISystemStatus[];
  recentActions?: AIAction[];
  className?: string;
}

const SYSTEM_CONFIG: Record<AISystem, { label: string; color: string; role: string }> = {
  GasEngine:     { label: 'Gas Engine',      color: '#00F0B5', role: 'Gas Optimization'    },
  ValidatorEQ:   { label: 'Validator EQ',    color: '#00F0B5', role: 'Load Balancing'       },
  TreasuryAI:    { label: 'Treasury AI',     color: '#C9A227', role: 'Capital Allocation'   },
  GhostLoad:     { label: 'GhostLoad AI',    color: '#00F0B5', role: 'Network Routing'      },
  GhostDNS:      { label: 'GhostDNS AI',     color: '#00C2FF', role: 'DNS Intelligence'     },
  GhostSentinel: { label: 'GhostSentinel',   color: '#FF3B3B', role: 'Threat Detection'     },
};

const OUTCOME_CONFIG: Record<ActionOutcome, { color: string; label: string }> = {
  SUCCESS:    { color: '#00F0B5', label: 'SUCCESS'    },
  ADVISORY:   { color: '#C9A227', label: 'ADVISORY'   },
  BLOCKED:    { color: '#FF3B3B', label: 'BLOCKED'    },
  MONITORING: { color: '#8A9BB5', label: 'MONITORING' },
};

const DEFAULT_SYSTEMS: AISystemStatus[] = [
  { system: 'GasEngine',     label: 'Gas Engine',    status: 'ACTIVE', lastAction: 'Gas target adjusted to 0.0012 GST', metric: 'Utilization', metricValue: '65%',    boundaryPct: 42 },
  { system: 'ValidatorEQ',   label: 'Validator EQ',  status: 'ACTIVE', lastAction: 'Load rebalanced across 25 nodes',   metric: 'Variance',    metricValue: '±12%',   boundaryPct: 28 },
  { system: 'TreasuryAI',    label: 'Treasury AI',   status: 'IDLE',   lastAction: 'Allocation proposal drafted',       metric: 'Risk Score',  metricValue: '3,240',  boundaryPct: 45 },
  { system: 'GhostLoad',     label: 'GhostLoad AI',  status: 'ACTIVE', lastAction: 'Batch size optimized to 512 tx',    metric: 'Efficiency',  metricValue: '91%',    boundaryPct: 18 },
  { system: 'GhostDNS',      label: 'GhostDNS AI',   status: 'ACTIVE', lastAction: 'Route optimized for APAC region',   metric: 'Latency',     metricValue: '42ms',   boundaryPct: 12 },
  { system: 'GhostSentinel', label: 'GhostSentinel', status: 'ACTIVE', lastAction: 'Anomaly scan complete — clear',     metric: 'Threat Score', metricValue: '0.04',  boundaryPct: 4  },
];

const DEFAULT_ACTIONS: AIAction[] = [
  { id: 'a1', system: 'GasEngine',     action: 'Gas target adjusted',          outcome: 'SUCCESS',    timestamp: '2m ago',  detail: '0.0010 → 0.0012 GST',  boundaryPct: 42 },
  { id: 'a2', system: 'GhostSentinel', action: 'Anomaly scan completed',       outcome: 'MONITORING', timestamp: '5m ago',  detail: 'Threat score: 0.04',    boundaryPct: 4  },
  { id: 'a3', system: 'GhostLoad',     action: 'Batch size optimized',         outcome: 'SUCCESS',    timestamp: '8m ago',  detail: '480 → 512 tx/batch',    boundaryPct: 18 },
  { id: 'a4', system: 'TreasuryAI',    action: 'Allocation proposal drafted',  outcome: 'ADVISORY',   timestamp: '12m ago', detail: 'Awaiting governance',   boundaryPct: 45 },
  { id: 'a5', system: 'ValidatorEQ',   action: 'Validator load rebalanced',    outcome: 'SUCCESS',    timestamp: '15m ago', detail: '25 nodes adjusted',     boundaryPct: 28 },
  { id: 'a6', system: 'GhostDNS',      action: 'Route optimized',              outcome: 'SUCCESS',    timestamp: '18m ago', detail: 'APAC latency -18ms',    boundaryPct: 12 },
];

/**
 * AIActivityStream — Real-time Hyper Ghost AI system monitoring panel.
 * Shows all 6 AI systems, their status, constitutional boundary usage, and recent actions.
 */
export function AIActivityStream({
  systems = DEFAULT_SYSTEMS,
  recentActions = DEFAULT_ACTIONS,
  className = '',
}: AIActivityStreamProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={`sovereign-card relative overflow-hidden ${className}`}
      style={{ borderColor: 'rgba(0,240,181,0.2)' }}
    >
      {/* Top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, #00F0B5, #7A5CFF, transparent)',
      }} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayerBadge layer="AI" showDot />
          <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: '#00F0B5' }}>
            Hyper Ghost AI
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#00F0B5',
            boxShadow: '0 0 8px rgba(0,240,181,0.6)',
            display: 'inline-block',
            animation: 'pulse-glow 2s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em', color: '#00F0B5', textTransform: 'uppercase' }}>
            {systems.filter(s => s.status === 'ACTIVE').length}/{systems.length} ACTIVE
          </span>
        </div>
      </div>

      {/* AI System Grid */}
      <div className="grid grid-cols-2 gap-2 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {systems.map((sys) => {
          const cfg = SYSTEM_CONFIG[sys.system];
          const statusColor = sys.status === 'ACTIVE' ? '#00F0B5' : sys.status === 'ALERT' ? '#FF3B3B' : '#8A9BB5';

          return (
            <div
              key={sys.system}
              style={{
                background: 'rgba(0,240,181,0.04)',
                border: `1px solid ${cfg.color}20`,
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              {/* System header */}
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.75rem', fontWeight: 600, color: cfg.color }}>
                  {cfg.label}
                </span>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: statusColor,
                  boxShadow: sys.status === 'ACTIVE' ? `0 0 5px ${statusColor}` : 'none',
                  display: 'inline-block',
                  flexShrink: 0,
                }} />
              </div>

              {/* Metric */}
              <div className="flex items-baseline gap-1 mb-2">
                <span style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: '#E8EDF5', letterSpacing: '0.04em' }}>
                  {sys.metricValue}
                </span>
                <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', color: '#8A9BB5' }}>
                  {sys.metric}
                </span>
              </div>

              {/* Constitutional boundary bar */}
              <div>
                <div className="flex justify-between mb-1">
                  <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.55rem', color: '#8A9BB5', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Boundary
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.55rem', color: sys.boundaryPct > 80 ? '#FF3B3B' : sys.boundaryPct > 60 ? '#C9A227' : '#8A9BB5' }}>
                    {sys.boundaryPct}%
                  </span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${sys.boundaryPct}%`,
                    background: sys.boundaryPct > 80 ? '#FF3B3B' : sys.boundaryPct > 60 ? '#C9A227' : '#00F0B5',
                    borderRadius: 2,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Actions */}
      <div>
        <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.12em', color: '#8A9BB5', textTransform: 'uppercase', marginBottom: 8 }}>
          Recent Actions — Epoch #{tick + 47}
        </p>
        <div className="flex flex-col gap-1.5">
          {recentActions.slice(0, 5).map((action) => {
            const sysCfg = SYSTEM_CONFIG[action.system];
            const outcomeCfg = OUTCOME_CONFIG[action.outcome];

            return (
              <div
                key={action.id}
                className="flex items-center gap-2"
                style={{
                  padding: '6px 10px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: 6,
                }}
              >
                {/* System dot */}
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: sysCfg.color, flexShrink: 0, display: 'inline-block' }} />

                {/* System label */}
                <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', fontWeight: 600, color: sysCfg.color, flexShrink: 0, minWidth: 80 }}>
                  {sysCfg.label}
                </span>

                {/* Action */}
                <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#E8EDF5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {action.action}
                </span>

                {/* Detail */}
                {action.detail && (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#8A9BB5', flexShrink: 0 }}>
                    {action.detail}
                  </span>
                )}

                {/* Outcome */}
                <span style={{
                  padding: '1px 5px',
                  background: `${outcomeCfg.color}15`,
                  border: `1px solid ${outcomeCfg.color}30`,
                  borderRadius: 4,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: '0.55rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  color: outcomeCfg.color,
                  textTransform: 'uppercase' as const,
                  flexShrink: 0,
                }}>
                  {outcomeCfg.label}
                </span>

                {/* Timestamp */}
                <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.58rem', color: '#8A9BB5', flexShrink: 0 }}>
                  {action.timestamp}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Constitutional boundary note */}
      <div className="mt-3 flex items-center gap-2" style={{ paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', color: '#8A9BB5' }}>
          AI operates within constitutional boundaries. Advisory only — governance ratification required for execution.
        </span>
      </div>
    </div>
  );
}
