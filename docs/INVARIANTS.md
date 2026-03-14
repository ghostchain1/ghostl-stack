# GhostChain Liquidity Gravity Engine (LGE) — Invariants

This document defines the invariants enforced by the Liquidity Gravity Engine contracts and assumed by the off-chain router.

## Definitions (canonical)

- Vault deployed principal is tracked per `(adapterId, asset)` by `LoadBalancerVault.deployedByAdapterAsset(adapterId, asset)`.
- Canonical deployed principal is tracked by `SettlementOracle.principalDeployed(adapterId, asset)` and MUST match vault values.
- Overdue settlement gating is implemented by `SettlementOracle.requireCanContinue(adapterId)` and enforced by vault deploy calls.
- Reward split conservation is enforced in `RewardRouter.distribute(...)` using `BPS_DENOM = 10_000`.

## Canonical ledger invariants

1. **L1 is canonical accounting**
   - Deployed principal and settled yield are only recorded in `SettlementOracle`.
2. **External chains never mint Ghost-native assets**
   - LGE does not mint Ghost assets on external chains. External chains produce receipts/commitments only.

## Deployment invariants

3. **Caps must hold**
   - For any adapter `a`, `deployedPrincipal[a] <= AdapterRegistry.maxDeployCap[a]`.
   - Global deployed across adapters must not exceed `LoadBalancerVault.maxTotalDeployed` for the asset.
4. **Rate limits must hold**
   - `CircuitBreaker` limits per-adapter deploy rate per time window.
5. **Cooldown must hold**
   - Deploys respect configured cooldown per adapter to prevent rapid oscillations.
6. **Bridge escrow custody is withdraw-only**
   - If `LoadBalancerVault.adapterUsesBridgeEscrow(adapterId) == true`, then:
     - `deployToAdapter` MUST route principal via `BridgeEscrow` (not to `adapter.operator`):
       - ERC20 principal: `BridgeEscrow.bridgeOut(...)`
       - Native principal: `BridgeEscrow.bridgeOutNative(...)` (wraps to configured `wrappedNative` then bridges ERC20)
     - `unwindFromAdapter` MUST revert (principal returns via bridge finalization, not operator transfer).
     - `unwindFromEscrow` MUST only be callable by `BridgeEscrow` (and is payable for native principal returns).
   - `BridgeEscrow.finalizeUnwind` / `finalizeUnwindNative` can only forward funds to the canonical L1 vault (no arbitrary withdrawals).

## Settlement invariants

7. **No settlement → no continuation**
   - If `block.timestamp > lastSettledAt[a] + settlementInterval[a]`, then `SettlementOracle.requireCanContinue(a)` MUST revert and `LoadBalancerVault` MUST block deploys to `a`.
8. **Rewards only enter via SettlementOracle**
   - Reward flows into reinjection receivers are only triggered from `SettlementOracle.submitSettlement`.
9. **Replay protection**
   - Settlements must include a strictly increasing per-adapter sequence number.
10. **Proof verification**
   - Settlement proof type is adapter-configured:
     - **ECDSA:** requires threshold ECDSA signatures by authorized relayers over the EIP-712 settlement digest.
     - **ZK:** requires a governance-configured `IZkSettlementVerifier` to accept the settlement digest and proof.

## Reward routing invariants

11. **Reward splits sum to 100%**
   - RewardRouter split BPS must sum to `10_000`.
12. **Split changes are timelocked**
   - RewardRouter split updates require queue + activate with a minimum delay, unless governance triggers an emergency pause.
13. **DEX reinjection is bounded**
   - If on-chain buyback/POL provisioning is enabled, `dexMaxSlippageBps` MUST be bounded by governance and changes MUST be timelocked.
   - RewardRouter must never spend vault principal; only settled yield routed via `SettlementOracle` is eligible.

## Withdrawal invariants (MVP)

14. **Withdrawals are liquidity-constrained**
   - Vault withdrawals must not exceed liquid on-chain balances (MVP does not force external unwinds).

## Known MVP limitations (explicit)

- Operator custody remains supported for dev/MVP. Production should prefer bridge escrow custody via `BridgeEscrow` + `StandardBridge` and proof-based reconciliation where possible.
- Native principal bridging requires a canonical wrapped-native token (`BridgeEscrow.wrappedNative`) and a configured remote wrapped token mapping per adapter.

## Governance invariants (constitutional)

15. **Voting power is computed on-chain (no user-supplied weight)**
   - For `contracts/src/governance/GhostChainGovernor.sol`, vote weight MUST be derived from `stakeVotes + validatorVotes` at a defined snapshot timepoint.

16. **Constitutional proposals are strictly harder**
   - Constitutional proposals require:
     - higher quorum,
     - a supermajority of participation,
     - and a longer minimum timelock delay
     than standard proposals (as defined by `ConstitutionRegistry.rules()`).

17. **Rule minima are immutable**
   - `ConstitutionRegistry.minimumRules` defines minimum acceptable thresholds for quorum, supermajority, and delays.
   - Updates MUST never fall below these minima.

18. **Federation clearance for cross-layer constitutional actions**
   - For federated L2/L3 timelocks, constitutional executions MUST require an L1 clearance attestation recorded in `FederationCouncil` and delivered down to the execution chain’s `FederatedTimelock` (via a bridge adapter).
