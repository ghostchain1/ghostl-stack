'use client';

type Summary = { pending?: number; finalized?: number; signaturesMissing?: number };

export function BridgeMetrics({ summary }: { summary?: Summary }) {
  const stats = summary || { pending: 0, finalized: 0, signaturesMissing: 0 };
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Bridge metrics</div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="pill warn">Pending: {stats.pending ?? 0}</div>
        <div className="pill ok">Finalized: {stats.finalized ?? 0}</div>
        <div className="pill bad">Missing signatures: {stats.signaturesMissing ?? 0}</div>
        <div className="muted">Focus on clearing pending and ensuring multisig coverage.</div>
      </div>
    </div>
  );
}
