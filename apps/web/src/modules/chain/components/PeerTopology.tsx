'use client';

type PeerInfo = { id: string; client: string; latencyMs?: number; country?: string; peers?: number };

export function PeerTopology({ peers }: { peers: PeerInfo[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Peer topology</div>
      <div className="stack" style={{ gap: 6 }}>
        {peers.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{p.id}</div>
              <div className="muted">
                {p.client} {p.country ? `· ${p.country}` : ''} {p.peers !== undefined ? `· peers ${p.peers}` : ''}
              </div>
            </div>
            <div className="badge">{p.latencyMs !== undefined ? `${p.latencyMs} ms` : '?'}</div>
          </div>
        ))}
        {!peers.length && <div className="muted">No peer data.</div>}
      </div>
    </div>
  );
}
