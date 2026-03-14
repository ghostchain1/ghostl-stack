type Prediction = {
  id: string;
  jurisdiction: string;
  topic: string;
  risk_delta: number;
  summary: string;
  created_at: string;
};

export function PredictionCards({ predictions }: { predictions: Prediction[] }) {
  return (
    <div className="card">
      <h3>AI Predictions</h3>
      <div className="card-grid">
        {predictions.map((p) => (
          <div key={p.id} className="card" style={{ minWidth: 240 }}>
            <div className="badge">{p.jurisdiction}</div>
            <div style={{ fontWeight: 600 }}>{p.topic.toUpperCase()}</div>
            <div className="muted">Risk delta: {p.risk_delta.toFixed(2)}</div>
            <div className="muted">{p.summary}</div>
            <div className="muted">{new Date(p.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
      {!predictions.length && <div className="muted">No predictions yet.</div>}
    </div>
  );
}
