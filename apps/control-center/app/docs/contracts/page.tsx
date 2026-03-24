export default function ContractsDocsPage() {
  const contracts = [
    {
      name: "GhostBrand.sol",
      path: "contracts/src/ghost/GhostBrand.sol",
      layer: "L1",
      desc: "Base contract providing canonical constants: GST_UNIT (1e18), CANONICAL_GST address, and all chain IDs. Inherit this in all GhostStack contracts.",
      key: ["GST_UNIT", "CANONICAL_GST", "L1_CHAIN_ID", "L2_CHAIN_ID", "L3_CHAIN_ID"],
    },
    {
      name: "GhostConstitution.sol",
      path: "contracts/src/constitution/GhostConstitution.sol",
      layer: "L1",
      desc: "Governance-locked on-chain law. Clauses are immutable but can be amended via ZK verifier integration with constitutional supermajority (>75% quorum).",
      key: ["amendClause()", "verifyZKProof()", "getClause(uint256)"],
    },
    {
      name: "GhostChainGovernor.sol",
      path: "contracts/src/governance/GhostChainGovernor.sol",
      layer: "L1",
      desc: "Custom governor contract (not OZ Governor). Stake-weighted voting, 67% quorum, AI-draft support, 7-day voting window, 48h timelock.",
      key: ["propose()", "castVote()", "execute()", "cancel()"],
    },
    {
      name: "SovereignTreasuryEngine.sol",
      path: "contracts/src/treasury/SovereignTreasuryEngine.sol",
      layer: "L1",
      desc: "Multi-stream revenue management: DeFi/gas/GNS/SaaS income, slashing penalties routing, reward distribution triggers.",
      key: ["receiveRevenue()", "distributeRewards()", "slash()", "withdraw()"],
    },
    {
      name: "RewardDistributor.sol",
      path: "contracts/src/econ/RewardDistributor.sol",
      layer: "L1",
      desc: "Per-epoch GST payouts to validators and stakers. Accounts for commission, unbonding periods, and delegation ratios.",
      key: ["distributeEpoch()", "claimRewards(address)", "pendingRewards(address)"],
    },
    {
      name: "LoadBalancerVault.sol",
      path: "contracts/src/liquidity/LoadBalancerVault.sol",
      layer: "L1",
      desc: "LGE core: allocates liquidity across registered pool adapters. Pauses recursively if SettlementOracle reports 'cannot continue'.",
      key: ["deposit()", "rebalance()", "pauseAll()", "getAdapters()"],
    },
    {
      name: "SettlementOracle.sol",
      path: "contracts/src/liquidity/SettlementOracle.sol",
      layer: "L1",
      desc: "LGE oracle: authoritative source for LoadBalancerVault pause/continue decisions. Reports settlement window health.",
      key: ["canContinue()", "reportSettlement()", "getLastReport()"],
    },
    {
      name: "L2L3Bridge.sol",
      path: "contracts/src/bridge/L2L3Bridge.sol",
      layer: "L2",
      desc: "Bridge contract between L2 and L3. Address: 0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2",
      key: ["bridgeToL3()", "receiveFromL3()", "finalize()"],
    },
  ];

  return (
    <div className="wp-body">
      <div className="wp-hero" style={{ paddingBottom: "1.5rem" }}>
        <div className="wp-title" style={{ fontSize: "1.8rem" }}>Smart Contracts</div>
        <div className="wp-subtitle" style={{ fontSize: "0.95rem" }}>
          Reference for all GhostStack Solidity contracts (v0.8.24)
        </div>
      </div>

      <div className="wp-section">
        <div className="wp-callout">
          All contracts use Solidity <strong>0.8.24</strong>, optimizer runs=200, via_ir=true.
          Import OZ via <code>@openzeppelin/contracts/...</code> (resolves to GhostChain-rebranded v5.6.1).
          Inherit <code>GhostBrand.sol</code> for canonical constants.
        </div>
      </div>

      {contracts.map((c) => (
        <div key={c.name} className="wp-section" id={c.name.replace(".sol", "").toLowerCase()}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <div className="wp-h2" style={{ margin: 0 }}>{c.name}</div>
            <span style={{
              fontSize: "0.7rem", padding: "0.15rem 0.5rem",
              background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: "4px", color: "var(--cyan)", fontFamily: "monospace",
            }}>{c.layer}</span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace", marginBottom: "0.6rem" }}>
            {c.path}
          </div>
          <div className="wp-p">{c.desc}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.5rem" }}>
            {c.key.map((k) => (
              <code key={k} style={{
                fontSize: "0.75rem", padding: "0.1rem 0.45rem",
                background: "rgba(0,255,255,0.07)", border: "1px solid rgba(0,255,255,0.2)",
                borderRadius: "4px", color: "var(--cyan)",
              }}>{k}</code>
            ))}
          </div>
        </div>
      ))}

      <div className="wp-section" id="conventions">
        <div className="wp-h2">Forge Lint — Required Fixes</div>
        <div className="wp-p">Forge lint warnings are treated as errors in CI:</div>
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead><tr><th>Warning</th><th>Fix</th></tr></thead>
            <tbody>
              {[
                ["erc20-unchecked-transfer",    "require(token.transfer(to, amt), 'transfer failed')"],
                ["unsafe-typecast",             "require(x <= type(uint128).max, 'overflow') before cast"],
                ["unchecked-call",              "Capture (bool ok,) = addr.call(...); require(ok, 'msg')"],
              ].map(([w, f]) => (
                <tr key={w}>
                  <td style={{ fontFamily: "monospace", color: "var(--amber)", fontSize: "0.8rem" }}>{w}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="wp-section" id="build">
        <div className="wp-h2">Build Commands</div>
        <div className="wp-code">{`cd contracts

# Compile
forge build

# Lint check (must exit 0)
forge lint

# Test suites
forge test                              # default profile
FOUNDRY_PROFILE=gns forge test          # GNS contracts
FOUNDRY_PROFILE=ai forge test           # AI/GhostBrain layer
FOUNDRY_PROFILE=exchange forge test     # GhostXchange AMM
FOUNDRY_PROFILE=legacy forge test       # legacy (pre-Shanghai)

# Formal verification
npm --prefix contracts run formal:slither
npm --prefix contracts run formal:echidna`}</div>
      </div>
    </div>
  );
}
