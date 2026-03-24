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

type Section = {
  id: string;
  title: string;
  color: string;
  content: string;
};

const inlineSections: Section[] = [
  {
    id: 'architecture',
    title: 'System Architecture Overview',
    color: 'var(--accent)',
    content: `GhostChain is a fully sovereign, multi-layer blockchain stack comprising three interconnected layers and an AI orchestration plane.

L1 — GhostChain (chain_id 14000101, RPC :18545)
The sovereign base layer. Cosmos SDK + CometBFT consensus + EVM execution. GST is the native gas token across all layers. All external settlement terminates here. Governance is locked on-chain through GhostChainGovernor and GhostConstitution. Treasury management via SovereignTreasuryEngine.

L2 — GhostL2 (chain_id 901, RPC :29545)
OP Stack execution layer anchored to L1 via L1GhostPortal. op-geth / op-node / op-batcher. L2 transactions roll up to L1 for finality. L3 canot communicate directly with L1 — all messages must transit L2 first.

L3 — GhostL3 (chain_id 903, RPC :39545)
OP Stack app-specific execution layer anchored to L2. Designed for high-frequency application workloads. Settlement chain is L2.

Routing Law (immutable): L3 → L2 → L1. No direct L3→L1 communication is permitted. The routing-guard package enforces this at runtime.

AI Layer — GhostBrain Core (port 7900)
Transaction classification, risk scoring, fraud detection, and autonomous proposal generation (human-ratified). Connected to all three layers via the governance-event-bridge. The Global AI Orchestrator manages agent lifecycle, PolicyGuard enforcement, and GAIS circuit-breaker logic.`,
  },
  {
    id: 'gst',
    title: 'GST — Ghost Sovereignty Token',
    color: 'var(--accent-2)',
    content: `GST is the singular gas and value token of the GhostChain ecosystem. It is used as the native gas token on L1, L2, and L3. No ETH, WETH, or third-party tokens serve as gas on any GhostChain layer.

Properties:
• Canonical address: defined in GhostBrand.sol as CANONICAL_GST
• Unit: GST_UNIT = 1e18 (matches EVM Wei convention)
• Cross-layer: bridged exclusively through the canonical bridge contracts (L2L3Bridge, L1 Rollup, L2 Rollup)
• Supply controls: governed by SovereignTreasuryEngine with epoch-budget ceilings
• Staking: validators and delegators earn GST epoch rewards via RewardDistributor (port 7684)
• Treasury reserves: protocol-held GST is subject to GhostConstitution reserve floor rules

Tokenomics are formally modeled in the Economic AI system (demand_analyzer, supply_controller) and subject to governance ratification for any supply parameter changes. The gst:leakage CI check (fail-closed) blocks any non-GST external token integration from entering the codebase.`,
  },
  {
    id: 'governance',
    title: 'Governance Model',
    color: '#a78bfa',
    content: `GhostChain uses a constitutional governance model with three principals: the human validator set, the AI advisory layer, and the on-chain constitution.

GhostChainGovernor (custom, not OZ Governor)
All on-chain parameter changes, treasury disbursements, protocol upgrades, and constitutional amendments go through GhostChainGovernor. Proposals follow: Draft → Simulation → Voting → Timelock → Execution.

GhostConstitution
Immutable + amendable on-chain law. Six constitutional commitments govern AI authority, routing law, GST sovereignty, reserve floors, slashing, and the emergency freeze path. Amendments require supermajority quorum and ZK verifier confirmation.

AI Authority Model (Phase 6+)
• AI may DRAFT proposals — humans must RATIFY via governance quorum
• AI advisory proposals are queued at the signing relay (port 7910)
• PolicyGuard enforces the authority matrix: no AI agent may autonomously modify consensus parameters, token supply, or bridge validator quorum
• GAIS (autonomous VM supervisor) operates within VM_ALLOWLIST + cooldown + circuit-breaker constraints
• Routing-bypass detection: L3→L1 direct calls trigger CRITICAL escalation to human operators

Governance agents roster: economic-agent, governance-agent, security-agent, infra-agent (all coordinated by Global AI Orchestrator with DRY_RUN support for staging).`,
  },
  {
    id: 'bridge',
    title: 'Bridge & Cross-Layer Messaging',
    color: 'var(--accent-3)',
    content: `All cross-layer communication follows strict routing law. The bridge contracts are governance-locked and cannot be upgraded without on-chain governance quorum.

Canonical Contract Addresses:
• L2L3Bridge: 0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2
• L1 Rollup (L2 settlement): 0xad32D5C2Da9f4159C4cc98686C005852b3905355
• L2 Rollup (L3 settlement): 0x130A46b6E41DB6E1e18fb9c759F223c459190e90
• Finality Oracle L1: 0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422
• Finality Oracle L2: 0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A
• Finality Oracle L3: 0x87F850cbC2cFfac086F20d0d7307E12d06fA2127

Finality Model:
Messages from L3 are first settled to L2 (typically <2s), then L2 rolls up to L1 for final settlement. The FinalityOracle contracts attest to cross-layer finality. The SettlementOracle in the LGE must confirm "can continue" before LoadBalancerVault allows further rebalances — if it reports "cannot continue", the vault pauses recursively.

Circuit Breaker:
The bridge system includes a CircuitBreaker contract that triggers watchdog remediation on missed settlement windows and halts further transfers until the condition is cleared by governance or automated recovery.`,
  },
  {
    id: 'lge',
    title: 'Liquidity Gravity Engine (LGE)',
    color: '#f472b6',
    content: `The LGE is the protocol's central liquidity management system, governance-locked on L1. It provides automated liquidity routing, settlement, and reward distribution across all three layers.

Core Contracts:
• LoadBalancerVault — holds protocol liquidity, routes to adapters, pauses on SettlementOracle signal
• AdapterRegistry — governance-approved list of liquidity adapters (swap, lending, bridging)
• SettlementOracle — attests to cross-layer settlement validity before each rebalance cycle
• CircuitBreaker — halts automated operations on anomaly detection or governance trigger
• BridgeEscrow — holds GST in transit during cross-layer transfers

AI Integration (v2):
The Economic Agent (Global AI Orchestrator) runs demand_analyzer and supply_controller models to generate advisory rebalance proposals. These proposals are submitted to the signing relay and require human ratification before execution. The orchestrator circuit-breaker limits AI proposal frequency and blocks execution at the PolicyGuard level. Risk scoring from GhostBrain (port 7900) informs all LGE decisions.

Formal invariants verified by Echidna:
• Reserve floor is never breached
• Circuit breaker triggers within 1 missed settlement window
• No adapter can drain more than MAX_SINGLE_ADAPTER_DRAIN per epoch`,
  },
  {
    id: 'security',
    title: 'Security Architecture',
    color: '#fb923c',
    content: `GhostChain employs defense-in-depth across the full stack: smart contract formal verification, AI-guided risk scoring, runtime routing guards, and a 15-layer branding audit for supply-chain integrity.

Smart Contract Security:
• Compiler: Solidity 0.8.24, optimizer runs=200, via_ir=true
• Forge lint enforces: erc20-unchecked-transfer, unsafe-typecast, unchecked-call (warnings = errors in CI)
• Static analysis: Slither (formal:slither), invariant fuzzing: Echidna (formal:echidna)
• All OZ v5.6.1 (GhostChain rebranded) — no upstream OZ substitution

AI & Runtime Security:
• GhostBrain transaction classification and risk scoring on all L1/L2/L3 TXs
• Ghost Security AI (ghost-security-ai service) continuous anomaly detection
• RBAC service (port-mapped) protects all API endpoints
• JWT/JWKS rotation via ghost-jwks-guard service
• Compliance service (port 8090) enforces KYC/AML for all significant operations

Routing Security:
• routing-guard package rejects any L3→L1 direct call at the service level
• routing-law package provides the on-chain registry of permitted routes
• All governance proposals include routing-law compliance attestation

CI/CD:
• Brand audit: npm run brand:full (15 layers, exit 0 required before any release)
• GST leakage scan: npm run gst:leakage (fail-closed)
• Phase preflight: npm run phase2:preflight (deprecations + build smoke)
• OP Stack preflight: npm run preflight:opstack`,
  },
];

