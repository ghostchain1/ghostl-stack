'use client';
import { useEffect, useRef, useState } from 'react';

interface NodeInfo {
  id: string;
  label: string;
  type: 'l1' | 'l2' | 'validator' | 'l3' | 'ai';
  status: 'active' | 'syncing' | 'offline';
  tps?: number;
  peers?: number;
}

const MOCK_NODES: NodeInfo[] = [
  { id: 'ghostchain-l1', label: 'GhostChain L1',   type: 'l1',        status: 'active',  tps: 847, peers: 128 },
  { id: 'ghostl2-main',  label: 'GhostL2',          type: 'l2',        status: 'active',  tps: 9812, peers: 64 },
  { id: 'ghostbrain',    label: 'GhostBrain AI',    type: 'ai',        status: 'active' },
  { id: 'val-01',        label: 'Validator 01',     type: 'validator', status: 'active',  peers: 128 },
  { id: 'val-02',        label: 'Validator 02',     type: 'validator', status: 'active',  peers: 128 },
  { id: 'val-03',        label: 'Validator 03',     type: 'validator', status: 'syncing', peers: 112 },
  { id: 'val-04',        label: 'Validator 04',     type: 'validator', status: 'active',  peers: 128 },
  { id: 'ghost-fi',      label: 'GhostFi L3',       type: 'l3',        status: 'active',  tps: 1204 },
  { id: 'ghost-nft',     label: 'GhostNFT L3',      type: 'l3',        status: 'active',  tps: 421 },
  { id: 'ghost-pay',     label: 'GhostPay L3',      type: 'l3',        status: 'active',  tps: 3341 },
];

const TYPE_COLOR: Record<string, string> = {
  l1: '#FFD700',
  l2: '#FFAA00',
  ai: '#a78bfa',
  validator: '#C0C0C0',
  l3: '#38bdf8',
};

const STATUS_COLOR: Record<string, string> = {
  active: '#10b981',
  syncing: '#f59e0b',
  offline: '#ef4444',
};

