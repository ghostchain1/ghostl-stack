# AI Contract Pack Baseline (Phase 1)

This baseline was produced by scanning `contracts/`, `apps/`, `packages/`, `services/`, and `infra/` and by running the repo’s existing contract build/tests in a non-destructive way.

## Toolchain Summary (What Works Today)

- Foundry is configured at `contracts/foundry.toml`.
- Foundry compile command that succeeds: `forge build` (run in `contracts/`).
- Foundry test command that succeeds: `forge test` (run in `contracts/`).
- Hardhat is configured at `contracts/hardhat.config.ts`.
- Hardhat deployment scripts live under `contracts/scripts/`.
- `hardhat compile` currently fails with a stack-too-deep error in `contracts/src/MockSystemConfig.sol` (HH600) without `viaIR` enabled.

## ABI, Artifacts, and Deployments (Canonical Paths in Use)

- `apps/api` reads ABIs from Hardhat artifacts under `contracts/artifacts/src`.
- The ABI lookup code lives in `apps/api/src/server.ts` (`findArtifactPath`, `readArtifactAbi`).
- `apps/api` seeds contract addresses from deployment JSON files under `contracts/deployments/<network>/{l1,l2,l3}.json`.
- The deployments directories exist but appear empty today: `contracts/deployments/ghostl2` and `contracts/deployments/ghostl2Op`.

## Governance and Admin Wiring (Actual Patterns Present)

- Custom ownership helper: `contracts/src/common/Ownable.sol`.
- Governance gating helper: `contracts/src/common/Governed.sol` (governor + timelock addresses, `onlyGovernance`/`onlyExecutor`).
- Minimal governance contracts: `contracts/src/governance/Governor.sol` and `contracts/src/governance/ProposalExecutor.sol`.
- Governed control-plane contracts on L1: `contracts/src/l1/StakingManager.sol`, `contracts/src/l1/SlashingManager.sol`, `contracts/src/l1/Treasury.sol`, `contracts/src/l1/Faucet.sol`, and `contracts/src/l1/RewardDistributor.sol`.
- Existing guard rails and AI contracts are mostly `owner`-controlled today: `contracts/src/GuardPolicy.sol`, `contracts/src/L2L3Bridge.sol`, `contracts/src/ai/AIAttestationBase.sol`, `contracts/src/ai/AICommandCenter.sol`, `contracts/src/ai/AILayerGuardian.sol`, `contracts/src/l1/AIGuardianL1.sol`, `contracts/src/l2/AIGuardianL2.sol`, and `contracts/src/l3/AIGuardianL3.sol`.

## Chain Parameters Observed (Do Not Guess)

- L1 chain ID observed in infra/services/apps: `14000101`.
- L2 chain ID observed in infra/services/apps: `901`.
- L3 chain ID observed in infra/services/apps: `903`.
- References for the chain IDs include `infra/opstack/config/rollup.json`, `infra/opstack/l3/ghostl3/config/genesis.json`, `apps/api/.env.example`, and `services/stack.env.example`.
- Hardhat defaults match current infra defaults: `L1_CHAIN_ID` default is `14000101` and `L3_CHAIN_ID` default is `903` in `contracts/hardhat.config.ts` (override via env when targeting other networks).
- Host RPC ports observed: L1 `18545`, L2 `29547` (published by `infra/opstack/docker-compose.yml` for `l2-geth`), and L3 `39545` (published by `infra/opstack/docker-compose.l3.yml` for `l3-geth`).

## Selected Sensitive Integration Target (Real and Referenced)

- Selected contract: `contracts/src/l1/SlashingManager.sol`.
- Selected function: `setFeePolicy(FeePolicyParams)`.
- This is a control-plane setter already gated by `onlyGovernance`.
- It is referenced by existing automation and tests: `contracts/scripts/propose_update_fee_policy.ts` and `contracts/test/foundry/GasTokenInvariant.t.sol`.
- This target provides a governed, existing path to attach advisory/enforced AI gating while preserving explicit governance override.

## Evidence

- Phase 1 log: `docs/evidence/ai-pack/build_logs/phase1.log`.
