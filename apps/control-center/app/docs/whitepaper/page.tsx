// GhostStack — Whitepaper v2

export default function WhitepaperPage() {
  return (
    <div className="wp-body">
      <div className="wp-hero">
        <div className="wp-title">GhostStack Technical Whitepaper</div>
        <div className="wp-subtitle">
          A Unified Sovereign Blockchain with Multi-Layer Execution, AI-Augmented Governance,
          and Economic Automation
        </div>
        <div className="wp-meta">
          <span>📅 Version 2.0 · March 2026</span>
          <span>⛓ chain_id 14000101 · 901 · 903</span>
          <span>🪙 GST Gas Token</span>
          <span>🤖 GhostBrain AI Layer</span>
        </div>
      </div>

      {/* ── Abstract ── */}
      <div className="wp-section" id="abstract">
        <div className="wp-h2">1. Abstract</div>
        <div className="wp-p">
          GhostStack is a fully sovereign three-layer blockchain protocol built on a custom L1 chain
          (<strong>GhostChain</strong>, chain_id 14000101), with two embedded OP Stack layers
          (GhostL2 at chain_id 901 and GhostL3 at chain_id 903). The native gas token across all
          layers is <strong>GST</strong>. The system has no dependency on Ethereum mainnet, Arbitrum,
          Base, or any external EVM chain.
        </div>
        <div className="wp-p">
          GhostStack introduces <strong>GhostBrain</strong> — an AI engine layer that operates 
          autonomously across 20+ AI subsystems for governance, revenue, marketing, security,
          infrastructure management, and cognitive analysis. AI proposals are human-ratified via
          the <strong>GhostChainGovernor</strong>.
        </div>
        <div className="wp-callout">
          All cross-chain traffic routes strictly through the chain hierarchy: L3 → L2 → L1.
          GhostChain L1 is the only layer that interacts with the outside world. This invariant
          is enforced at runtime via <code>routing-guard</code> and <code>routing-law</code>.
        </div>
      </div>

      {/* ── Architecture ── */}
      <div className="wp-section" id="architecture">
        <div className="wp-h2">2. Architecture</div>

        <div className="wp-h3">2.1 Three-Layer Protocol Stack</div>
        <div className="wp-code">{`GhostChain L1 (chain_id=14000101, RPC :18545)
  ├── Cosmos SDK sovereign chain (ghostchaind)
  ├── CometBFT consensus
  ├── EVM execution module
  ├── Governance-locked constitution (GhostConstitution.sol)
  ├── SovereignTreasuryEngine.sol
  └── GhostChainGovernor.sol (custom, not OZ Governor)

GhostL2 (chain_id=901, RPC :29545)
  ├── OP Stack (op-geth + op-node + op-batcher)
  ├── Settlement to GhostChain L1
  ├── L1 Rollup contract: 0xad32...5355
  └── Finality Oracle L2: 0x650a...553A

GhostL3 (chain_id=903, RPC :39545)
  ├── OP Stack (app-specific execution)
  ├── Settlement to GhostL2
  ├── L2 Rollup contract: 0x130A...90
  └── Finality Oracle L3: 0x87F8...2127`}</div>

        <div className="wp-h3">2.2 Routing Law</div>
        <div className="wp-p">
          Cross-chain messages must obey the routing hierarchy. L3 can never call L1 directly —
          all messages transit L2 first. L2 routes to L1. Only L1 communicates with external systems.
          This is enforced at both Solidity level (routing-guard) and TypeScript level (routing-law).
        </div>

        <div className="wp-h3">2.3 Canonical Bridge Addresses</div>
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead><tr><th>Contract</th><th>Address</th><th>Layer</th></tr></thead>
            <tbody>
              {[
                ["L2L3Bridge",          "0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2", "L2"],
                ["L1 Rollup (L2)",      "0xad32D5C2Da9f4159C4cc98686C005852b3905355", "L1"],
                ["L2 Rollup (L3)",      "0x130A46b6E41DB6E1e18fb9c759F223c459190e90", "L2"],
                ["Finality Oracle L1",  "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422", "L1"],
                ["Finality Oracle L2",  "0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A", "L2"],
                ["Finality Oracle L3",  "0x87F850cbC2cFfac086F20d0d7307E12d06fA2127", "L3"],
              ].map(([name, addr, layer]) => (
                <tr key={name}>
                  <td style={{ fontWeight: 600 }}>{name}</td>
                  <td style={{ fontFamily: "monospace", color: "var(--cyan)", fontSize: "0.76rem" }}>{addr}</td>
                  <td><span style={{ fontSize: "0.72rem", padding: "0.1rem 0.4rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "4px" }}>{layer}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="wp-h3">2.4 GhostBrain AI Layer</div>
        <div className="wp-p">
          GhostBrain Core (port 7900) is the primary AI interface. 20+ AI engines operate across
          growth, economy, governance, infrastructure, security, evolution, and cognitive layers.
          Key engines include:
        </div>
        <ul className="wp-ul">
          <li><strong>ARE (port 9987)</strong> — Autonomous Revenue Engine: manages DeFi, trading, SaaS, and validator rewards</li>
          <li><strong>GIE (port 9975)</strong> — Governance Impact Engine: drafts proposals for human ratification</li>
          <li><strong>ASE (port 9977)</strong> — AI Security Engine: real-time threat detection and audit logging</li>
          <li><strong>HCL (port 9986)</strong> — Hypervisor Control Layer: VM and container lifecycle management</li>
          <li><strong>GCL (port 9989)</strong> — GhostBrain Cognitive Layer: cross-system intelligence synthesis</li>
          <li><strong>SEE (port 9983)</strong> — Self-Evolution Engine: protocol self-improvement proposals</li>
        </ul>

        <div className="wp-h3">2.5 Liquidity Gravity Engine (LGE)</div>
        <div className="wp-p">
          The LGE manages liquidity allocation across all pools via five governance-locked contracts:
          LoadBalancerVault, AdapterRegistry, SettlementOracle, CircuitBreaker, and BridgeEscrow.
          If the SettlementOracle does not report "can continue", LoadBalancerVault pauses recursively.
        </div>
      </div>

      {/* ── Tokenomics ── */}
      <div className="wp-section" id="tokenomics">
        <div className="wp-h2">3. Tokenomics</div>

        <div className="wp-h3">3.1 GST — GhostStack Token</div>
        <div className="wp-p">
          GST is the native gas token across all three layers (L1, L2, L3). It is never replaceable
          by ETH, WETH, or any external token. All fees, staking, governance deposits, bridge fees,
          and GNS registrations are denominated in GST.
        </div>
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead><tr><th>Metric</th><th>Value</th></tr></thead>
            <tbody>
              {[
                ["Total Supply",        "1,000,000,000 GST"],
                ["Unit",                "1 GST = 1e18 wei (GST_UNIT)"],
                ["Genesis Distribution","Treasury 40% · Validators 30% · Ecosystem 30%"],
                ["Staking Unbonding",   "21 days"],
                ["Governance Quorum",   "67%"],
                ["Burn Mechanism",      "% of gas fees burned per block"],
              ].map(([k, v]) => (
                <tr key={k}><td style={{ fontWeight: 600 }}>{k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="wp-h3">3.2 Revenue Streams</div>
        <ul className="wp-ul">
          <li><strong>Gas fees</strong>: All L1/L2/L3 transaction fees in GST</li>
          <li><strong>DeFi fees</strong>: GhostXchange AMM LP fees (pooled to treasury)</li>
          <li><strong>GNS registrations</strong>: .ghost name registration and renewal fees</li>
          <li><strong>Validator commissions</strong>: 5% default commission on staking rewards</li>
          <li><strong>SaaS layer</strong>: Developer API access plans priced in GST</li>
          <li><strong>AI compute</strong>: GhostBrain inference credits in GST</li>
        </ul>
      </div>

      {/* ── Governance ── */}
      <div className="wp-section" id="governance">
        <div className="wp-h2">4. Governance</div>

        <div className="wp-h3">4.1 GhostChainGovernor</div>
        <div className="wp-p">
          GhostStack uses a custom governance contract (GhostChainGovernor) — not the OpenZeppelin
          Governor. It supports stake-weighted voting with a 67% quorum requirement. AI systems
          may draft proposals but cannot ratify them without human governance quorum.
        </div>
        <div className="wp-callout wp-callout-warn">
          ⚠️ AI may write proposals; humans must ratify them. No autonomous on-chain execution
          without governance quorum. All advisory proposals route to the signing relay at port 7910.
        </div>

        <div className="wp-h3">4.2 GhostConstitution</div>
        <div className="wp-p">
          The GhostConstitution.sol contract holds governance-locked clause amendments.
          Clauses are immutable by default but can be amended via ZK verifier integration
          with constitutional supermajority (&gt;75% quorum).
        </div>

        <div className="wp-h3">4.3 Proposal Lifecycle</div>
        <ul className="wp-ul">
          <li>Draft: AI or human creates proposal with on-chain calldata</li>
          <li>Review: 48h review period, community discussion</li>
          <li>Vote: 7-day voting window, stake-weighted</li>
          <li>Timelock: 48h timelock after pass (emergency bypass requires 90% quorum)</li>
          <li>Execution: Governor contract executes on-chain action</li>
        </ul>
      </div>

      {/* ── Security ── */}
      <div className="wp-section" id="security">
        <div className="wp-h2">5. Security Model</div>

        <div className="wp-h3">5.1 Formal Verification</div>
        <div className="wp-p">
          All core contracts are verified with: Slither (static analysis), Scribble (specification),
          Echidna (invariant fuzzing), and optional Certora Prover. Forge lint warnings are treated
          as errors and must be resolved before deployment.
        </div>

        <div className="wp-h3">5.2 OWASP Compliance</div>
        <ul className="wp-ul">
          <li>Access control: RBAC roles (admin, operator, developer, viewer)</li>
          <li>Injection: No shell=True in Python, parameterized all SQL queries</li>
          <li>Cryptographic: All secrets in HashiCorp Vault, no secrets in code</li>
          <li>Authentication: JWT + HMAC-signed AI signals, FIDO2 user auth</li>
          <li>Logging: Immutable audit log via audit-log-service, chain-level event emission</li>
        </ul>

        <div className="wp-h3">5.3 GST Leakage Prevention</div>
        <div className="wp-p">
          <code>npm run gst:leakage</code> is a fail-closed CI check that blocks any non-GST
          external token integration. Chainlink price feeds are not integrated directly — all
          oracle data routes through the GhostBrain oracle layer.
        </div>
      </div>

      {/* ── Roadmap ── */}
      <div className="wp-section" id="roadmap">
        <div className="wp-h2">6. Roadmap</div>
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead><tr><th>Phase</th><th>Milestone</th><th>Status</th></tr></thead>
            <tbody>
              {[
                ["Phase 1", "GhostChain L1 devnet, GST genesis, governance",                    "✅ Complete"],
                ["Phase 2", "GhostL2 OP Stack deployment, L1↔L2 bridge",                        "✅ Complete"],
                ["Phase 3", "GhostL3 deployment, GhostBrain AI integration",                    "🔄 Active"],
                ["Phase 4", "GhostXchange DEX launch, DeFi ecosystem",                         "🔜 Upcoming"],
                ["Phase 5", "GNS mainnet, institutional GSI identity",                          "🔜 Upcoming"],
                ["Phase 6", "Interplanetary network (GhostBrain planetary expansion)",           "📅 Planned"],
                ["Phase 7", "Full self-evolution protocol (SEE live, constitution upgrade v2)",  "📅 Planned"],
              ].map(([p, m, s]) => (
                <tr key={p}><td style={{ fontWeight: 600 }}>{p}</td><td>{m}</td><td>{s}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: "2.5rem", padding: "1.25rem", background: "rgba(28,32,48,0.8)", borderRadius: "10px", fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center" }}>
        GhostStack Whitepaper v2.0 · March 2026 · ghostchain.cloud · chain_id 14000101 (L1) · 901 (L2) · 903 (L3)
      </div>
    </div>
  );
}
