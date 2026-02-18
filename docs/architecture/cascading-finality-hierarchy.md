# Cascading Finality Hierarchy (GhostL3 -> GhostL2 -> GhostL1)

Mermaid source: `docs/architecture/cascading-finality-hierarchy.mmd`

## Topology

- `GhostL1`: sovereign finality root and bridge authority
- `GhostL2`: finalizes only when anchored on L1
- `GhostL3`: finalizes only when anchored on L2 and parent L2 root is finalized on L1

## On-chain enforcement added in this patch

- `contracts/src/governance/bridge/L1FinalityOracle.sol`
- `contracts/src/governance/bridge/L2FinalityOracle.sol`
- `contracts/src/governance/bridge/L3FinalityOracle.sol`
- `contracts/src/OptimisticRollup.sol` (parent finality + policy hash checks)
- `contracts/src/L2L3Bridge.sol` (hierarchical mode and recursive finality checks)

## Rules

- L2 settlement path must satisfy: `isFinalizedOnL1(l2StateRoot)`
- L3 settlement path must satisfy:
  - `isFinalizedOnL2(l3StateRoot)`
  - `isParentL2FinalizedOnL1(parentL2StateRoot)`
- External egress remains L1-only via `GhostChainBridgeHub` patterns.

## Safe mode

Operational safe-mode policy is captured in:

- `tools/ghostcontrol/guards/config/cascading-finality-safe-mode.json`

Behavior:

- If L1 halts: L2/L3 finality halts, bridge disables, read-only mode.
- If L2 halts: L3 finality halts, L1 remains live.

## Deployment + wiring

Use the cascading finality deploy script to deploy missing oracles and wire them into bridge/rollup contracts on the active network:

```bash
cd contracts
npm run deploy:cascading-finality
```

`scripts/deploy_all.ts` also performs the same wiring when `ENABLE_CASCADING_FINALITY=1` (default).
`scripts/deploy_rollups_manual.ts` now supports the same flags and emits `.tmp/last_rollups_manual.json`.

For non-default networks:

```bash
cd contracts
HARDHAT_DISABLE_TYPECHAIN=1 npx hardhat run --network anvil scripts/deploy_cascading_finality.ts
HARDHAT_DISABLE_TYPECHAIN=1 npx hardhat run --network ghostl2Op scripts/deploy_cascading_finality.ts
```

Useful overrides:

- `L1_FINALITY_ORACLE_ADDRESS`, `L2_FINALITY_ORACLE_ADDRESS`, `L3_FINALITY_ORACLE_ADDRESS` to reuse existing oracles
- `L2L3_BRIDGE_ADDRESS` to wire `L2L3Bridge`
- `ROLLUP_L2_L1_ADDRESS` and `ROLLUP_L3_L2_ADDRESS` to wire `OptimisticRollup` parent oracles
- `GOVERNANCE_EXECUTOR`, `GOVERNANCE_TIMELOCK`, `AI_POLICY_HASH`
