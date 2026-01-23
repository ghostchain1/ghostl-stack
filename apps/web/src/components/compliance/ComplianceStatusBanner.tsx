type ComplianceStatus = {
  ok?: boolean;
  status?: string;
  service?: string;
};

const resolveComplianceBase = () =>
  process.env.COMPLIANCE_URL || process.env.NEXT_PUBLIC_COMPLIANCE_URL || 'http://localhost:8090';

export async function ComplianceStatusBanner() {
  const baseUrl = resolveComplianceBase();
  let status: ComplianceStatus | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(`${baseUrl}/health`, { cache: 'no-store' });
    if (!res.ok) {
      error = `HTTP ${res.status}`;
    } else {
      status = (await res.json()) as ComplianceStatus;
      if (status && status.ok === false) {
        error = status.status || 'unhealthy';
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'unreachable';
  }

  const healthy = !error;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Compliance API status</div>
          <div className="muted">{baseUrl}</div>
        </div>
        <div className={`badge ${healthy ? 'ok' : 'bad'}`}>{healthy ? 'healthy' : 'down'}</div>
      </div>
      {!healthy && <div className="muted" style={{ marginTop: 8 }}>Error: {error}</div>}
      {healthy && status?.status && <div className="muted" style={{ marginTop: 8 }}>Status: {status.status}</div>}
    </div>
  );
}
