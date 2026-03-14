# GhostChain Liquidity Gravity Engine (LGE) — Threat Model

This threat model focuses on the Liquidity Gravity Engine deployed on GhostChain L1 and its off-chain router/relayer stack.

## Assets to protect

- **Vault principal** (deposited assets managed by `LoadBalancerVault`)
- **Settlement yield** (assets transferred to L1 via `SettlementOracle`)
- **Governance controls** (registries, caps, pausability, relayer set)
- **Operator bonds** (slashing collateral in `OperatorBondVault`)
- **Audit logs** (append-only records produced by the router)

## Adversaries

- External attackers (EOA/contract)
- Compromised operator key / router signer
- Compromised relayer key(s) (partial or quorum)
- Malicious governance proposal (social/governance capture)
- External chain failure / censorship / reorgs / RPC manipulation

## Primary threats and mitigations

### T1: Unauthorized deployment of principal

- **Threat:** Router key compromise attempts to deploy more than allowed.
- **Mitigations:**
  - `LoadBalancerVault` enforces per-adapter cap, global cap, cooldown, and circuit breaker rate limits.
  - Only explicitly authorized deployers can call deploy functions.
  - Governance can pause globally/per-adapter via `CircuitBreaker`.

### T2: Settlement forgery (fake yield)

- **Threat:** Attacker submits settlement without real external receipts to siphon funds.
- **Mitigations:**
  - Settlement requires an adapter-configured proof type:
    - Threshold ECDSA signatures by authorized relayers over the settlement digest, **or**
    - A ZK proof verified by a governance-configured `IZkSettlementVerifier`.
  - Replay protection via per-adapter sequence numbers.
  - Settlement is “paid”: `submitSettlement` requires transfer of the settlement asset into `SettlementOracle` (no minting).
  - For ZK adapters, proof generation must be done by an audited prover pipeline and should be treated as a high-trust boundary.

### T3: Settlement censorship / liveness failure

- **Threat:** Relayers refuse to sign or external chain is down; settlement misses the window.
- **Mitigations:**
  - “No settlement → no continuation” on-chain gating blocks new deployments when overdue.
  - `CircuitBreaker` provides emergency pause + rate limiting to stop further exposure.
  - Watchdog alerts and safe remediation (reduce exposure / unwind when possible).

### T4: Operator theft / non-return of principal

- **Threat:** Operator/strategy steals principal bridged out.
- **Mitigations (MVP):**
  - Operator bond held in `OperatorBondVault`.
  - Settlement windows and penalties + pause on missed settlement.
  - Governance allowlist of operators and strategies; small caps by risk tier.
- **Mitigations (bridge escrow custody):**
  - Principal custody can be moved from `adapter.operator` to `StandardBridge` escrow via `BridgeEscrow` (operator no longer holds L1 principal).
  - Native principal can be handled via a canonical wrapped-native token configured on `BridgeEscrow` and bridged as an ERC20.
  - Returned principal must physically arrive on L1 (escrow → vault) before `LoadBalancerVault` can record an unwind.
- **Additional production hardening:**
  - Use protocol-controlled smart-accounts on external chains and withdraw-only routing to L1 escrow.
  - Strengthen reconciliation using ZK receipts / fraud proofs when available.

### T5: Reentrancy / accounting manipulation

- **Threat:** Malicious token callbacks or reentrancy to bypass caps/withdrawals.
- **Mitigations:**
  - Reentrancy guards in vault and router-facing entrypoints.
  - Checks-effects-interactions ordering and explicit accounting updates.
  - Minimal external calls; settlement routing is fixed and only from Oracle.

### T6: Governance capture / policy bypass

- **Threat:** A malicious proposal changes caps/relayers/receivers.
- **Mitigations:**
  - Governance is expected to be timelocked (`Governed` executor model).
  - PolicyRegistry supports activation delays, emergency overrides, and rollback windows.
  - Human ratification gates exist elsewhere in the stack and should remain enabled.

### T7: DEX price manipulation during buyback/POL provisioning

- **Threat:** MEV or low-liquidity pools cause adverse execution (front-running / sandwich), wasting yield.
- **Mitigations:**
  - DEX reinjection is optional and governance-configured; `RewardRouter` can be paused.
  - Slippage bounds enforced in adapter logic (`dexMaxSlippageBps`) and changes are timelocked.
  - Production deployments should use TWAP-aware pricing and deep-liquidity pools only (enforced by policy + adapter allowlists, e.g. a canonical `IDexAdapter` such as `GhostDexAdapter`).

## Security monitoring requirements

- Alerts on: missed settlement, adapter paused, drawdown threshold breaches, relayer set changes, unusual deploy rates, and oracle submission failures.
