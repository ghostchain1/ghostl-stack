'use client';

type Delegation = { delegator: string; delegate: string; weight: number };

export function DelegationPanel({ delegations }: { delegations: Delegation[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Delegation</div>
      <div className="stack" style={{ gap: 6 }}>
        {delegations.map((d) => (
          <div key={d.delegator} className="row" style={{ justifyContent: 'space-between' }}>
            <div className="mono">
              {d.delegator} → {d.delegate}
            </div>
            <div className="badge">{d.weight}</div>
          </div>
        ))}
        {!delegations.length && <div className="muted">No delegations.</div>}
      </div>
    </div>
  );
}
