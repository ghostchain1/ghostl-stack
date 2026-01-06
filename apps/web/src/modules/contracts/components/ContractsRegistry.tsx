'use client';

import type { Contract } from '@ghostchain/types/contracts';

export function ContractsRegistry({ contracts }: { contracts: Contract[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Contracts</div>
      <table className="table">
        <thead>
          <tr>
            <th>Address</th>
            <th>Name</th>
            <th>Verified</th>
            <th>Proxy</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <tr key={c.address}>
              <td className="mono">{c.address.slice(0, 10)}…</td>
              <td>{c.name || '—'}</td>
              <td>
                <span className={`badge ${c.verified ? 'ok' : 'warn'}`}>{c.verified ? 'verified' : 'unverified'}</span>
              </td>
              <td>{c.proxyType || '—'}</td>
            </tr>
          ))}
          {!contracts.length && (
            <tr>
              <td colSpan={4} className="muted">
                No contracts in registry.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
