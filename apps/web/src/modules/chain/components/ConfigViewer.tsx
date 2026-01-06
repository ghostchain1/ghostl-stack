'use client';

type ConfigKV = { key: string; value: string };

export function ConfigViewer({ items }: { items: ConfigKV[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Config (read-only)</div>
      <div className="stack" style={{ gap: 4 }}>
        {items.map((kv) => (
          <div key={kv.key} className="row" style={{ justifyContent: 'space-between' }}>
            <div className="muted">{kv.key}</div>
            <div className="mono">{kv.value}</div>
          </div>
        ))}
        {!items.length && <div className="muted">No config available.</div>}
      </div>
    </div>
  );
}
