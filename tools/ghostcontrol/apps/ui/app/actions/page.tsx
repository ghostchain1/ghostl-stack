export default function ActionsPage() {
  return (
    <div className="grid">
      <div className="card">
        <h2>Request Action</h2>
        <p className="muted">
          This skeleton only supports a safe request: restart a Docker Compose
          service (allowlisted by Policy).
        </p>
        <form action="/api/actions/request" method="post">
          <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
            <label>
              <div className="muted" style={{ marginBottom: 6 }}>
                Compose service name
              </div>
              <input name="service" placeholder="ghostcontrol-api" required />
            </label>
            <label>
              <div className="muted" style={{ marginBottom: 6 }}>
                Reason (optional)
              </div>
              <input name="reason" placeholder="Unhealthy container" />
            </label>
            <button type="submit">Queue SAFE restart</button>
          </div>
        </form>
      </div>
      <div className="card">
        <h2>How it flows</h2>
        <ol className="muted">
          <li>UI submits an Action Request to API</li>
          <li>Planner signs an Action Bundle</li>
          <li>Runner verifies + executes + writes evidence</li>
          <li>API stores evidence for audit</li>
        </ol>
      </div>
    </div>
  );
}

