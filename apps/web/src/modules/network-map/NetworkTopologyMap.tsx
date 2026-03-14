'use client';

/**
 * NetworkTopologyMap.tsx — Interactive SVG network topology visualisation.
 *
 * Pure SVG + CSS — no external graphing library required.
 *
 * Topology (fixed layout, data-driven colours):
 *
 *          [GhostChain L1]
 *         /               \
 *   [GhostL2-A]       [GhostL2-B]
 *      |    \               |
 *   [L3-a] [L3-b]        [L3-c]
 *
 * Nodes are coloured by health:
 *   green  → ok / synced
 *   yellow → degraded / syncing
 *   red    → down / error
 *
 * Edges animate data flow.
 */

import { useMemo } from 'react';
import { useChainStatus } from '../../hooks/useChainStatus';

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeHealth = 'ok' | 'degraded' | 'error' | 'unknown';

interface TopoNode {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  radius: number;
  health: NodeHealth;
  badge?: string;
  chainId?: number;
  blockNumber?: number;
}

interface TopoEdge {
  from: string;
  to:   string;
  animated: boolean;
  label?: string;
}

// ── Colour map ─────────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<NodeHealth, string> = {
  ok:       '#22c55e',
  degraded: '#f59e0b',
  error:    '#ef4444',
  unknown:  '#6b7280',
};

const HEALTH_GLOW: Record<NodeHealth, string> = {
  ok:       'rgba(34,197,94,0.35)',
  degraded: 'rgba(245,158,11,0.35)',
  error:    'rgba(239,68,68,0.35)',
  unknown:  'rgba(107,114,128,0.15)',
};

// ── Fixed layout (800 × 420 viewBox) ─────────────────────────────────────────

const LAYOUT_W = 800;
const LAYOUT_H = 420;

const STATIC_EDGES: Omit<TopoEdge, 'animated'>[] = [
  { from: 'l1',     to: 'l2-a',  label: 'OP' },
  { from: 'l1',     to: 'l2-b',  label: 'OP' },
  { from: 'l2-a',   to: 'l3-a',  label: 'OP' },
  { from: 'l2-a',   to: 'l3-b',  label: 'OP' },
  { from: 'l2-b',   to: 'l3-c',  label: 'OP' },
  { from: 'l1',     to: 'finL1', label: 'oracle' },
  { from: 'l2-a',   to: 'finL2', label: 'oracle' },
];

// ── SVG sub-components ───────────────────────────────────────────────────────

function NodeCircle({ node }: { node: TopoNode }) {
  const color = HEALTH_COLOR[node.health];
  const glow  = HEALTH_GLOW[node.health];
  const r     = node.radius;
  return (
    <g transform={`translate(${node.x},${node.y})`} style={{ cursor: 'default' }}>
      {/* Glow ring */}
      <circle r={r + 8} fill={glow} />
      {/* Main circle */}
      <circle r={r} fill="rgba(15,15,20,0.92)" stroke={color} strokeWidth={2.5} />
      {/* Health dot */}
      <circle cx={r - 4} cy={-(r - 4)} r={5} fill={color} />
      {/* Label */}
      <text
        textAnchor="middle"
        dy="-2"
        style={{
          fontSize: node.radius > 32 ? 13 : 11,
          fontWeight: 700,
          fill: '#e5e7eb',
        }}
      >
        {node.label}
      </text>
      {node.sublabel && (
        <text
          textAnchor="middle"
          dy="14"
          style={{ fontSize: 10, fill: '#9ca3af' }}
        >
          {node.sublabel}
        </text>
      )}
      {node.blockNumber !== undefined && (
        <text
          textAnchor="middle"
          dy="26"
          style={{ fontSize: 9, fill: color }}
        >
          #{node.blockNumber.toLocaleString()}
        </text>
      )}
      {node.badge && (
        <g transform={`translate(${-(r + 14)},${-(r + 6)})`}>
          <rect rx={4} ry={4} width={28} height={14} fill="rgba(99,102,241,0.8)" />
          <text
            textAnchor="middle"
            x={14}
            dy="11"
            style={{ fontSize: 8, fontWeight: 700, fill: '#fff' }}
          >
            {node.badge}
          </text>
        </g>
      )}
    </g>
  );
}

