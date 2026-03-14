export const metadata = {
  title: 'Documentation',
  description: 'GhostChain developer and operator documentation hub.',
};

const sections = [
  {
    title: 'Architecture',
    color: 'var(--accent)',
    items: [
      { label: 'Full Stack Architecture', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/docs/ARCHITECTURE.md', desc: 'L1/L2/L3 topology, AI layer, LGE, bridge, validators, port reference.' },
      { label: 'AI Governance Whitepaper', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/docs/architecture/ghostchain-ai-governance-whitepaper.md', desc: 'Phase 6+ orchestrator, authority model, GAIS, evidence chain.' },
      { label: 'LGE Architecture Deep-Dive', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/docs/ARCHITECTURE.md#liquidity-gravity-engine', desc: 'LoadBalancerVault, AdapterRegistry, SettlementOracle, CircuitBreaker.' },
      { label: 'Bridge Architecture', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/docs/ai-guard-opstack.md', desc: 'GhostBridge, OP Stack anchoring, finality oracles.' },
    ],
  },
  {
    title: 'AI Systems',
    color: 'var(--accent-3)',
    items: [
      { label: 'GhostBrain Core (port 7900)', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/ghost-brain-core/docs/developer_guide.md', desc: 'Transaction classification, risk scoring, fraud detection, autonomous proposals.' },
      { label: 'Global AI Orchestrator', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/ai-orchestrator/', desc: 'PolicyGuard, TaskScheduler, agent roster (economic, governance, security, infra).' },
      { label: 'GAIS — Autonomous VM Supervisor', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/infra/hypervisor/supervisor/', desc: 'VM/container auto-restart within allowlists, cooldown + circuit-breaker.' },
      { label: 'Python AI Swarm', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/ghost-brain-core/', desc: 'Evolution layer, routing engine, orchestration networking.' },
    ],
  },
  {
    title: 'Governance',
    color: 'var(--accent-2)',
    items: [
      { label: 'GhostChainGovernor', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/contracts/src/governance/', desc: 'Custom governor — quorum, supermajority, timelock, proposal lifecycle.' },
      { label: 'GhostConstitution', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/contracts/src/constitution/GhostConstitution.sol', desc: 'On-chain constitutional law — immutable + amendable, ZK verifier integration.' },
      { label: 'Governance Event Bridge', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/services/governance-event-bridge/', desc: 'L1/L2 governor event polling → GhostBrain signals.' },
      { label: 'Signing Relay (port 7910)', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/docs/ARCHITECTURE.md#governance', desc: 'Human-ratification queue for all AI-generated governance proposals.' },
    ],
  },
  {
    title: 'Economics & Treasury',
    color: '#a78bfa',
    items: [
      { label: 'SovereignTreasuryEngine', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/contracts/src/treasury/', desc: 'On-chain canonical treasury — reserves, budgets, treaty federation.' },
      { label: 'Treasury Engine Service (port 7683)', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/services/treasury-engine/', desc: 'Off-chain treasury state aggregation and service API.' },
      { label: 'Reward Distributor (port 7684)', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/services/reward-distributor/', desc: 'Epoch reward scheduling and distribution.' },
      { label: 'Economic AI', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/economic-ai/', desc: 'Demand analysis, supply control, GST tokenomics models.' },
    ],
  },
  {
    title: 'Developer Setup',
    color: '#f472b6',
    items: [
      { label: 'DEV_SETUP.md', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/docs/DEV_SETUP.md', desc: 'Full environment setup: Node >=22.21.0, npm 10.9.4, docker-compose devnet.' },
      { label: 'Build Commands', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/.github/copilot-instructions.md#build--test-commands', desc: 'forge build/test, npm run build, brand:full, gst:leakage.' },
      { label: 'Foundry Profiles', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/contracts/foundry.toml', desc: 'default, legacy (paris), gns, ai, exchange test profiles.' },
      { label: 'stack.env.example', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/stack.env.example', desc: 'All service URLs, chain IDs, ports — copy to .env to start devnet.' },
    ],
  },
  {
    title: 'Security & Compliance',
    color: '#fb923c',
    items: [
      { label: 'Audit Report 2026-02-27', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/AUDIT_REPORT_2026-02-27.md', desc: 'Latest security audit findings and resolutions.' },
      { label: 'Routing Guard', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/packages/routing-guard/', desc: 'On-chain routing law enforcement — L3→L2→L1 only.' },
      { label: 'Compliance Service (port 8090)', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/docs/ARCHITECTURE.md#compliance', desc: 'KYC/AML enforcement, JWT-secured endpoints.' },
      { label: 'Slither / Echidna', href: 'https://github.com/ghostchain1/ghostl-stack/blob/main/contracts/formal/', desc: 'Static analysis and invariant fuzzing integration.' },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="content" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>
          Documentation
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem' }}>
          GhostChain sovereign L1/L2/L3 — developer and operator reference.
          Chain IDs: L1 <code style={{ color: 'var(--accent)' }}>14000101</code> · L2 <code style={{ color: 'var(--accent)' }}>901</code> · L3 <code style={{ color: 'var(--accent)' }}>903</code>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {sections.map((section) => (
          <div
            key={section.title}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <h2
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: section.color,
                marginBottom: '0.25rem',
              }}
            >
              {section.title}
            </h2>
            {section.items.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
              >
                <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.92rem' }}>
                  {item.label} ↗
                </span>
                <span style={{ color: 'var(--muted)', fontSize: '0.8rem', lineHeight: 1.4 }}>
                  {item.desc}
                </span>
              </a>
            ))}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: '2rem',
          padding: '1.25rem 1.5rem',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <h3 style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          CANONICAL BRIDGE ADDRESSES
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.4rem' }}>
          {[
            ['L2L3Bridge', '0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2'],
            ['L1 Rollup (L2)', '0xad32D5C2Da9f4159C4cc98686C005852b3905355'],
            ['L2 Rollup (L3)', '0x130A46b6E41DB6E1e18fb9c759F223c459190e90'],
            ['Finality Oracle L1', '0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422'],
            ['Finality Oracle L2', '0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A'],
            ['Finality Oracle L3', '0x87F850cbC2cFfac086F20d0d7307E12d06fA2127'],
          ].map(([name, addr]) => (
            <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 600 }}>{name}</span>
              <code style={{ color: 'var(--text)', fontSize: '0.72rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {addr}
              </code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
