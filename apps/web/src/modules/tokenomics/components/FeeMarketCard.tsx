'use client';

type FeeModel = { baseFee?: string; targetGas?: string; mode?: string };

export function FeeMarketCard({ model }: { model: FeeModel }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Fee market & gas</div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="pill">Base fee: {model.baseFee ?? '?'}</div>
        <div className="pill">Target gas: {model.targetGas ?? '?'}</div>
        <div className="pill">Mode: {model.mode ?? 'auto'}</div>
      </div>
    </div>
  );
}
