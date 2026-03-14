'use client';

const DEFI_SYSTEMS: Array<{ name: string; description: string; href: string }> = [
  { name: 'GhostXchange DEX',  description: 'AMM — L2/L3 liquidity pools', href: '/devops' },
  { name: 'Staking Pools',     description: 'GST delegation and yield',      href: '/tokenomics' },
  { name: 'Yield Farms',       description: 'LP reward distribution',         href: '/econ' },
  { name: 'Vesting Schedules', description: 'Team / investor unlock tracking',href: '/tokens' },
  { name: 'Buyback Engine',    description: 'Treasury-driven GST buybacks',   href: '/treasury' },
];

export function DeFiPanel() {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontWeight: 700 }}>DeFi Systems</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {DEFI_SYSTEMS.map((sys) => (
          <a
            key={sys.name}
            href={sys.href}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 13, textDecoration: 'none', color: 'inherit',
              padding: '6px 8px', borderRadius: 6,
            }}
          >
            <div>
              <div style={{ fontWeight: 500 }}>{sys.name}</div>
              <div className="muted" style={{ fontSize: 11 }}>{sys.description}</div>
            </div>
            <span style={{ fontSize: 16, color: '#6b7280' }}>→</span>
          </a>
        ))}
      </div>
    </div>
  );
}