function Edge({ edge, nodes }: { edge: TopoEdge; nodes: Record<string, TopoNode> }) {
  const from = nodes[edge.from];
  const to   = nodes[edge.to];
  if (!from || !to) return null;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx  = dx / len;
  const ny  = dy / len;

  const x1 = from.x + nx * (from.radius + 8);
  const y1 = from.y + ny * (from.radius + 8);
  const x2 = to.x   - nx * (to.radius   + 8);
  const y2 = to.y   - ny * (to.radius   + 8);

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const strokeColor = from.health === 'ok' && to.health === 'ok' ? '#374151' : '#4b5563';
  const dashId = `dash-${edge.from}-${edge.to}`;

  return (
    <g>
      {edge.animated && (
        <defs>
          <linearGradient id={dashId} gradientUnits="userSpaceOnUse"
            x1={x1} y1={y1} x2={x2} y2={y2}>
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0" />
            <stop offset="50%" stopColor="#22c55e" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {/* Static connector */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeDasharray={edge.animated ? undefined : '6,4'}
      />
      {/* Animated data-flow overlay */}
      {edge.animated && (
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={`url(#${dashId})`}
          strokeWidth={2.5}
          strokeDasharray="20,80"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0" to="-100"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </line>
      )}
      {/* Edge label */}
      {edge.label && (
        <text
          x={midX}
          y={midY - 5}
          textAnchor="middle"
          style={{ fontSize: 9, fill: '#6b7280', userSelect: 'none' as const }}
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NetworkTopologyMap() {
  const { status, loading } = useChainStatus();

  const l1Health: NodeHealth = status?.l1.ok ? 'ok' : status?.l1 ? 'error' : 'unknown';
  const l2Health: NodeHealth = status?.l2.ok ? 'ok' : status?.l2 ? 'error' : 'unknown';
  const l3Health: NodeHealth = status?.l3.ok ? 'ok' : status?.l3 ? 'error' : 'unknown';

  const nodesArr: TopoNode[] = useMemo(() => [
    // L1 — center top
    {
      id: 'l1',
      label: 'GhostChain',
      sublabel: 'L1 · 14000101',
      x: 400, y: 80,
      radius: 44,
      health: l1Health,
      badge: 'L1',
      blockNumber: status?.l1.blockNumber,
    },
    // L2 nodes
    {
      id: 'l2-a',
      label: 'GhostL2-A',
      sublabel: 'chain 901',
      x: 200, y: 210,
      radius: 34,
      health: l2Health,
      badge: 'L2',
      blockNumber: status?.l2.blockNumber,
    },
    {
      id: 'l2-b',
      label: 'GhostL2-B',
      sublabel: 'chain 901',
      x: 600, y: 210,
      radius: 34,
      health: l2Health,
      badge: 'L2',
    },
    // L3 nodes
    {
      id: 'l3-a',
      label: 'GhostL3-α',
      sublabel: 'chain 903',
      x: 100, y: 340,
      radius: 26,
      health: l3Health,
      badge: 'L3',
      blockNumber: status?.l3.blockNumber,
    },
    {
      id: 'l3-b',
      label: 'GhostL3-β',
      sublabel: 'chain 903',
      x: 290, y: 340,
      radius: 26,
      health: l3Health,
      badge: 'L3',
    },
    {
      id: 'l3-c',
      label: 'GhostL3-γ',
      sublabel: 'chain 903',
      x: 600, y: 340,
      radius: 26,
      health: l3Health,
      badge: 'L3',
    },
    // Finality oracles
    {
      id: 'finL1',
      label: 'Oracle',
      sublabel: 'L1 finality',
      x: 660, y: 70,
      radius: 22,
      health: l1Health,
    },
    {
      id: 'finL2',
      label: 'Oracle',
      sublabel: 'L2 finality',
      x: 400, y: 280,
      radius: 22,
      health: l2Health,
    },
  ], [l1Health, l2Health, l3Health, status]);

  const nodeMap = useMemo(
    () => Object.fromEntries(nodesArr.map(n => [n.id, n])),
    [nodesArr],
  );

  const edges: TopoEdge[] = STATIC_EDGES.map(e => ({
    ...e,
    animated: (nodeMap[e.from]?.health === 'ok') && (nodeMap[e.to]?.health === 'ok'),
  }));

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Title bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Network Topology</div>
          <div className="muted" style={{ fontSize: 12 }}>
            L1 → L2 → L3 live mesh · animated = active data flow
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11 }}>
          {(['ok', 'degraded', 'error', 'unknown'] as NodeHealth[]).map(h => (
            <span key={h} style={{ color: HEALTH_COLOR[h], display: 'flex', gap: 4 }}>
              <span style={{
                display: 'inline-block',
                width: 8, height: 8,
                borderRadius: '50%',
                background: HEALTH_COLOR[h],
                marginTop: 2,
              }} />
              {h}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="muted" style={{ textAlign: 'center', padding: '40px 0', fontSize: 13 }}>
          Loading topology…
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${LAYOUT_W} ${LAYOUT_H}`}
            width="100%"
            style={{
              minWidth: 320,
              maxWidth: '100%',
              display: 'block',
              borderRadius: 8,
              background: 'radial-gradient(ellipse at center, rgba(30,40,60,0.6) 0%, rgba(10,12,16,0.9) 100%)',
            }}
          >
            {/* Edges (drawn first — below nodes) */}
            {edges.map(e => (
              <Edge key={`${e.from}-${e.to}`} edge={e} nodes={nodeMap} />
            ))}

            {/* Nodes */}
            {nodesArr.map(n => (
              <NodeCircle key={n.id} node={n} />
            ))}
          </svg>
        </div>
      )}

      {/* Legend: addresses */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 6,
          fontSize: 11,
          color: 'var(--color-muted, #9ca3af)',
        }}
      >
        <span>L2L3Bridge: 0xDadd…1dC2</span>
        <span>L1 Rollup: 0xad32…5355</span>
        <span>L2 Rollup: 0x130A…0e90</span>
        <span>Finality L1: 0x7B3B…a422</span>
        <span>Finality L2: 0x650a…553A</span>
        <span>Finality L3: 0x87F8…2127</span>
      </div>
    </div>
  );
}
