'use client';

import type { Tx } from '@ghostl/types/explorer';

export function TransactionsTable({ txs }: { txs: Tx[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Transactions</div>
      <table className="table">
        <thead>
          <tr>
            <th>Hash</th>
            <th>From</th>
            <th>To</th>
            <th>Value</th>
            <th>Status</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {txs.map((tx) => (
            <tr key={tx.hash}>
              <td className="mono">{tx.hash.slice(0, 10)}…</td>
              <td className="mono">{tx.from.slice(0, 10)}…</td>
              <td className="mono">{tx.to ? `${tx.to.slice(0, 10)}…` : 'contract'}</td>
              <td>{tx.value}</td>
              <td>
                <span className={`badge ${tx.status === 'success' ? 'ok' : tx.status === 'pending' ? 'warn' : 'bad'}`}>
                  {tx.status}
                </span>
              </td>
              <td className="muted">{tx.error || ''}</td>
            </tr>
          ))}
          {!txs.length && (
            <tr>
              <td colSpan={6} className="muted">
                No transactions found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
