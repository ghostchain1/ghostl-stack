export const metadata = {
  title: 'Whitepapers',
  description: 'GhostChain research and technical whitepapers.',
};

const whitepapers = [
  {
    title: 'Constitutional Governance',
    version: 'v2.0 — 2026-03-10',
    color: 'var(--accent)',
    href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/docs/WHITEPAPER_CONSTITUTIONAL_GOVERNANCE.md',
    abstract:
      'Defines the constitutional rules, AI authority model, and governance controls for GhostChain L1/L2/L3. Covers routing law enforcement (L3→L2→L1 only), the six constitutional commitments, AI safety invariants (PolicyGuard, signing relay), GAIS circuit-breaker constraints, and on-chain amendment procedures via GhostConstitution.',
    tags: ['Governance', 'AI Safety', 'L1', 'On-chain Law'],
  },
  {
    title: 'Liquidity Gravity Engine',
    version: 'v2.0 — 2026-03-10',
    color: 'var(--accent-3)',
    href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/docs/WHITEPAPER_LIQUIDITY_GRAVITY.md',
    abstract:
      'Plain-language description of the governance-locked LGE: LoadBalancerVault, AdapterRegistry, SettlementOracle, CircuitBreaker, and RewardRouter. Version 2 adds the AI Layer integration — Economic Agent, demand_analyzer, supply_controller, GhostBrain risk scoring — and the orchestrator circuit-breaker for advisory rebalance proposals.',
    tags: ['LGE', 'AI Layer', 'Treasury', 'Settlement'],
  },
  {
    title: 'Autonomous Treasury',
    version: 'v1.1 — 2026-02-27',
    color: 'var(--accent-2)',
    href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/docs/Autonomous_Treasury_Whitepaper.md',
    abstract:
      'Fully Autonomous Treasury (FAT) system: on-chain ratification path (TreasuryRatificationProposal → Governor → ProposalExecutor → TreasuryController → TreasuryVault), AI role limitations, PolicyGuard enforcement, Global AI Orchestrator economic agent integration, formal invariants, emergency freeze-only path, and federation model.',
    tags: ['Treasury', 'FAT', 'Governance', 'AI Orchestrator'],
  },
  {
    title: 'AI Governance',
    version: 'v2.0 — 2026-03-10',
    color: '#a78bfa',
    href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/docs/architecture/ghostchain-ai-governance-whitepaper.md',
    abstract:
      'Phase 6+ multi-layer AI governance model: base consensus plane (CometBFT), AI governance plane (policy only), and Global AI Orchestrator plane. Documents the full agent roster, PolicyGuard authority matrix, GAIS VM safety constraints, governance agent routing-bypass detection (L3→L1 CRITICAL escalation), Python swarm integration, and evidence chain for regulatory audits.',
    tags: ['AI Orchestrator', 'GAIS', 'Phase 6+', 'Audit Trail'],
  },
  {
    title: 'GhostChain Compliance Framework',
    version: 'v1.0',
    color: '#fb923c',
    href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/README_COMPLIANCE.md',
    abstract:
      'Overview of the GhostChain compliance layer: KYC/AML enforcement via the Compliance Service (port 8090), routing guard constraints, GST-only token leakage prevention, Slither/Echidna integration for smart contract correctness, and the 15-layer branding audit (brand:full) required before every release.',
    tags: ['Compliance', 'KYC/AML', 'Smart Contracts', 'GST'],
  },
  {
    title: 'Treasury Constitution',
    version: 'v1.0',
    color: '#f472b6',
    href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/TREASURY_CONSTITUTION.md',
    abstract:
      'High-level constitutional principles for protocol-controlled treasury operations: no unilateral EOA authority, mandatory governance ratification path, reserve floors, epoch budget ceilings, treaty caps, and the freeze-only emergency procedure. Foundation document referenced by SovereignTreasuryEngine.',
    tags: ['Treasury', 'Constitution', 'Sovereign', 'Reserves'],
  },
];

export default function WhitepaperPage() {
  return (
    <div className="content" style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>
          Whitepapers
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem' }}>
          GhostChain research, technical specifications, and governance documents.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '1.25rem' }}>
        {whitepapers.map((wp) => (
          <a
            key={wp.title}
            href={wp.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.5rem',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                transition: 'border-color 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                  {wp.title}
                </h2>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: wp.color,
                    whiteSpace: 'nowrap',
                    paddingTop: '0.15rem',
                  }}
                >
                  {wp.version}
                </span>
              </div>

              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.6, margin: 0, flexGrow: 1 }}>
                {wp.abstract}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {wp.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.6rem',
                      borderRadius: '999px',
                      background: 'rgba(255,255,255,0.06)',
                      color: wp.color,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div style={{ fontSize: '0.78rem', color: wp.color, fontWeight: 600, marginTop: '0.25rem' }}>
                Read whitepaper ↗
              </div>
            </div>
          </a>
        ))}
      </div>

      <div
        style={{
          marginTop: '2rem',
          padding: '1.25rem 1.5rem',
          background: 'rgba(35,214,166,0.06)',
          border: '1px solid rgba(35,214,166,0.2)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: 0, lineHeight: 1.6 }}>
          All GhostChain whitepapers describe systems that enforce the routing law{' '}
          <strong style={{ color: 'var(--text)' }}>L3 → L2 → L1</strong>. AI may propose — humans must ratify.
          The gas token is <strong style={{ color: 'var(--accent)' }}>GST</strong> on all layers.
          No non-GhostChain chain dependencies. All layers settle to GhostChain L1.
        </p>
      </div>
    </div>
  );
}
