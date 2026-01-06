'use client';

type VaultHealth = { sealed: boolean; latencyMs?: number; errors?: number };

export function VaultHealthCard({ health }: { health: VaultHealth }) {
  const status = health.sealed ? 'Sealed' : 'Unsealed';
  const tone = health.sealed ? 'warn' : 'ok';
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Vault / HSM</div>
          <div className="muted">Seal/unseal state, latency, errors</div>
        </div>
        <div className={`badge ${tone}`}>{status}</div>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        Latency: {health.latencyMs !== undefined ? `${health.latencyMs} ms` : '?'} · Errors: {health.errors ?? 0}
      </div>
    </div>
  );
}
