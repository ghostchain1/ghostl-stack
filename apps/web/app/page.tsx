export default function HomePage() {
  return (
    <div className="content">
      <div className="card-grid">
        <div className="card">
          <h3>Chain Overview</h3>
          <p className="muted">Finality, block time, epochs.</p>
        </div>
        <div className="card">
          <h3>Nodes</h3>
          <p className="muted">Health, sync, peers.</p>
        </div>
        <div className="card">
          <h3>Alerts</h3>
          <p className="muted">Routing + notifications.</p>
        </div>
      </div>
    </div>
  );
}
