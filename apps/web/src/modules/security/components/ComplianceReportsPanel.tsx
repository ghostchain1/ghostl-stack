'use client';

type Report = { id: string; name: string; format: 'csv' | 'json' | 'pdf'; url?: string };

export function ComplianceReportsPanel({ reports }: { reports: Report[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Compliance reports</div>
      <div className="stack" style={{ gap: 8 }}>
        {reports.map((r) => (
          <div key={r.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{r.name}</div>
              <div className="muted">{r.format.toUpperCase()}</div>
            </div>
            {r.url ? (
              <a className="button secondary" href={r.url} download>
                Download
              </a>
            ) : (
              <div className="badge secondary">Generate</div>
            )}
          </div>
        ))}
        {!reports.length && <div className="muted">No reports available.</div>}
      </div>
    </div>
  );
}
