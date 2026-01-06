'use client';

type QueueItem = { id: string; eta: string; action: string; status: 'queued' | 'executed' | 'canceled' };

export function ExecutionQueue({ queue }: { queue: QueueItem[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Execution queue</div>
      <div className="stack" style={{ gap: 6 }}>
        {queue.map((q) => (
          <div key={q.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{q.action}</div>
              <div className="muted">ETA {q.eta}</div>
            </div>
            <div className={`badge ${q.status === 'executed' ? 'ok' : q.status === 'queued' ? 'warn' : 'bad'}`}>{q.status}</div>
          </div>
        ))}
        {!queue.length && <div className="muted">Queue empty.</div>}
      </div>
    </div>
  );
}
