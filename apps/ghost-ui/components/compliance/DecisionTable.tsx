export type DecisionRow = {
  request_id: string;
  action: string;
  decision: string;
  reasons: string[];
  required_controls: string[];
  disclosures: string[];
  created_at: string;
  wallet_address: string;
  chain_id: string;
};

export function DecisionTable({ decisions }: { decisions: DecisionRow[] }) {
  return (
    <div className="card">
      <h3>Decisions</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Request</th>
            <th>Action</th>
            <th>Decision</th>
            <th>Wallet</th>
            <th>Chain</th>
            <th>Reasons</th>
            <th>Controls</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => (
            <tr key={d.request_id}>
              <td className="code">{d.request_id}</td>
              <td>{d.action}</td>
              <td>
                <span className={`badge ${d.decision === 'deny' ? 'danger' : d.decision === 'allow_with_controls' ? 'warn' : ''}`}>
                  {d.decision}
                </span>
              </td>
              <td className="code">{d.wallet_address.slice(0, 10)}…</td>
              <td>{d.chain_id}</td>
              <td className="muted">{d.reasons.join(', ') || '--'}</td>
              <td className="muted">{d.required_controls.join(', ') || '--'}</td>
              <td className="muted">{new Date(d.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {!decisions.length && (
            <tr>
              <td colSpan={8} className="muted">
                No decisions found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
