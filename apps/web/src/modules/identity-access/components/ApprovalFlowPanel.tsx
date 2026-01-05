'use client';

type Approval = { id: string; label: string; approved: boolean; approver?: string };

export function ApprovalFlowPanel({
  approvals,
  threshold
}: {
  approvals: Approval[];
  threshold: number;
}) {
  const approvedCount = approvals.filter((a) => a.approved).length;
  const status = approvedCount >= threshold ? 'Ready' : `Need ${threshold - approvedCount} more`;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Multi-sig approvals</div>
          <div className="muted">
            {approvedCount}/{threshold} approvals · {status}
          </div>
        </div>
        <div className="badge">{status}</div>
      </div>
      <div className="stack" style={{ marginTop: 10 }}>
        {approvals.map((a) => (
          <div key={a.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{a.label}</div>
              <div className="muted">{a.approver || 'Pending'}</div>
            </div>
            <div className={`badge ${a.approved ? '' : 'secondary'}`}>{a.approved ? 'Approved' : 'Pending'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
