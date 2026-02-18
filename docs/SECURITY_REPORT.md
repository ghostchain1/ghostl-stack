# Liquidity Gravity Engine (LGE) — Security Report (MVP)

## Scope

- On-chain: `contracts/src/liquidity/*`
- Dev AMM: `contracts/src/amm/MinimalAMM.sol`
- Off-chain router: `services/liquidity-router/*`
- CLI tooling: `tools/liquidityctl/*`

## Implemented controls

- Governance-locked configuration using existing `Governed` model (executor / timelock).
- Caps and cooldowns enforced in `LoadBalancerVault` + `AdapterRegistry`.
- “No settlement → no continuation” enforced by `SettlementOracle.requireCanContinue`.
- Threshold ECDSA settlement attestation verification in `SettlementOracle`.
- Pluggable ZK settlement verification via `SettlementOracle.submitSettlementZk` + `IZkSettlementVerifier` (verifier set per adapter).
- Replay protection via per-adapter settlement sequence numbers.
- Circuit breaker (global + per-adapter pause) and deploy rate-limits.
- Operator bonds with optional locking + slashing (`OperatorBondVault`).
- Bridge escrow custody option for principal via `BridgeEscrow` + `StandardBridge` (ERC20).
- Native bridge escrow custody supported via a canonical wrapped-native token configured on `BridgeEscrow` (native is wrapped then bridged as ERC20).
- Optional on-chain reinjection via `RewardRouter` + a governance-approved `IDexAdapter` (dev reference: `MinimalAmmDexAdapter`).
- Append-only signed audit logs produced by router.

## How to run security tooling (repo-local)

Contracts:

- Slither (existing): `npm --prefix contracts run formal:slither`
- Foundry fuzz/invariant (existing): `npm --prefix contracts run test:fuzz` and `npm --prefix contracts run test:invariant`

Containers:

- Trivy filesystem scan (existing GitHub workflow) or local: `trivy fs ...` (see `.github/workflows/nightly-security.yml`)

## Known MVP limitations

- Operator custody remains supported for dev/MVP; production should use bridge escrow custody and external-chain smart-accounts with withdraw-only routing.
- ZK verification is an interface-level module; production requires audited circuits/verifiers and a prover pipeline (plus governance-controlled key/circuit rotation).
- DEX reinjection is adapter-driven; production requires a reviewed adapter for the canonical GhostChain DEX and robust slippage/TWAP policy enforcement.
