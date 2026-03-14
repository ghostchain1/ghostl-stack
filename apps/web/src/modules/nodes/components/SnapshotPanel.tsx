'use client';

type SnapshotInfo = { id: string; createdAt: string; type: 'full' | 'pruned'; sizeGb?: number };

export function SnapshotPanel({ snapshots }: { snapshots: SnapshotInfo[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Snapshots / pruning</div>
      <div className="stack" style={{ gap: 6 }}>
        {snapshots.map((s) => (
          <div key={s.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{s.id}</div>
              <div className="muted">
                {s.type} · {s.createdAt} {s.sizeGb ? `· ${s.sizeGb} GB` : ''}
              </div>
            </div>
            <div className="badge secondary">Download</div>
          </div>
        ))}
        {!snapshots.length && <div className="muted">No snapshots.</div>}
      </div>
    </div>
  );
}
