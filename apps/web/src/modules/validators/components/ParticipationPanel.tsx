'use client';

type ParticipationMetrics = { finality?: string; participation?: string; proposer?: string };

export function ParticipationPanel({ metrics }: { metrics: ParticipationMetrics }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Finality & participation</div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="pill">Finality: {metrics.finality ?? '?'}</div>
        <div className="pill">Participation: {metrics.participation ?? '?'}</div>
        <div className="pill">Proposer rotation: {metrics.proposer ?? '?'}</div>
      </div>
    </div>
  );
}
