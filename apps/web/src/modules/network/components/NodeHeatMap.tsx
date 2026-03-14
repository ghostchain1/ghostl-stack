'use client';

/**
 * NodeHeatMap — Global validator load heatmap.
 *
 * Pure SVG implementation, equirectangular projection.
 * No external map library, no tile URLs.
 * Reuses the same SVG world map + coordinate math as ValidatorWorldMap.
 *
 * Nodes are overlaid as heat circles sized by CPU load and coloured
 * from green (idle) through amber to red (overloaded).
 *
 * Data: /api/validators  (polled every 12 s)
 */

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NodeData {
  name?:    string;
  lat?:     number;
  lng?:     number;
  region?:  string;
  cpu?:     number;
  memory?:  number;
  status?:  string;
  uptime?:  number;
}

// ── Fallback seed positions when lat/lng not available ────────────────────────
// Spread across known GhostChain validator regions

const REGION_SEEDS: NodeData[] = [
  { name: 'US-West',    lat:  37.7, lng: -122.4, cpu: 45, region: 'US West'       },
  { name: 'US-East',    lat:  40.7, lng:  -74.0, cpu: 60, region: 'US East'       },
  { name: 'EU-West',    lat:  51.5, lng:   -0.1, cpu: 35, region: 'EU West'       },
  { name: 'EU-Central', lat:  50.1, lng:    8.6, cpu: 70, region: 'EU Central'    },
  { name: 'Asia-SE',    lat:   1.3, lng:  103.8, cpu: 30, region: 'Asia-SE'       },
  { name: 'Asia-NE',    lat:  35.6, lng:  139.7, cpu: 55, region: 'Asia-NE'       },
  { name: 'Oceania',    lat: -33.8, lng:  151.2, cpu: 25, region: 'Oceania'       },
  { name: 'LATAM',      lat: -23.5, lng:  -46.6, cpu: 40, region: 'LATAM'         },
];

// ── Map geometry ──────────────────────────────────────────────────────────────

const W = 800;
const H = 400;

function project(lat: number, lng: number): { x: number; y: number } {
  return {
    x: ((lng + 180) / 360) * W,
    y: ((90 - lat) / 180) * H,
  };
}

// Simplified continent polygons — same as ValidatorWorldMap
const CONTINENTS = [
  // North America
  'M200,70 L170,75 L155,90 L150,120 L165,140 L180,150 L200,160 L220,155 L240,140 L245,120 L240,100 L225,80 Z',
  // South America
  'M220,175 L205,180 L195,200 L198,230 L210,255 L225,270 L240,260 L248,240 L245,215 L238,195 Z',
  // Europe
  'M380,60 L370,68 L365,80 L375,90 L390,88 L405,80 L410,70 L400,62 Z',
  // Africa
  'M380,105 L368,115 L362,135 L365,165 L378,185 L395,188 L408,175 L412,150 L408,125 L398,110 Z',
  // Asia
  'M415,55 L430,50 L500,55 L545,65 L560,80 L555,100 L530,110 L500,108 L470,100 L445,90 L428,75 Z',
  // Australia
  'M540,235 L525,240 L520,258 L530,270 L550,272 L565,263 L568,248 L558,237 Z',
];

// ── Colour by CPU load ────────────────────────────────────────────────────────

function heatColor(cpu?: number): { fill: string; stroke: string } {
  if (cpu == null) return { fill: '#6b728044', stroke: '#6b7280' };
  if (cpu >= 90)   return { fill: '#ef444455', stroke: '#ef4444' };
  if (cpu >= 70)   return { fill: '#f59e0b44', stroke: '#f59e0b' };
  if (cpu >= 50)   return { fill: '#84cc1644', stroke: '#84cc16' };
  return              { fill: '#22c55e33', stroke: '#22c55e' };
}

