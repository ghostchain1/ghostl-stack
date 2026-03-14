export default function Page() {
  return (
    <section className="ghost-hero">
      <div className="container">
        <span className="section-label text-center">Governance</span>
        <div style={{ fontSize: "64px", margin: "0.5rem 0 1.5rem", lineHeight: 1 }}>&#9878;</div>
        <h1 className="section-title">Governance Portal</h1>
        <p className="section-sub">Submit proposals, vote on protocol changes, and participate in the GhostChain DAO.</p>
        <span className="badge-pill">Coming Soon</span>

        <nav className="ghost-hero-links">
          <a href="https://ghostchain.cloud">&#8592; Home</a>
          <a href="https://invest.ghostchain.cloud">Investors</a>
          <a href="https://explorer.ghostchain.cloud">Explorer</a>
          <a href="https://dev.ghostchain.cloud">Developers</a>
          <a href="https://nodes.ghostchain.cloud">Nodes</a>
          <a href="https://governance.ghostchain.cloud">Governance</a>
          <a href="https://status.ghostchain.cloud">Status</a>
        </nav>
      </div>
    </section>
  );
}
