'use client';

import type { Transfer } from '@ghostl/types/bridge';

export function TransfersTable({ transfers }: { transfers: Transfer[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Transfers</div>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Src</th>
            <th>Dst</th>
            <th>Status</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => (
            <tr key={t.id}>
              <td>{t.id}</td>
              <td>{t.srcChain}</td>
              <td>{t.dstChain}</td>
              <td>
                <span className={`badge ${t.status === 'finalized' ? 'ok' : t.status === 'pending' ? 'warn' : 'bad'}`}>{t.status}</span>
              </td>
              <td>{t.amount}</td>
            </tr>
          ))}
          {!transfers.length && (
            <tr>
              <td colSpan={5} className="muted">
                No transfers.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
