export type EvidenceBundle = {
  id: string;
  prev_hash: string | null;
  hash: string;
  artifacts?: unknown;
  created_at: string;
};

export function EvidenceViewer({ evidence }: { evidence?: EvidenceBundle }) {
  return (
    <div className="card">
      <h3>Evidence Bundle</h3>
      {evidence ? (
        <div className="stack">
          <div className="muted">Bundle ID: {evidence.id}</div>
          <div className="muted">Prev hash: {evidence.prev_hash || 'genesis'}</div>
          <div className="muted">Hash: {evidence.hash}</div>
          <pre className="code">{JSON.stringify(evidence.artifacts ?? {}, null, 2)}</pre>
        </div>
      ) : (
        <div className="muted">Select an evidence bundle to view details.</div>
      )}
    </div>
  );
}
