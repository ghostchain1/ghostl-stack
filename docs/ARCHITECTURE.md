# GhostChain Liquidity Gravity Engine (LGE) — Architecture

This document describes the Liquidity Gravity Engine (LGE): a governance-locked system for deploying protocol liquidity to external execution venues (EVM chains) while enforcing that all yield/fees settle back to GhostChain L1 as the canonical ledger.

## Goals

- **Canonical ledger on L1:** GhostChain L1 is the only canonical accounting surface. External chains never mint Ghost-native assets.
- **Governance-locked deployments:** No external capital deployment without on-chain governance approval (caps, policies, timelocks).
- **No settlement → no continuation:** If settlement is overdue, further deployment is blocked by on-chain rules.
- **Autonomous, but bounded:** Off-chain agents can propose and execute actions only within on-chain invariants and policy limits.
- **Auditability:** Every deploy/unwind/settlement is recorded on-chain and mirrored to an append-only off-chain audit log.

## Components

### On-chain (GhostChain L1)

Located under `contracts/src/liquidity/`:

- **`LoadBalancerVault`**
  - Accepts deposits of supported assets (ERC20 and native gas token via `asset=address(0)` in the MVP).
  - Mints internal vault shares per-asset to depositors.
  - Tracks principal deployed per adapter and enforces per-adapter caps, global caps, cooldowns, and withdrawal constraints.
  - Requires `SettlementOracle` to report “can continue” for each adapter before allowing additional deploys.
  - Supports two custody modes per adapter:
    - **Operator custody (MVP)**: principal is transferred to `AdapterRegistry.operator`.
    - **Bridge escrow custody (recommended)**: principal is routed via `BridgeEscrow` into `StandardBridge` escrow.

- **`AdapterRegistry`**
  - Governance registry for approved external “adapters” (execution venues).
  - Stores: `externalChainId`, `riskTier`, `maxDeployCap`, `settlementInterval`, `requiredProofType`, operator address, pause flags.

- **`SettlementOracle`**
  - Canonical accounting of deployed principal and settled yield per adapter + asset.
  - Verifies settlement “proofs” per adapter:
    - `ECDSA_ATTESTATION`: threshold ECDSA signatures by authorized relayers over the EIP-712 settlement digest.
    - `ZK_PROOF`: calls a pluggable `IZkSettlementVerifier` for the settlement digest (verifier configured per adapter).
  - Enforces settlement windows and provides `requireCanContinue(adapterId)` for `LoadBalancerVault`.
  - Routes settled yield into `RewardRouter` (the only allowed ingress for yield into reinjection flows).

- **`RewardRouter`**
  - Governance-configured reinjection splits (BPS): (A) protocol-owned liquidity receiver, (B) buyback+burn receiver, (C) validator rewards receiver.
  - Split changes are timelocked (queue + activate) and can be emergency-paused.
  - Optional on-chain reinjection:
    - Buyback swap + burn via a governance-approved `IDexAdapter`.
    - One-sided POL provisioning (swap + LP mint) via the same adapter (dev adapter: `MinimalAmmDexAdapter`).

- **`CircuitBreaker`**
  - Global and per-adapter pause controls plus a simple per-adapter rate limit window for deployments.

- **`OperatorBondVault`**
  - Operators (off-chain executors) post a bond in an approved bond asset.
  - `SettlementOracle` can record penalties and (optionally) execute slashing from operator bond under governance-defined conditions.

- **`BridgeEscrow`**
  - Governance-controlled bridge integration used by `LoadBalancerVault` when bridge custody is enabled.
  - Bridges ERC20 principal via a configured `StandardBridge` instance.
  - Bridges native principal by wrapping into a configured `wrappedNative` ERC20 and bridging that token (production should use the canonical wrapped-native token).
  - Finalizes unwinds only by forwarding returned assets back to the vault (no arbitrary withdrawals).

### Off-chain (AI-autonomous services)

Located under `services/liquidity-router/`:

- **Strategy Engine**
  - Produces *proposals* (amount, adapter, strategyId, bounds, unwind plan).
  - Does not bypass on-chain policy; it only suggests and then calls on-chain methods under the configured authorizations.

- **Risk Engine**
  - Computes a risk score and an allowed action envelope using health signals, volatility proxies, and policy snapshots.
  - Can only *reduce* the action envelope below on-chain caps, never expand it.

- **Execution Manager**
  - Submits deploy/unwind calls to `LoadBalancerVault`.
  - Uses a signer from Vault (prod) or a dev private key via Docker secrets/env (dev).

- **Settlement Manager (mandatory)**
  - On schedule, gathers external receipts and produces a commitment hash.
  - Submits:
    - `SettlementOracle.submitSettlement(...)` (ECDSA) **or**
    - `SettlementOracle.submitSettlementZk(...)` (ZK)
  - For ZK adapters, a prover pipeline can be used to obtain proofs (router env: `LGE_ZK_PROVER_URL`).
  - Transfers settlement assets (no minting) alongside the proof.
  - If settlement fails or is late, triggers on-chain circuit breaker and emits alerts.

- **Self-Healing Watchdog**
  - Detects RPC failures, stuck nonces, missed settlement windows, relayer outages.
  - Performs safe remediation (RPC failover, reduce exposure, pause adapter) and writes a signed audit record.

## Data flows

1. **Deposit**
   - User deposits a supported asset into `LoadBalancerVault` → shares minted.
2. **Deploy**
   - Authorized router calls `LoadBalancerVault.deployToAdapter(...)`.
   - Vault enforces caps/cooldowns/rate limits and calls `SettlementOracle.requireCanContinue(adapterId)`.
   - Custody:
     - **Operator mode:** vault transfers principal to the adapter’s configured operator (MVP).
     - **Bridge escrow mode:** vault transfers principal to `BridgeEscrow`, which bridges into `StandardBridge` escrow; operator never holds L1 principal.
       - For native principal, `BridgeEscrow` wraps into `wrappedNative` before bridging.
   - Vault records the deployment in `SettlementOracle`.
3. **External execution**
   - Off-chain router deploys principal on the external chain via whitelisted strategies (MVP: mocked).
4. **Settlement**
   - Router collects rewards, converts to acceptable settlement assets (per policy), and submits `SettlementOracle.submitSettlement`.
   - Oracle verifies threshold attestation, records accounting, and forwards yield into `RewardRouter`.
5. **Reinjection**
   - `RewardRouter` splits yield to configured receivers (POL/burn/validators).
   - If DEX reinjection is enabled, `RewardRouter` executes on-chain buyback+burn and/or POL provisioning via a governance-approved `IDexAdapter`.

## Trust boundaries

- **On-chain contracts** are the source of truth. The off-chain router is untrusted by default and must not be able to violate on-chain invariants.
- **Relayers / provers** provide settlement proofs (ECDSA quorum and/or ZK verifier). Their keys and verifier contracts are governed and rotated.
- **Operators** trigger deploy/unwind actions and hold a slashing bond. In bridge escrow mode they do not custody L1 principal.

## Extension points (planned)

- Upgrade ZK settlement verification from stub verifiers to production-grade circuits and verifiers (already pluggable via `IZkSettlementVerifier`).
- Production DEX integration via a reviewed `IDexAdapter` implementation (dev reference: `MinimalAmmDexAdapter`, production scaffold: `GhostDexAdapter`).