function CommandCenter3DCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<NodeInfo | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0;
    let t = 0;

    /** 3D positions (unit sphere coords) for nodes — laid out by layer */
    const nodePositions = MOCK_NODES.map((n, i) => {
      switch (n.type) {
        case 'l1': return { x: 0, y: 0, z: 0 };
        case 'l2': return { x: 0, y: -0.12, z: 0 };
        case 'ai': return { x: 0.6, y: 0.35, z: 0.3 };
        case 'validator': {
          const idx = MOCK_NODES.filter((_, j) => j < i && MOCK_NODES[j].type === 'validator').length;
          const a = (idx / 4) * Math.PI * 2;
          return { x: 0.45 * Math.cos(a), y: 0.1, z: 0.45 * Math.sin(a) };
        }
        case 'l3': {
          const idx = MOCK_NODES.filter((_, j) => j < i && MOCK_NODES[j].type === 'l3').length;
          const a = (idx / 3) * Math.PI * 2;
          return { x: 0.85 * Math.cos(a), y: -0.3, z: 0.85 * Math.sin(a) };
        }
        default: return { x: 0, y: 0, z: 0 };
      }
    });

    const resize = () => {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    /** Project 3D → 2D with simple perspective */
    const project = (x: number, y: number, z: number, spin: number) => {
      const cosS = Math.cos(spin), sinS = Math.sin(spin);
      const rx = x * cosS - z * sinS;
      const rz = x * sinS + z * cosS;
      const fov = 1.8;
      const scale = fov / (fov + rz + 0.01);
      const cx = W / 2 + rx * W * 0.35 * scale;
      const cy = H / 2 + y * H * 0.35 * scale;
      return { cx, cy, scale };
    };

    let mouseX = W / 2, mouseY = H / 2;
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;

      // Detect hover — find closest projected node
      const spin = t * 0.15;
      let closest: NodeInfo | null = null;
      let minD = 36 * 36;
      MOCK_NODES.forEach((n, i) => {
        const p = nodePositions[i];
        const { cx, cy } = project(p.x, p.y, p.z, spin);
        const d = (mouseX - cx) ** 2 + (mouseY - cy) ** 2;
        if (d < minD) { minD = d; closest = n; }
      });
      setHoveredNode(closest);
    };
    canvas.addEventListener('mousemove', onMouseMove);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      t += 0.016;
      ctx.clearRect(0, 0, W, H);

      const spin = t * 0.15;

      // Background grid
      ctx.strokeStyle = 'rgba(255,215,0,0.04)';
      ctx.lineWidth = 1;
      const gridStep = 48;
      for (let gx = 0; gx < W; gx += gridStep) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let gy = 0; gy < H; gy += gridStep) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      // Draw connections
      const connections: [number, number][] = [];
      MOCK_NODES.forEach((n, i) => {
        if (n.type === 'l2' || n.type === 'validator' || n.type === 'ai') connections.push([0, i]);
        if (n.type === 'l3') connections.push([1, i]);
      });

      connections.forEach(([ai, bi]) => {
        const a = nodePositions[ai], b = nodePositions[bi];
        const pa = project(a.x, a.y, a.z, spin);
        const pb = project(b.x, b.y, b.z, spin);
        const alpha = Math.min(pa.scale, pb.scale) * 0.5;
        const grad = ctx.createLinearGradient(pa.cx, pa.cy, pb.cx, pb.cy);
        grad.addColorStop(0, `rgba(255,215,0,${alpha * 0.6})`);
        grad.addColorStop(1, `rgba(255,170,0,${alpha * 0.15})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.moveTo(pa.cx, pa.cy);
        ctx.lineTo(pb.cx, pb.cy);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Draw orbit rings
      const orbitRings = [
        [0, 0,    0, 0.5,  'rgba(192,192,192,0.12)'],
        [0, -0.12, 0, 0.95, 'rgba(255,170,0,0.08)'],
      ];
      orbitRings.forEach(([, oy, , r, c]) => {
        const sin30 = Math.sin(Math.PI / 8);
        ctx.save();
        ctx.translate(W / 2, H / 2 + Number(oy) * H * 0.35);
        ctx.scale(1, sin30 * 0.9);
        ctx.beginPath();
        ctx.arc(0, 0, Number(r) * W * 0.35, 0, Math.PI * 2);
        ctx.strokeStyle = String(c);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      });

      // Draw nodes back-to-front by z
      const sorted = MOCK_NODES.map((n, i) => {
        const p = nodePositions[i];
        const cosS = Math.cos(spin), sinS = Math.sin(spin);
        const rz = p.x * sinS + p.z * cosS;
        return { n, i, rz };
      }).sort((a, b) => b.rz - a.rz);

      sorted.forEach(({ n, i }) => {
        const p = nodePositions[i];
        const { cx, cy, scale } = project(p.x, p.y, p.z, spin);
        const col = TYPE_COLOR[n.type];
        const r = n.type === 'l1' ? 18 : n.type === 'l2' ? 13 : n.type === 'ai' ? 11 : n.type === 'validator' ? 8 : 7;
        const radius = r * scale;
        const isHovered = hoveredNode?.id === n.id;

        // Glow
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * (isHovered ? 4 : 2.5));
        glow.addColorStop(0, col + (isHovered ? '55' : '22'));
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * (isHovered ? 4 : 2.5), 0, Math.PI * 2);
        ctx.fill();

        // Core circle
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius);
        g.addColorStop(0, col + 'FF');
        g.addColorStop(1, col + '88');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5 * scale;
        ctx.stroke();

        // Status dot
        ctx.beginPath();
        ctx.arc(cx + radius * 0.6, cy - radius * 0.6, 3 * scale, 0, Math.PI * 2);
        ctx.fillStyle = STATUS_COLOR[n.status];
        ctx.fill();

        // Label
        if (scale > 0.7 || n.type === 'l1' || n.type === 'l2') {
          ctx.font = `${Math.round(9 * scale + 2)}px 'Orbitron','Inter',monospace`;
          ctx.fillStyle = `rgba(226,232,240,${scale * 0.9})`;
          ctx.textAlign = 'center';
          ctx.fillText(n.label, cx, cy + radius + 14 * scale);
        }
      });

      // Title overlay
      ctx.font = "bold 11px 'Orbitron','Inter',sans-serif";
      ctx.fillStyle = 'rgba(255,215,0,0.4)';
      ctx.textAlign = 'left';
      ctx.fillText('GHOSTCHAIN NETWORK TOPOLOGY', 16, 24);
      ctx.font = "9px 'Inter',sans-serif";
      ctx.fillStyle = 'rgba(100,116,139,0.8)';
      ctx.fillText('LIVE · AUTO-ROTATING', 16, 38);
    };

    draw();
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMouseMove);
    };
  }, [hoveredNode]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', cursor: hoveredNode ? 'pointer' : 'default' }}
      />
      {hoveredNode && (
        <div style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(10,10,10,0.92)',
          border: `1px solid ${TYPE_COLOR[hoveredNode.type]}44`,
          borderRadius: 10,
          padding: '1rem',
          minWidth: 200,
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ color: TYPE_COLOR[hoveredNode.type], fontFamily: "'Orbitron','Inter',sans-serif", fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            {hoveredNode.label}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Type: <span style={{ color: '#e2e8f0' }}>{hoveredNode.type.toUpperCase()}</span></div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Status: <span style={{ color: STATUS_COLOR[hoveredNode.status] }}>{hoveredNode.status}</span></div>
          {hoveredNode.tps != null && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>TPS: <span style={{ color: '#FFD700' }}>{hoveredNode.tps.toLocaleString()}</span></div>}
          {hoveredNode.peers != null && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Peers: <span style={{ color: '#e2e8f0' }}>{hoveredNode.peers}</span></div>}
        </div>
      )}
    </div>
  );
}

export default function CommandCenter3DPage() {
  return (
    <div style={{ background: '#0A0A0A', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid rgba(255,215,0,0.12)',
        background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(8px)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/assets/ghost-logo.png" alt="GhostChain" style={{ height: 28, objectFit: 'contain' }} />
          <div>
            <div style={{ fontFamily: "'Orbitron','Inter',sans-serif", color: '#FFD700', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em' }}>
              GHOSTCHAIN 3D COMMAND CENTER
            </div>
            <div style={{ color: '#64748b', fontSize: '0.65rem', letterSpacing: '0.08em' }}>
              NETWORK TOPOLOGY · AUTONOMOUS MONITORING
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {[
            { l: 'L1', v: '847 TPS',   c: '#FFD700' },
            { l: 'L2', v: '9,812 TPS', c: '#FFAA00' },
            { l: 'Validators', v: '128',c: '#C0C0C0' },
          ].map(s => (
            <div key={s.l} style={{ textAlign: 'right' }}>
              <div style={{ color: s.c, fontSize: '0.8rem', fontWeight: 700, fontFamily: "'Orbitron','Inter',sans-serif" }}>{s.v}</div>
              <div style={{ color: '#64748b', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main canvas area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <CommandCenter3DCanvas />
      </div>

      {/* Legend bar */}
      <div style={{
        display: 'flex',
        gap: '1.5rem',
        padding: '0.6rem 1.5rem',
        borderTop: '1px solid rgba(255,215,0,0.1)',
        background: 'rgba(10,10,10,0.8)',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        {Object.entries(TYPE_COLOR).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 4px ${color}` }} />
            <span style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{type}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem' }}>
          {Object.entries(STATUS_COLOR).map(([st, col]) => (
            <div key={st} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: col }} />
              <span style={{ color: '#64748b', fontSize: '0.7rem' }}>{st}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
