type Law = {
  id: string;
  jurisdiction_code: string;
  topic: string;
  title: string;
  summary?: string | null;
  versions: Array<{ version: string; effective_from: string; effective_to?: string | null; text: string }>;
};

export function LawTimeline({ laws }: { laws: Law[] }) {
  return (
    <div className="card">
      <h3>Laws & Versions</h3>
      {laws.map((law) => (
        <div key={law.id} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600 }}>{law.title}</div>
          <div className="muted">
            {law.jurisdiction_code} · {law.topic}
          </div>
          <div className="muted">{law.summary || 'No summary provided.'}</div>
          <ul>
            {law.versions.map((v) => (
              <li key={v.version} className="muted">
                {v.version} · {v.effective_from}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!laws.length && <div className="muted">No laws ingested.</div>}
    </div>
  );
}
