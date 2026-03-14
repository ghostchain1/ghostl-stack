'use client';

type RevenueItem = { source: string; amount: string };

export function RevenuePanel({ items }: { items: RevenueItem[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Revenue</div>
      <div className="stack" style={{ gap: 6 }}>
        {items.map((r) => (
          <div key={r.source} className="row" style={{ justifyContent: 'space-between' }}>
            <div>{r.source}</div>
            <div className="badge">{r.amount}</div>
          </div>
        ))}
        {!items.length && <div className="muted">No revenue entries.</div>}
      </div>
    </div>
  );
}
