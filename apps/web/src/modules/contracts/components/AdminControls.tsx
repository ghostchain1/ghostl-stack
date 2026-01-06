'use client';

type AdminAction = { label: string; action: string; enabled: boolean };

export function AdminControls({ actions }: { actions: AdminAction[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Admin controls</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {actions.map((a) => (
          <button key={a.action} className="button secondary" type="button" disabled={!a.enabled}>
            {a.label}
          </button>
        ))}
        {!actions.length && <div className="muted">No admin actions available.</div>}
      </div>
    </div>
  );
}
