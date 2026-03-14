'use client';

/**
 * NetworkTopology3D — Pure CSS 3D network topology visualiser.
 *
 * Uses CSS perspective + rotateX/Y/Z transforms with orbital animation
 * to create a live 3-layer topology view of GhostChain L1 → L2 → L3.
 * No external 3D library required; works with SSR.
 *
 * Data source: /api/network/topology  (polled every 10 s)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TopoNode {
  id:          string;
  label:       string;
  layer:       'l1' | 'l2' | 'l3';
  blockNumber: number | null;
  status:      'online' | 'degraded' | 'offline';
  peers:       number;
}

interface TopoBridge {
  from:  string;
  to:    string;
  label: string;
}

interface TopoData {
  nodes:     TopoNode[];
  bridges:   TopoBridge[];
  timestamp: string;
}

// ── Layer colour config ────────────────────────────────────────────────────────

const LAYER_COLORS: Record<string, string> = {
  l1: '#a855f7',   // GhostChain L1 — purple
  l2: '#3b82f6',   // GhostL2 — blue
  l3: '#22c55e',   // GhostL3 — green
};

const STATUS_COLORS: Record<string, string> = {
  online:   '#22c55e',
  degraded: '#f59e0b',
  offline:  '#ef4444',
};

// ── 3D orbit positions (spherical coords mapped to CSS) ───────────────────────

function layerRingPositions(
  count:        number,
  radiusPx:     number,
  tiltDeg:      number,
  zOffsetPx:    number,
): Array<{ x: number; y: number; z: number }> {
  return Array.from({ length: count }, (_, i) => {
    const angle  = (2 * Math.PI * i) / count - Math.PI / 2;
    const tilt   = (tiltDeg * Math.PI) / 180;
    const x      = Math.cos(angle) * radiusPx;
    const y      = Math.sin(angle) * radiusPx * Math.cos(tilt);
    const z      = Math.sin(angle) * radiusPx * Math.sin(tilt) + zOffsetPx;
    return { x, y, z };
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Node3D({
  node,
  x, y, z,
  selected,
  onClick,
}: {
  node:     TopoNode;
  x: number; y: number; z: number;
  selected: boolean;
  onClick:  () => void;
}) {
  const color  = node.layer === 'l1' || node.layer === 'l2' || node.layer === 'l3'
    ? LAYER_COLORS[node.layer]
    : '#6b7280';
  const border = STATUS_COLORS[node.status] ?? '#6b7280';
  const isValidator = node.id.startsWith('validator');

  return (
    <div
      onClick={onClick}
      style={{
        position:   'absolute',
        width:       isValidator ? 32 : 52,
        height:      isValidator ? 32 : 52,
        borderRadius:'50%',
        left:        `calc(50% + ${x}px - ${isValidator ? 16 : 26}px)`,
        top:         `calc(50% + ${y}px - ${isValidator ? 16 : 26}px)`,
        background: `radial-gradient(circle at 35% 35%, ${color}66, ${color}22)`,
        border:      `2px solid ${selected ? '#fff' : border}`,
        boxShadow:   `0 0 ${selected ? 20 : 10}px ${color}88`,
        cursor:      'pointer',
        display:     'flex',
        alignItems:  'center',
        justifyContent: 'center',
        fontSize:     isValidator ? 10 : 11,
        fontWeight:   700,
        color:        '#e2e8f0',
        textAlign:   'center',
        lineHeight:  1.1,
        zIndex:      Math.round(z + 200),
        transition:  'box-shadow 0.2s, border-color 0.2s',
        userSelect:  'none',
      }}
      title={node.label}
    >
      {isValidator ? '⬡' : (node.layer ?? '?').toUpperCase()}
    </div>
  );
}

function BridgeLine({
  x1, y1, x2, y2, label, active,
}: { x1:number; y1:number; x2:number; y2:number; label:string; active:boolean }) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const len = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
  const ang = Math.atan2(y2-y1, x2-x1) * (180/Math.PI);

  return (
    <div style={{ position:'absolute', left:`calc(50% + ${cx}px)`, top:`calc(50% + ${cy}px)`, pointerEvents:'none' }}>
      <div style={{
        position:   'absolute',
        width:       len,
        height:      1,
        left:        -len/2,
        top:         0,
        background: `linear-gradient(90deg, transparent, ${active ? '#7c3aed' : '#374151'}, transparent)`,
        transform:  `rotate(${ang}deg)`,
        opacity:     active ? 0.8 : 0.3,
      }} />
      <div style={{
        position:  'absolute',
        left:      -30,
        top:       -8,
        fontSize:  9,
        color:     '#6b7280',
        whiteSpace:'nowrap',
      }}>{label}</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function NetworkTopology3D() {
  const [data,     setData]     = useState<TopoData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [selected, setSelected] = useState<TopoNode | null>(null);
  const [orbitDeg, setOrbitDeg] = useState(0);
  const [paused,   setPaused]   = useState(false);
  const rafRef  = useRef<number>(0);
  const lastRef = useRef<number>(0);

  const fetchTopo = useCallback(async () => {
    try {
      const res = await fetch('/api/network/topology', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as TopoData;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Topology fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTopo();
    const intv = setInterval(() => void fetchTopo(), 10_000);
    return () => clearInterval(intv);
  }, [fetchTopo]);

  // Slow orbital rotation
  useEffect(() => {
    if (paused) return;
    const animate = (ts: number) => {
      const delta = ts - lastRef.current;
      lastRef.current = ts;
      setOrbitDeg(d => (d + delta * 0.005) % 360);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused]);

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#6b7280', fontSize:14 }}>
        Building topology…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#ef4444', fontSize:14 }}>
        {error}
      </div>
    );
  }

  const nodes    = data?.nodes   ?? [];
  const bridges  = data?.bridges ?? [];

  // Split nodes by layer for ring positioning
  const l1Nodes = nodes.filter(n => n.layer === 'l1' && !n.id.startsWith('validator'));
  const l2Nodes = nodes.filter(n => n.layer === 'l2');
  const l3Nodes = nodes.filter(n => n.layer === 'l3');
  const valNodes= nodes.filter(n => n.id.startsWith('validator'));

  // Build position map (rotate for orbit)
  type Pos3D = { x: number; y: number; z: number };
  const posMap = new Map<string, Pos3D>();

  function applyOrbit(pos: Pos3D): Pos3D {
    const rad = (orbitDeg * Math.PI) / 180;
    return {
      x: pos.x * Math.cos(rad) - pos.z * Math.sin(rad),
      y: pos.y,
      z: pos.x * Math.sin(rad) + pos.z * Math.cos(rad),
    };
  }

  [[l1Nodes, 120, 20, -100], [l2Nodes, 90, 10, 0], [l3Nodes, 70, 5, 100]].forEach(
    ([group, radius, tilt, zOff]) => {
      const g = group as TopoNode[];
      if (g.length === 0) return;
      const positions = layerRingPositions(g.length, radius as number, tilt as number, zOff as number);
      g.forEach((n, i) => posMap.set(n.id, applyOrbit(positions[i])));
    },
  );

  // Validator ring
  if (valNodes.length > 0) {
    const vpos = layerRingPositions(valNodes.length, 160, 15, -60);
    valNodes.forEach((n, i) => posMap.set(n.id, applyOrbit(vpos[i])));
  }

  // Compute bridge screen coords
  const bridgeLines = bridges.map(b => {
    const p1 = posMap.get(b.from);
    const p2 = posMap.get(b.to);
    if (!p1 || !p2) return null;
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, label: b.label };
  }).filter(Boolean) as { x1:number; y1:number; x2:number; y2:number; label:string }[];

  const onlineCount = nodes.filter(n => n.status === 'online').length;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#0a0a0f' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #1e1e2e' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:'#c4b5fd' }}>Network Topology</div>
          <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
            {onlineCount}/{nodes.length} nodes online
            {error && <span style={{ color:'#f59e0b', marginLeft:8 }}>⚠ {error}</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button
            onClick={() => setPaused(p => !p)}
            style={{ background:'#1e1e2e', border:'1px solid #374151', color:'#9ca3af', padding:'4px 12px', borderRadius:6, cursor:'pointer', fontSize:11 }}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          {/* Legend */}
          {Object.entries(LAYER_COLORS).map(([layer, col]) => (
            <div key={layer} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:col }} />
              <span style={{ fontSize:10, color:'#6b7280', textTransform:'uppercase' }}>{layer}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 3D canvas area */}
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
        {/* Bridge lines */}
        {bridgeLines.map((bl, i) => (
          <BridgeLine key={i} {...bl} active />
        ))}

        {/* Nodes */}
        {nodes.map(node => {
          const pos = posMap.get(node.id);
          if (!pos) return null;
          return (
            <Node3D
              key={node.id}
              node={node}
              x={pos.x} y={pos.y} z={pos.z}
              selected={selected?.id === node.id}
              onClick={() => setSelected(s => s?.id === node.id ? null : node)}
            />
          );
        })}

        {/* Orbital rings (decorative) */}
        {[120, 90, 70].map((r, i) => (
          <div
            key={i}
            style={{
              position:     'absolute',
              left:         `calc(50% - ${r}px)`,
              top:          `calc(50% - ${r * 0.4}px)`,
              width:         r * 2,
              height:        r * 0.8,
              border:        `1px dashed ${['#a855f733','#3b82f633','#22c55e33'][i]}`,
              borderRadius: '50%',
              pointerEvents:'none',
            }}
          />
        ))}

        {/* Central GhostChain glow */}
        <div style={{
          position:     'absolute',
          left:         'calc(50% - 20px)',
          top:          'calc(50% - 20px)',
          width:         40,
          height:        40,
          borderRadius: '50%',
          background:   'radial-gradient(circle, #7c3aed44, transparent)',
          boxShadow:    '0 0 40px #7c3aed33',
          pointerEvents:'none',
        }} />
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{
          position:  'absolute',
          bottom:    80,
          right:     24,
          background:'#111827',
          border:    '1px solid #374151',
          borderRadius:8,
          padding:   '12px 16px',
          minWidth:  200,
          fontSize:  12,
          color:     '#e2e8f0',
          boxShadow: '0 4px 24px #0008',
        }}>
          <div style={{ fontWeight:700, marginBottom:6, color:LAYER_COLORS[selected.layer] ?? '#fff' }}>
            {selected.label}
          </div>
          <div style={{ color: STATUS_COLORS[selected.status] }}>{selected.status}</div>
          {selected.blockNumber != null && (
            <div style={{ color:'#6b7280', marginTop:4 }}>Block #{selected.blockNumber.toLocaleString()}</div>
          )}
          {selected.peers > 0 && (
            <div style={{ color:'#6b7280' }}>Peers: {selected.peers}</div>
          )}
          <button
            onClick={() => setSelected(null)}
            style={{ marginTop:8, background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:11, padding:0 }}
          >
            × close
          </button>
        </div>
      )}

      {/* Footer stats */}
      <div style={{ padding:'8px 20px', borderTop:'1px solid #1e1e2e', display:'flex', gap:24, fontSize:10, color:'#4b5563' }}>
        <span>Nodes: <b style={{color:'#9ca3af'}}>{nodes.length}</b></span>
        <span>Bridges: <b style={{color:'#9ca3af'}}>{bridges.length}</b></span>
        <span>Validators: <b style={{color:'#9ca3af'}}>{valNodes.length}</b></span>
        <span style={{ marginLeft:'auto' }}>
          Updated: {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '—'}
        </span>
      </div>
    </div>
  );
}