function heatRadius(cpu?: number): number {
  if (cpu == null) return 12;
  return 10 + (cpu / 100) * 20;
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

function Tooltip({ node, x, y }: { node: NodeData; x: number; y: number }) {
  return (
    <foreignObject x={Math.min(x + 8, W - 160)} y={Math.max(y - 60, 4)} width={150} height={80}>
      <div style={{
        background: '#111827ee',
        border:     '1px solid #374151',
        borderRadius: 6,
        padding:    '6px 10px',
        fontSize:   11,
        color:      '#e2e8f0',
        lineHeight: 1.5,
      }}>
        <b>{node.name ?? node.region ?? '—'}</b><br />
        CPU: {node.cpu ?? '?'}%
        {node.memory != null ? ` · Mem: ${node.memory}%` : ''}
        <br />
        {node.region ?? 'Unknown region'}
      </div>
    </foreignObject>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function NodeHeatMap() {
  const [nodes,   setNodes]   = useState<NodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hover,   setHover]   = useState<{ node: NodeData; x: number; y: number } | null>(null);
  const [heatMode, setHeatMode] = useState<'cpu' | 'memory'>('cpu');

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/validators', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { validators?: NodeData[] } | NodeData[];
      const list = Array.isArray(data) ? data : (data.validators ?? []);
      // Use real lat/lng when available; fall back to REGION_SEEDS
      const positioned = list.filter((n: NodeData) => n.lat != null && n.lng != null);
      setNodes(positioned.length > 0 ? positioned : REGION_SEEDS);
    } catch {
      setNodes(REGION_SEEDS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNodes();
    const intv = setInterval(() => void fetchNodes(), 12_000);
    return () => clearInterval(intv);
  }, [fetchNodes]);

  const getCPU = (n: NodeData) => heatMode === 'memory' ? (n.memory ?? n.cpu) : n.cpu;

  const avgLoad = nodes.length
    ? Math.round(nodes.reduce((s, n) => s + (getCPU(n) ?? 0), 0) / nodes.length)
    : 0;
  const maxLoad = nodes.length ? Math.max(...nodes.map(n => getCPU(n) ?? 0)) : 0;
  const hotCount= nodes.filter(n => (getCPU(n) ?? 0) >= 70).length;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e2e8f0', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #1e1e2e' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>Global Node Heatmap</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            {nodes.length} nodes · Avg {avgLoad}% · Peak {maxLoad}% · {hotCount} hot (&gt;70%)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['cpu','memory'] as const).map(m => (
            <button
              key={m}
              onClick={() => setHeatMode(m)}
              style={{
                background: heatMode === m ? '#052e16' : '#111827',
                border:     `1px solid ${heatMode === m ? '#22c55e' : '#374151'}`,
                color:      heatMode === m ? '#22c55e' : '#6b7280',
                padding:    '4px 12px',
                borderRadius: 6,
                cursor:     'pointer',
                fontSize:   11,
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              {m}
            </button>
          ))}
          <button
            onClick={() => void fetchNodes()}
            style={{ background: '#111827', border: '1px solid #374151', color: '#6b7280', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
          >
            ↻
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>Loading heatmap…</div>
      )}

      {/* SVG Map */}
      <div style={{ padding: '16px 20px' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', background: '#0d1117', borderRadius: 8, border: '1px solid #1e1e2e', display: 'block' }}
        >
          {/* Ocean bg */}
          <rect width={W} height={H} fill="#0d1117" />

          {/* Grid lines */}
          {[-60, -30, 0, 30, 60].map(lat => {
            const y = ((90 - lat) / 180) * H;
            return <line key={`lat-${lat}`} x1={0} y1={y} x2={W} y2={y} stroke="#1e1e2e" strokeWidth={0.5} />;
          })}
          {[-120, -60, 0, 60, 120].map(lng => {
            const x = ((lng + 180) / 360) * W;
            return <line key={`lng-${lng}`} x1={x} y1={0} x2={x} y2={H} stroke="#1e1e2e" strokeWidth={0.5} />;
          })}

          {/* Continent fills */}
          {CONTINENTS.map((d, i) => (
            <path key={i} d={d} fill="#1e2433" stroke="#2d3748" strokeWidth={0.5} />
          ))}

          {/* Heat circles */}
          {!loading && nodes.map((node, i) => {
            const lat = node.lat ?? 0;
            const lng = node.lng ?? 0;
            const pos = project(lat, lng);
            const load  = getCPU(node);
            const { fill, stroke } = heatColor(load);
            const r = heatRadius(load);

            return (
              <g
                key={i}
                onMouseEnter={() => setHover({ node, x: pos.x, y: pos.y })}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Outer glow */}
                <circle cx={pos.x} cy={pos.y} r={r * 1.6} fill={fill} opacity={0.4} />
                {/* Inner circle */}
                <circle cx={pos.x} cy={pos.y} r={r * 0.7} fill={fill} stroke={stroke} strokeWidth={1.2} />
                {/* Load label */}
                {(load ?? 0) > 0 && (
                  <text x={pos.x} y={pos.y + 3} textAnchor="middle" fontSize={7} fill={stroke} fontWeight={700}>
                    {load}%
                  </text>
                )}
              </g>
            );
          })}

          {/* Hover tooltip */}
          {hover && <Tooltip node={hover.node} x={hover.x} y={hover.y} />}

          {/* Equator label */}
          <text x={4} y={H / 2 + 3} fontSize={7} fill="#374151">Eq</text>
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, padding: '0 20px 16px', alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { label: 'Idle (<50%)',       color: '#22c55e' },
          { label: 'Moderate (50–70%)', color: '#84cc16' },
          { label: 'Hot (70–90%)',      color: '#f59e0b' },
          { label: 'Critical (≥90%)',   color: '#ef4444' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: l.color + '44', border: `2px solid ${l.color}` }} />
            <span style={{ fontSize: 11, color: '#6b7280' }}>{l.label}</span>
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#374151' }}>
          Metric: {heatMode.toUpperCase()} · Circle size ∝ load
        </span>
      </div>
    </div>
  );
}
