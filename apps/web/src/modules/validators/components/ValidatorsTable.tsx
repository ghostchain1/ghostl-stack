'use client';

import type { Validator } from '@ghostl/types/validators';

export function ValidatorsTable({ validators }: { validators: Validator[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Validators</div>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Stake</th>
            <th>Commission</th>
            <th>Power</th>
          </tr>
        </thead>
        <tbody>
          {validators.map((v) => (
            <tr key={v.id}>
              <td>{v.id}</td>
              <td>
                <span className={`badge ${v.status === 'active' ? 'ok' : v.status === 'jailed' ? 'warn' : 'bad'}`}>{v.status}</span>
              </td>
              <td>{v.stake}</td>
              <td>{v.commission}%</td>
              <td>{v.power}</td>
            </tr>
          ))}
          {!validators.length && (
            <tr>
              <td colSpan={5} className="muted">
                No validators found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
