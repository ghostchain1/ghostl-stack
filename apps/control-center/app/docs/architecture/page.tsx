export default function ArchitecturePage() {
  return (
    <div className="wp-body">
      <div className="wp-hero" style={{ paddingBottom: "1.5rem" }}>
        <div className="wp-title" style={{ fontSize: "1.8rem" }}>System Architecture</div>
        <div className="wp-subtitle" style={{ fontSize: "0.95rem" }}>
          Deep dive into the GhostStack three-layer sovereign blockchain protocol
        </div>
      </div>

      <div className="wp-section" id="overview">
        <div className="wp-h2">1. Architecture Overview</div>
        <div className="wp-code">{`GhostChain L1  (chain_id=14000101, RPC :18545)
├── Cosmos SDK sovereign chain (ghostchaind)
├── CometBFT consensus
├── EVM execution module
├── Governance: GhostChainGovernor.sol
├── Constitution: GhostConstitution.sol
├── Treasury: SovereignTreasuryEngine.sol
└── LGE: LoadBalancerVault + AdapterRegistry + SettlementOracle

    └── GhostL2  (chain_id=901, RPC :29545)
        ├── OP Stack: op-geth + op-node + op-batcher
        ├── Settlement → GhostChain L1
        ├── L1Rollup: 0xad32...5355
        ├── FinalityOracle L2: 0x650a...553A
        └── L2L3Bridge: 0xDadd...dC2

            └── GhostL3  (chain_id=903, RPC :39545)
                ├── OP Stack: app-specific execution
                ├── Settlement → GhostL2
                ├── L2Rollup: 0x130A...90
                └── FinalityOracle L3: 0x87F8...2127`}</div>
      </div>

      <div className="wp-section" id="l1">
        <div className="wp-h2">2. GhostChain L1</div>
        <div className="wp-p">
          GhostChain L1 is a Cosmos SDK sovereign chain with CometBFT consensus and EVM execution
          (chain_id=14000101). It is the root of trust for the entire GhostStack protocol — the only
          layer that communicates with external systems.
        </div>
        <ul className="wp-ul">
          <li><strong>Consensus</strong>: CometBFT (PBFT-style, deterministic finality)</li>
          <li><strong>EVM execution</strong>: EVM module with Solidity 0.8.24 support</li>
          <li><strong>Gas token</strong>: GST (never ETH/WETH)</li>
          <li><strong>Cosmos LCD</strong>: port 1317 · <strong>CometBFT RPC</strong>: port 26657 · <strong>gRPC</strong>: port 9090</li>
          <li><strong>Contract library</strong>: OpenZeppelin v5.6.1 (GhostChain-rebranded)</li>
        </ul>
        <div className="wp-h3">Key L1 Contracts</div>
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead><tr><th>Contract</th><th>Role</th></tr></thead>
            <tbody>
              {[
                ["GhostBrand.sol",            "Base — GST_UNIT, CANONICAL_GST, chain IDs"],
                ["GhostConstitution.sol",      "Governance-locked on-chain law, ZK verifier"],
                ["GhostChainGovernor.sol",     "Stake-weighted voting, 67% quorum, AI-draft support"],
                ["SovereignTreasuryEngine.sol","Multi-stream revenue, slashing, rewards distribution"],
                ["RewardDistributor.sol",      "Per-epoch validator and staker payouts (GST)"],
                ["LoadBalancerVault.sol",      "LGE: liquidity allocation across pool adapters"],
                ["SettlementOracle.sol",       "LGE: controls pause/continue for LoadBalancerVault"],
              ].map(([c, r]) => (
                <tr key={c}><td style={{ fontFamily: "monospace", color: "var(--cyan)", fontSize: "0.8rem" }}>{c}</td><td>{r}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="wp-section" id="l2">
        <div className="wp-h2">3. GhostL2</div>
        <div className="wp-p">
          GhostL2 (chain_id=901) is an OP Stack rollup settling to GhostChain L1. It provides
          higher throughput for DeFi, DEX, and standard user transactions.
        </div>
        <ul className="wp-ul">
          <li><strong>op-geth</strong>: EVM execution client (port 29545 RPC)</li>
          <li><strong>op-node</strong>: Derivation pipeline from L1</li>
          <li><strong>op-batcher</strong>: Batches L2 txs to L1 calldata</li>
          <li>L2 → L1 challenge window: 7 days (optimistic rollup)</li>
          <li>Finality Oracle L2: <code>0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A</code></li>
        </ul>
      </div>

      <div className="wp-section" id="l3">
        <div className="wp-h2">4. GhostL3</div>
        <div className="wp-p">
          GhostL3 (chain_id=903) is an app-specific OP Stack rollup settling to GhostL2.
          Used for high-frequency applications, game logic, AI compute scheduling, and
          isolated protocol experiments.
        </div>
        <ul className="wp-ul">
          <li>L3 → L2 settlement (never direct to L1)</li>
          <li>Bridge: <code>0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2</code> (L2L3Bridge)</li>
          <li>Finality Oracle L3: <code>0x87F850cbC2cFfac086F20d0d7307E12d06fA2127</code></li>
        </ul>
      </div>

      <div className="wp-section" id="ai">
        <div className="wp-h2">5. GhostBrain AI Layer</div>
        <div className="wp-p">
          GhostBrain Core (port 7900) coordinates 20+ AI subsystems. The AI layer is purely
          advisory by design — it cannot execute on-chain actions without human ratification.
        </div>
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead><tr><th>Engine</th><th>Port</th><th>Function</th></tr></thead>
            <tbody>
              {[
                ["GhostBrain Core",         "7900", "Master AI router + health metrics"],
                ["ARE",                     "9987", "Autonomous Revenue Engine"],
                ["GIE",                     "9975", "Governance Impact Engine"],
                ["GME",                     "9978", "Growth & Marketing Engine"],
                ["ASE",                     "9977", "AI Security Engine"],
                ["GEE",                     "9982", "Ghost Economics Engine"],
                ["SEE",                     "9983", "Self-Evolution Engine"],
                ["GCL",                     "9989", "Cognitive Layer (synthesis)"],
                ["HCL",                     "9986", "Hypervisor Control Layer"],
                ["Governance Event Bridge", "7801", "L1/L2 governor → GhostBrain signals"],
              ].map(([e, p, f]) => (
                <tr key={e}><td style={{ fontWeight: 600 }}>{e}</td><td style={{ fontFamily: "monospace", color: "var(--cyan)" }}>:{p}</td><td>{f}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="wp-section" id="services">
        <div className="wp-h2">6. Microservices Layer</div>
        <div className="wp-p">
          80+ TypeScript microservices operate behind the <code>apps/api</code> BFF (Express 5).
          Key economic services:
        </div>
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead><tr><th>Service</th><th>Port</th></tr></thead>
            <tbody>
              {[
                ["l3-fee-collector",        "7681"],
                ["l2-revenue-aggregator",   "7682"],
                ["treasury-engine",         "7683"],
                ["reward-distributor",      "7684"],
                ["sovereign-governor",      "7685"],
                ["chain-status-service",    "7701"],
                ["bridge-service",          "7702"],
                ["contract-registry",       "7703"],
                ["gns-api",                 "7704"],
                ["auth-service",            "7705"],
                ["compliance-api",          "8090"],
              ].map(([s, p]) => (
                <tr key={s}><td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{s}</td><td style={{ fontFamily: "monospace", color: "var(--cyan)" }}>:{p}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