export default function WhitepaperPage() {
  return (
    <div className="content" style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 12px', borderRadius: 999, marginBottom: 12,
          background: 'rgba(35,214,166,0.1)', border: '1px solid rgba(35,214,166,0.25)',
          fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--accent)',
        }}>
          ⬡ GhostChain Documentation
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>
          Whitepapers & Technical Specifications
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem', maxWidth: 680 }}>
          Formal specifications, architecture documents, and governance papers for the GhostChain
          sovereign L1/L2/L3 blockchain stack. Gas token: GST on all layers. Routing law: L3 → L2 → L1.
        </p>
      </div>

      {/* Paper cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '1.25rem', marginBottom: '3rem' }}>
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
                transition: 'border-color 0.15s ease, transform 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                  {wp.title}
                </h2>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: wp.color, whiteSpace: 'nowrap', paddingTop: '0.15rem' }}>
                  {wp.version}
                </span>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.6, margin: 0, flexGrow: 1 }}>
                {wp.abstract}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {wp.tags.map((tag) => (
                  <span key={tag} style={{
                    fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.6rem',
                    borderRadius: '999px', background: 'rgba(255,255,255,0.06)',
                    color: wp.color, letterSpacing: '0.04em',
                  }}>{tag}</span>
                ))}
              </div>
              <div style={{ fontSize: '0.78rem', color: wp.color, fontWeight: 600, marginTop: '0.25rem' }}>
                Read whitepaper ↗
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Inline specification sections */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Inline Technical Reference
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Concise in-page summaries of key architectural decisions and protocol rules.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '3rem' }}>
        {inlineSections.map((sec) => (
          <div
            key={sec.id}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${sec.color}`,
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.75rem', color: sec.color }}>
              {sec.title}
            </h3>
            <pre style={{
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontFamily: 'var(--font-body)', color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.7,
            }}>
              {sec.content}
            </pre>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: '1rem', padding: '1.25rem 1.5rem',
        background: 'rgba(35,214,166,0.06)',
        border: '1px solid rgba(35,214,166,0.2)',
        borderRadius: 'var(--radius-md)',
      }}>
        <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: 0, lineHeight: 1.6 }}>
          All GhostChain whitepapers describe systems that enforce the routing law{' '}
          <strong style={{ color: 'var(--text)' }}>L3 → L2 → L1</strong>. AI may propose — humans must ratify.
          The gas token is <strong style={{ color: 'var(--accent)' }}>GST</strong> on all layers.
          No non-GhostChain chain dependencies. All layers settle to GhostChain L1.
          Chain IDs: L1=14000101 · L2=901 · L3=903.
        </p>
      </div>
    </div>
  );
}
