'use client';

import type { Transfer } from '@ghostchain/types/bridge';

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
            <th>Signatures</th>
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
              <td>
                <span className="pill">
                  {t.signatures?.length || 0}/{t.requiredSignatures || 2}
                </span>
              </td>
            </tr>
          ))}
          {!transfers.length && (
            <tr>
              <td colSpan={6} className="muted">
                No transfers.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
