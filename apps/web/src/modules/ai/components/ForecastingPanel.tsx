'use client';

import type { Forecast } from '@ghostchain/types/ai';

export function ForecastingPanel({ forecasts }: { forecasts: Forecast[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Forecasts</div>
      <div className="stack" style={{ gap: 6 }}>
        {forecasts.map((f) => (
          <div key={`${f.metric}-${f.horizon}`} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{f.metric}</div>
              <div className="muted">Horizon {f.horizon}</div>
            </div>
            <div className="pill">
              {f.value} (p={Math.round(f.confidence * 100)}%)
            </div>
          </div>
        ))}
        {!forecasts.length && <div className="muted">No forecasts.</div>}
      </div>
    </div>
  );
}
