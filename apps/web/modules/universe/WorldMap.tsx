'use client';

import { useEffect, useState } from 'react';

interface Region {
  name:     string;
  x:        number;
  z:        number;
  width:    number;
  depth:    number;
  type:     string;
  capacity: number;
}

interface World {
  worldId:   string;
  name:      string;
  theme:     string;
  players:   number;
  maxPlayers:number;
}

const UNIVERSE_API = process.env.NEXT_PUBLIC_UNIVERSE_API ?? 'http://localhost:7700';
const TILE_SCALE   = 2; // px per tile unit

const REGION_COLORS: Record<string, string> = {
  'ghost-city':    '#1e3a5f',
  'ghost-arena':   '#5f1e1e',
  'ghost-casino':  '#3d1e5f',
  'ghost-mall':    '#1e5f3a',
  'ghost-festival':'#5f4a1e',
  residential:     '#2a3a2a',
  commercial:      '#2a2a3a',
  wilderness:      '#1a2a1a',
  default:         '#1a1a2a',
};

export function WorldMap() {
  const [worlds,    setWorlds]   = useState<World[]>([]);
  const [activeId,  setActiveId] = useState<string | null>(null);
  const [geoJson,   setGeoJson]  = useState<{ regions?: Region[] } | null>(null);

  useEffect(() => {
    fetch(`${UNIVERSE_API}/worlds`)
      .then(r => r.json())
      .then((d: { worlds: World[] }) => {
        setWorlds(d.worlds);
        if (d.worlds.length > 0 && !activeId) setActiveId(d.worlds[0].worldId);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    fetch(`${UNIVERSE_API}/worlds/${activeId}/map`)
      .then(r => r.json())
      .then((d: { map: { regions?: Region[] } }) => setGeoJson(d.map))
      .catch(console.error);
  }, [activeId]);

  const regions: Region[] = (geoJson?.regions ?? []) as Region[];

  // Compute canvas size from region extents
  const maxX = regions.reduce((m, r) => Math.max(m, r.x + r.width), 100);
  const maxZ = regions.reduce((m, r) => Math.max(m, r.z + r.depth), 100);

  return (
    <div className="ghost-world-map" style={{ fontFamily: 'monospace', color: '#e0e0e0' }}>
      <h2 style={{ marginBottom: 12 }}>Ghost Universe — World Map</h2>

      {/* World selector */}
      <div style={{ marginBottom: 12 }}>
        {worlds.map(w => (
          <button
            key={w.worldId}
            onClick={() => setActiveId(w.worldId)}
            style={{
              marginRight: 8, padding: '4px 12px',
              background: activeId === w.worldId ? '#5a0fd9' : '#222',
              color: '#fff', border: '1px solid #444', cursor: 'pointer', borderRadius: 4,
            }}
          >
            {w.name} ({w.players}/{w.maxPlayers})
          </button>
        ))}
      </div>

      {/* SVG map */}
      <div style={{ overflowAuto: 'hidden', border: '1px solid #333', display: 'inline-block' } as React.CSSProperties}>
        <svg
          width={maxX * TILE_SCALE}
          height={maxZ * TILE_SCALE}
          style={{ display: 'block', background: '#0a0a14' }}
        >
          {regions.map((r, i) => (
            <g key={i}>
              <rect
                x={r.x * TILE_SCALE}
                y={r.z * TILE_SCALE}
                width={r.width * TILE_SCALE}
                height={r.depth * TILE_SCALE}
                fill={REGION_COLORS[r.type] ?? REGION_COLORS.default}
                stroke="#444"
                strokeWidth={1}
              />
              <text
                x={(r.x + r.width / 2) * TILE_SCALE}
                y={(r.z + r.depth / 2) * TILE_SCALE + 4}
                textAnchor="middle"
                fontSize={10}
                fill="#aaa"
              >
                {r.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {regions.length === 0 && activeId && (
        <p style={{ color: '#666', marginTop: 12 }}>Loading world map…</p>
      )}
    </div>
  );
}
