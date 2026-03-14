import type { ApiError } from '../lib/api';
import { formatApiError } from '../lib/api';

export function DataFetchErrorCard({ title, error }: { title: string; error: ApiError }) {
  const details = formatApiError(error);
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="muted">Endpoint: {details.method} {details.endpoint}</div>
        <div className="muted">Status: {details.status}</div>
        <div className="muted">Error: {details.message}</div>
        {details.code && <div className="muted">Code: {details.code}</div>}
        <div className="muted">Fix: {details.hint}</div>
      </div>
    </div>
  );
}
