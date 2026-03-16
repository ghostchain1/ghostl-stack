'use client';

import type { BridgeControl } from '@ghostchain/types/bridge';

export function EmergencyControls({ control }: { control: BridgeControl }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Emergency controls</div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="pill">Paused: {control.paused ? 'Yes' : 'No'}</div>
        <div className="pill">Fee: {control.feeBps ?? '?'} bps</div>
        <div className="pill">Emergency mode: {control.emergencyMode ? 'On' : 'Off'}</div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className="button secondary" type="button">
            Pause
          </button>
          <button className="button secondary" type="button">
            Resume
          </button>
          <button className="button secondary" type="button">
            Withdraw
          </button>
        </div>
      </div>
    </div>
  );
}
