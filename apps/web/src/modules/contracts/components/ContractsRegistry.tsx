'use client';

import type { Contract } from '@ghostl/types/contracts';

export function ContractsRegistry({ contracts }: { contracts: Contract[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Contracts</div>
      <div className="table-wrap">
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
            {contracts.map((c, index) => {
              const chainId = (c as { chainId?: number }).chainId ?? 'na';
              const layer = (c as { layer?: string }).layer ?? 'na';
              const name = c.name || 'unknown';
              const verified = typeof c.verified === 'boolean' ? c.verified : undefined;
              const key = `${c.address}-${chainId}-${layer}-${name}-${index}`;
              return (
                <tr key={key}>
                  <td className="mono">{c.address.slice(0, 10)}…</td>
                  <td>{c.name || '—'}</td>
                  <td>
                    <span
                      className={`badge ${verified === true ? 'ok' : verified === false ? 'warn' : ''}`}
                    >
                      {verified === true ? 'verified' : verified === false ? 'unverified' : 'unknown'}
                    </span>
                  </td>
                  <td>{c.proxyType || '—'}</td>
                </tr>
              );
            })}
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
    </div>
  );
}
