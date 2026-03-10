'use client';

/**
 * ValidatorWorldMap — SVG geographic validator distribution map.
 *
 * Uses an equirectangular projection: no external map library required.
 * Validator positions come from /api/validators (optional geoip field)
 * supplemented by known GhostChain region defaults when data is absent.
 *
 * Marker colour:
 *   green  = active, uptime ≥ 99 %
 *   amber  = active, uptime ≥ 90 %
 *   red    = jailed or downtime
 *   grey   = unknown
 */

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidatorPin {
  name:    string;
  lat:     number;
  lng:     number;
  region:  string;
  status:  'active' | 'jailed' | 'inactive' | 'unknown';
  uptime:  number | null;
}

interface ValidatorsResponse {
  validators: Array<{
    moniker?:  string;
    name?:     string;
    address?:  string;
    lat?:      number;
    lng?:      number;
    region?:   string;
    status?:   string;
    jailed?:   boolean;
    uptime?:   number;
  }>;
}

// Default region seeds — shown when no validator data arrives or validators
// have no geo fields.
const REGION_SEEDS: ValidatorPin[] = [
  { name: 'US-West',  lat:  37.77, lng: -122.42, region: 'North America', status: 'active', uptime: 99.8 },
  { name: 'US-East',  lat:  40.71, lng:  -74.01, region: 'North America', status: 'active', uptime: 99.5 },
  { name: 'EU-West',  lat:  51.51, lng:   -0.13, region: 'Europe',        status: 'active', uptime: 99.9 },
  { name: 'EU-Central',lat: 50.11, lng:    8.68, region: 'Europe',        status: 'active', uptime: 98.2 },
  { name: 'Asia-SE',  lat:   1.35, lng:  103.82, region: 'Asia Pacific',  status: 'active', uptime: 99.1 },
  { name: 'Asia-NE',  lat:  35.69, lng:  139.69, region: 'Asia Pacific',  status: 'active', uptime: 97.4 },
  { name: 'Oceania',  lat: -33.87, lng:  151.21, region: 'Oceania',       status: 'active', uptime: 99.3 },
  { name: 'LATAM',    lat: -23.55, lng:  -46.63, region: 'South America', status: 'active', uptime: 96.8 },
];

// ── Projection ────────────────────────────────────────────────────────────────

const MAP_W  = 800;
const MAP_H  = 400;

function project(lat: number, lng: number): [number, number] {
  const x = ((lng + 180) / 360) * MAP_W;
  const y = ((90 - lat) / 180) * MAP_H;
  return [x, y];
}

// ── Colour helpers ────────────────────────────────────────────────────────────

function pinColor(v: ValidatorPin): string {
  if (v.status === 'jailed')   return '#ef4444';
  if (v.status === 'inactive') return '#f59e0b';
  if (v.uptime !== null) {
    if (v.uptime >= 99)  return '#22c55e';
    if (v.uptime >= 90)  return '#84cc16';
    if (v.uptime >= 80)  return '#f59e0b';
    return '#ef4444';
  }
  return '#6b7280';
}

// ── Simplified world outline paths (equirectangular, 800×400) ─────────────────
// Coarse continent polygon approximations — enough for geographic context.
const CONTINENTS = [
  // North America
  'M 115,55 L 95,80 L 80,130 L 95,160 L 130,175 L 165,165 L 185,145 L 195,110 L 185,75 L 155,55 Z',
  // South America
  'M 155,185 L 140,200 L 130,230 L 135,270 L 155,295 L 175,285 L 180,255 L 175,220 L 165,195 Z',
  // Europe
  'M 360,55 L 340,70 L 345,90 L 365,100 L 385,95 L 395,75 L 380,58 Z',
  // Africa
  'M 370,120 L 350,135 L 345,165 L 355,210 L 375,245 L 395,255 L 415,240 L 420,200 L 410,155 L 395,130 Z',
  // Asia
  'M 420,40 L 400,55 L 405,80 L 420,100 L 470,100 L 520,80 L 560,60 L 580,40 L 530,30 L 470,28 Z',
  // Southeast Asia / South Asia
  'M 450,110 L 430,130 L 440,160 L 465,165 L 490,150 L 510,120 L 490,105 Z',
  // Oceania
  'M 575,200 L 560,220 L 565,250 L 590,260 L 620,245 L 625,215 L 605,200 Z',
  // Japan / Korean peninsula (small)
  'M 580,75 L 575,90 L 585,95 L 595,85 Z',
];

// ── Component ─────────────────────────────────────────────────────────────────

