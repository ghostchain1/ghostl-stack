'use client';

type Surface = { name: string; exposure: string; status: string };

export function AttackSurfaceList({ surfaces }: { surfaces: Surface[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Attack surface</div>
      <div className="stack" style={{ gap: 6 }}>
        {surfaces.map((s) => (
          <div key={s.name} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{s.name}</div>
              <div className="muted">{s.exposure}</div>
            </div>
            <div className="badge">{s.status}</div>
          </div>
        ))}
        {!surfaces.length && <div className="muted">No surface data loaded.</div>}
      </div>
    </div>
  );
}
