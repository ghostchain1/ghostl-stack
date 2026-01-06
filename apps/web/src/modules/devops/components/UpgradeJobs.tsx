'use client';

type Job = { id: string; target: string; status: 'planned' | 'running' | 'failed' | 'done'; startedAt?: string };

export function UpgradeJobs({ jobs }: { jobs: Job[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Upgrade jobs</div>
      <div className="stack" style={{ gap: 6 }}>
        {jobs.map((j) => (
          <div key={j.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{j.target}</div>
              <div className="muted">{j.startedAt || '—'}</div>
            </div>
            <div className={`badge ${j.status === 'running' ? 'warn' : j.status === 'failed' ? 'bad' : 'ok'}`}>{j.status}</div>
          </div>
        ))}
        {!jobs.length && <div className="muted">No upgrade jobs.</div>}
      </div>
    </div>
  );
}