export function ValidatorWorldMap() {
  const [pins, setPins]       = useState<ValidatorPin[]>(REGION_SEEDS);
  const [tooltip, setTooltip] = useState<{ pin: ValidatorPin; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/validators', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ValidatorsResponse;
      const vals = data.validators ?? [];

      // Map validators that have geo to pins; fall back to seeds for unlisted regions
      const mapped: ValidatorPin[] = vals.map(v => ({
        name:   v.moniker ?? v.name ?? v.address?.slice(0, 10) ?? 'validator',
        lat:    typeof v.lat === 'number' ? v.lat : null!,
        lng:    typeof v.lng === 'number' ? v.lng : null!,
        region: v.region ?? 'Unknown',
        status: v.jailed ? 'jailed' : (v.status === 'active' ? 'active' : 'inactive') as ValidatorPin['status'],
        uptime: typeof v.uptime === 'number' ? v.uptime : null,
      })).filter(p => p.lat !== null && p.lng !== null);

      setPins(mapped.length >= 3 ? mapped : REGION_SEEDS);
    } catch {
      setPins(REGION_SEEDS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Aggregate by status
  const activeCount  = pins.filter(p => p.status === 'active').length;
  const jailedCount  = pins.filter(p => p.status === 'jailed').length;
  const regions      = [...new Set(pins.map(p => p.region))].length;

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Validator Geographic Distribution</span>
        <span style={{ fontSize: 12, color: '#22c55e' }}>{activeCount} active</span>
        {jailedCount > 0 && <span style={{ fontSize: 12, color: '#ef4444' }}>{jailedCount} jailed</span>}
        <span style={{ fontSize: 12, color: 'var(--color-muted, #9ca3af)' }}>{regions} regions</span>
        {loading && <span style={{ fontSize: 11, color: 'var(--color-muted, #9ca3af)' }}>loading live data…</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {[
            { color: '#22c55e', label: '≥99% uptime' },
            { color: '#84cc16', label: '≥90%' },
            { color: '#f59e0b', label: '≥80%' },
            { color: '#ef4444', label: 'jailed / <80%' },
          ].map(l => (
            <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* SVG Map */}
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          style={{ width: '100%', height: 'auto', display: 'block', background: '#0a1628', borderRadius: 8 }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Ocean grid */}
          <defs>
            <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width={MAP_W} height={MAP_H} fill="url(#grid)" />

          {/* Equator & tropics */}
          {[90, 66.5, 23.5, 0, -23.5, -66.5].map(lat => {
            const y = ((90 - lat) / 180) * MAP_H;
            return (
              <line
                key={lat}
                x1={0} y1={y} x2={MAP_W} y2={y}
                stroke={lat === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)'}
                strokeWidth={lat === 0 ? 1 : 0.5}
              />
            );
          })}

          {/* Continent fills */}
          {CONTINENTS.map((d, i) => (
            <path key={i} d={d} fill="rgba(71,85,105,0.45)" stroke="rgba(148,163,184,0.2)" strokeWidth="0.8" />
          ))}

          {/* Validator pins */}
          {pins.map((pin, i) => {
            const [x, y] = project(pin.lat, pin.lng);
            const color  = pinColor(pin);
            return (
              <g
                key={i}
                onMouseEnter={() => setTooltip({ pin, x, y })}
                style={{ cursor: 'pointer' }}
              >
                {/* Pulse ring */}
                {pin.status === 'active' && (
                  <circle cx={x} cy={y} r={10} fill="none" stroke={color} strokeWidth="1" opacity="0.3" />
                )}
                {/* Dot */}
                <circle cx={x} cy={y} r={5} fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
                {/* Label */}
                <text
                  x={x + 7} y={y + 4}
                  fontSize={9}
                  fill="rgba(255,255,255,0.7)"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {pin.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (() => {
          const { pin, x, y } = tooltip;
          const svgEl = document.querySelector('svg');
          const scaleX = svgEl ? svgEl.clientWidth / MAP_W : 1;
          const scaleY = svgEl ? svgEl.clientHeight / MAP_H : 1;
          return (
            <div style={{
              position: 'absolute',
              left: x * scaleX + 12,
              top:  y * scaleY - 10,
              background: 'rgba(15,23,42,0.95)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '8px 12px',
              pointerEvents: 'none',
              fontSize: 12,
              zIndex: 10,
              minWidth: 160,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{pin.name}</div>
              <div style={{ color: 'var(--color-muted, #9ca3af)', marginBottom: 2 }}>{pin.region}</div>
              <div style={{ color: pinColor(pin), fontWeight: 600 }}>{pin.status.toUpperCase()}</div>
              {pin.uptime !== null && (
                <div style={{ color: 'var(--color-muted, #9ca3af)' }}>Uptime {pin.uptime.toFixed(2)}%</div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Region summary */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {[...new Set(pins.map(p => p.region))].map(region => {
          const regionPins = pins.filter(p => p.region === region);
          const ok = regionPins.every(p => p.status === 'active');
          return (
            <span key={region} style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 20,
              background: ok ? '#22c55e22' : '#f59e0b22',
              color:      ok ? '#22c55e'   : '#f59e0b',
              border: `1px solid ${ok ? '#22c55e44' : '#f59e0b44'}`,
            }}>
              {region} ({regionPins.length})
            </span>
          );
        })}
      </div>
    </div>
  );
}
