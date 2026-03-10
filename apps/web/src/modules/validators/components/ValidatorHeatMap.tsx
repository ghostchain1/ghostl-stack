'use client';

/**
 * ValidatorHeatMap.tsx — Visual distribution of validators by region/status.
 *
 * Renders a grid of validator tiles sized by voting power and coloured by
 * health (uptime).  No external charting library — pure CSS + inline styles.
 */

import { useValidatorStore } from '../../../store/validatorStore';

// Uptime thresholds → color
function uptimeColor(pct: number | undefined): string {
  if (pct == null)  return '#374151';   // unknown — grey
  if (pct >= 99)    return '#22c55e';   // excellent — green
  if (pct >= 95)    return '#84cc16';   // good — lime
  if (pct >= 90)    return '#f59e0b';   // warn — amber
  return '#ef4444';                      // poor — red
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ValidatorHeatMap() {
  const { validators, perf, loading } = useValidatorStore();

  const perfMap = new Map(perf.map(p => [p.address, p]));

  // Sorted by power descending
  const sorted = [...validators].sort((a, b) => b.power - a.power);

  if (loading && validators.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Validator Heat Map</div>
        <p className="muted" style={{ fontSize: 12 }}>Loading validator data…</p>
      </div>
    );
  }

  if (validators.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Validator Heat Map</div>
        <p className="muted" style={{ fontSize: 12 }}>No validators found.</p>
      </div>
    );
  }

  const maxPower = Math.max(...validators.map(v => v.power), 1);

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Validator Heat Map</span>
        <div style={{ display: 'flex', gap: 10, fontSize: 10 }}>
          {[
            { color: '#22c55e', label: '≥99%' },
            { color: '#84cc16', label: '≥95%' },
            { color: '#f59e0b', label: '≥90%' },
            { color: '#ef4444', label: '<90%' },
            { color: '#374151', label: 'unknown' },
          ].map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginTop: 8,
        }}
      >
        {sorted.map(v => {
          const vPerf = perfMap.get(v.address);
          const color = uptimeColor(vPerf?.uptimePct);
          // Tile size proportional to voting power (min 32px, max 80px)
          const ratio = v.power / maxPower;
          const size  = Math.round(32 + ratio * 48);
          const isJailed = v.status === 'jailed';

          return (
            <div
              key={v.id}
              title={[
                v.id,
                `Power: ${(v.powerPct * 100).toFixed(1)}%`,
                vPerf ? `Uptime: ${vPerf.uptimePct.toFixed(1)}%` : '',
                `Status: ${statusLabel(v.status)}`,
              ].filter(Boolean).join('\n')}
              style={{
                width:        size,
                height:       size,
                background:   isJailed ? '#1f0000' : `${color}25`,
                border:       `2px solid ${isJailed ? '#ef4444' : color}`,
                borderRadius: 6,
                display:      'flex',
                flexDirection: 'column',
                alignItems:   'center',
                justifyContent: 'center',
                overflow:     'hidden',
                cursor:       'default',
                position:     'relative',
                transition:   'transform 0.15s',
              }}
            >
              {isJailed && (
                <span
                  style={{
                    position: 'absolute',
                    top: 1,
                    right: 3,
                    fontSize: 8,
                    color: '#ef4444',
                    fontWeight: 700,
                  }}
                >
                  JAILED
                </span>
              )}
              <span style={{ fontSize: Math.max(7, size / 6), fontWeight: 700, color, textAlign: 'center', padding: 2, wordBreak: 'break-all' }}>
                {v.id.length > 10 ? `${v.id.slice(0, 8)}…` : v.id}
              </span>
              {vPerf && (
                <span style={{ fontSize: Math.max(6, size / 7), color: '#9ca3af' }}>
                  {vPerf.uptimePct.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
        {validators.length} validator{validators.length !== 1 ? 's' : ''} · tile size = voting power · colour = uptime
      </p>
    </div>
  );
}
