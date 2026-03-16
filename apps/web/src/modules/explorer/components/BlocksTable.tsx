'use client';

import type { Block } from '@ghostchain/types/explorer';

export function BlocksTable({ blocks }: { blocks: Block[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Blocks</div>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Hash</th>
            <th>Proposer</th>
            <th>Txs</th>
            <th>Size</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((b) => (
            <tr key={b.hash}>
              <td>{b.number}</td>
              <td className="mono">{b.hash.slice(0, 10)}…</td>
              <td className="mono">{b.proposer || '—'}</td>
              <td>{b.txCount}</td>
              <td>{b.size ?? '—'}</td>
              <td>{b.time}</td>
            </tr>
          ))}
          {!blocks.length && (
            <tr>
              <td colSpan={6} className="muted">
                No blocks found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
