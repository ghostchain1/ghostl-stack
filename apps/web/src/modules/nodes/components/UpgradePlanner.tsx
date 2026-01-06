'use client';

type UpgradePlan = { id: string; version: string; status: 'planned' | 'in-progress' | 'rolled-back' | 'done'; window?: string };

export function UpgradePlanner({ plans }: { plans: UpgradePlan[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Upgrades & version drift</div>
      <div className="stack" style={{ gap: 6 }}>
        {plans.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{p.id}</div>
              <div className="muted">
                Target {p.version} {p.window ? `· ${p.window}` : ''}
              </div>
            </div>
            <div className="badge">{p.status}</div>
          </div>
        ))}
        {!plans.length && <div className="muted">No upgrade plans.</div>}
      </div>
    </div>
  );
}
