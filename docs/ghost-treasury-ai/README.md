# GhostTreasuryAI — Technical Reference

> **Layer**: GhostChain L1 (sovereign nucleus)  
> **Routing Law**: L3 → L2 only · L2 → L1 only · L3 → L1 **FORBIDDEN**  
> **Service port**: 7680  
> **Shadow mode default**: `SHADOW_MODE=true`, `AUTONOMY_TIER=1`

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  GhostTreasuryAI                    │
│         /services/ghost-treasury-ai                 │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │            TreasuryOrchestrator             │   │
│  │  cycle = snapshot → agents → quorum →        │   │
│  │           proposal → solvency proof          │   │
│  └──────────────────┬──────────────────────────┘   │
│                     │ parallel                       │
│        ┌────────────┼─────────────────────┐         │
│        ▼            ▼           ▼          ▼         │
│  MacroStrategist RiskGovernor MarketSentinel OpsCFO  │
│   (approve/hold)  (veto/pass)  (veto/pass) (approve) │
│                                                     │
│  ──── quorum evaluation (two-veto + 2-approval) ───  │
│                                                     │
│  ProposalBuilder → ProposalSubmitter                 │
│     shadow: log only  |  live: governor.propose()    │
└─────────────────────────────────────────────────────┘
                         │
                         │ on-chain
                         ▼
        ┌────────────────────────────────────┐
        │  L1 Smart Contract Kernel          │
        │  StrategyRegistry.sol              │
        │  RiskEngine.sol                    │
        │  TreasuryGovernor.sol  ◀── gating  │
        │  ProofOfSolvency.sol               │
        │  GhostRevenueRouter.sol            │
        └────────────────────────────────────┘
```

---

## 2. Smart Contracts

| Contract | File | Purpose |
|---|---|---|
| `StrategyRegistry` | `contracts/src/treasury/StrategyRegistry.sol` | On-chain allowlist of approved strategies |
| `RiskEngine` | `contracts/src/treasury/RiskEngine.sol` | Enforces risk budgets (VaR, drawdown, reserves) |
| `TreasuryGovernor` | `contracts/src/treasury/TreasuryGovernor.sol` | Timelocked proposal engine — only gate to execution |
| `ProofOfSolvency` | `contracts/src/treasury/ProofOfSolvency.sol` | Append-only Merkle solvency attestations |
| `GhostRevenueRouter` | `contracts/src/treasury/GhostRevenueRouter.sol` | Routes L2→L1 revenue into 6 governance-configured buckets |

### Routing Law Enforcement

`TreasuryGovernor` enforces the routing law structurally:

- Proposals tagged `OperationLayer.L3` require `strategyId > 0` (no direct vault access)
- `_enforceRoutingLaw()` is called on every `propose()` invocation
- The rule is validated in CI via `.github/workflows/ghostcontract-ai.yml` job `routing-law`

---

## 3. AI Agent Swarm

| Agent | Role | Veto Power |
|---|---|---|
| `MacroStrategist` | Long-horizon capital allocation | No |
| `RiskGovernor` | Circuit breaker, VaR, weekly loss | **Yes** |
| `MarketSentinel` | Gas spike, NAV integrity, manipulation | **Yes** |
| `OperationsCFO` | Runway coverage, payroll scheduling | No |
| `PostTradeAuditor` | Post-execution audit (not a voter) | — |

**Quorum rules** (see `src/proposal/builder.ts`):
- RiskGovernor or MarketSentinel `reject` with confidence ≥ 0.7 → **blocked**
- Otherwise: ≥ 2 `approve` votes + avg confidence ≥ 0.6 → **proceed**

---

## 4. Autonomy Tiers

| Tier | Mode | Max per Execution |
|---|---|---|
| 0 | Observe only | — |
| 1 | Shadow (log, no on-chain) | — |
| 2 | Live, micro | ≤ 50 ETH |
| 3 | Live, standard | ≤ 200 ETH |
| 4 | Live, large | ≤ 500 ETH |
| 5 | Crisis playbooks | Governance pre-approved |

Start at **Tier 1** (shadow). Promote via governance proposal after observing ≥ 30 shadow cycles with no false vetoes.

---

## 5. Phase Rollout Plan

### Phase 0 — Shadow Observation (Weeks 1–2)

```bash
SHADOW_MODE=true
AUTONOMY_TIER=1
CYCLE_INTERVAL_MS=300000   # 5 min
```

**Success criteria:**
- ≥ 30 completed cycles with no errors
- Solvency snapshots published consistently (< 2 h staleness)
- All 4 agents producing votes; no unexpected vetoes
- Grafana dashboard showing healthy NAV + stable reserve

### Phase 1 — Micro-Live (Weeks 3–4)

Governance proposal: `AUTONOMY_TIER=2`, `SHADOW_MODE=false`

```solidity
// TreasuryGovernor proposal
governor.propose(
    "Activate GhostTreasuryAI Tier 2",
    OperationLayer.L1,
    strategyId,
    address(riskEngine),
    abi.encodeCall(RiskEngine.updateNAV, (newNavValue))
);
```

**CI gate before Tier 2 promotion:**
- [ ] `forge test` passes with 0 failures
- [ ] All 5 unit test files: StrategyRegistry, RiskEngine, TreasuryGovernor, ProofOfSolvency, GhostRevenueRouter
- [ ] Invariant test: all 6 invariants hold
- [ ] `tsc --noEmit` passes
- [ ] Docker build succeeds, `/health` returns 200
- [ ] ≥ 30 shadow cycles logged in Grafana

### Phase 2 — Standard Live (Months 2–3)

Governance proposal to promote `AUTONOMY_TIER=3`.

**Additional gates:**
- [ ] Post-trade audit: all executions rated `green` or `yellow`
- [ ] No circuit breaker trips in Phase 1
- [ ] Revenue Router routing ≥ 10 transactions with correct bucket distribution
- [ ] Slippage ≤ 50 bps on all Phase 1 executions

### Phase 3 — Large Executions (Month 4+)

Promote to `AUTONOMY_TIER=4` only after formal review of Phase 2 metrics.

---

## 6. Deployment

### Prerequisites

```bash
# Deploy contracts (Foundry)
cd contracts
forge build
forge test
forge script scripts/deploy/DeployTreasuryAI.s.sol --rpc-url $L1_RPC_URL --broadcast
```

Set the resulting contract addresses in your `.env`:

```env
STRATEGY_REGISTRY_ADDRESS=0x...
RISK_ENGINE_ADDRESS=0x...
TREASURY_GOVERNOR_ADDRESS=0x...
PROOF_OF_SOLVENCY_ADDRESS=0x...
REVENUE_ROUTER_ADDRESS=0x...
```

### Start the service (Docker)

```bash
# Copy and fill in env vars
cp services/ghost-treasury-ai/.env.example services/ghost-treasury-ai/.env

# Start in shadow mode
docker compose -f services/ghost-treasury-ai/docker-compose.yml up -d
```

### Verify

```bash
# Health
curl http://localhost:7680/health

# Prometheus metrics
curl http://localhost:7680/metrics

# Service status
curl http://localhost:7680/status
```

---

## 7. Observability

### Grafana Dashboard

Import `/grafana/dashboards/ghost-treasury-ai.json` into Grafana.

**Key panels:**
- Treasury NAV (ETH)
- Stable Reserve vs 1000 ETH floor
- Ops Runway (months)
- Circuit Breaker state (0=closed, 1=open)
- Autonomy Tier
- Shadow Proposals count
- Agent votes by verdict
- Daily VaR + Weekly Loss

### Prometheus Alerts

Rules file: `/observability/prometheus/rules/ghost-treasury-ai.rules.yml`

| Alert | Severity | Condition |
|---|---|---|
| `TreasuryAIDown` | critical | service unreachable > 2 min |
| `TreasuryCircuitBreakerOpen` | critical | circuit breaker = 1 |
| `TreasuryStableReserveLow` | critical | stable < 1000 ETH |
| `TreasuryDailyVaRCritical` | critical | daily VaR > 450 ETH |
| `TreasuryRunwayBelowMinimum` | critical | runway < 6 months |
| `TreasurySolvencySnapshotStale` | warning | snapshot > 2 h old |
| `TreasuryRiskGovernorVetoSpike` | warning | > 5 vetoes in 15 min |
| `TreasuryNAVDropSignificant` | critical | NAV drop > 5% in 1 h |

---

## 8. Treasury Constitution

The normative policy document lives at:

```
services/ghost-treasury-ai/constitution.yml
```

It defines all numerical parameters for the on-chain contracts (risk limits, timelock durations, bucket weights, strategy allowlist). Changes require a governance proposal with the long timelock (72 h).

---

## 9. Security

- **Secret redaction**: `src/logger.ts` redacts `PROPOSER_PRIVATE_KEY` and `L1_RPC_URL` from all logs
- **No private keys in commits**: enforced by `trivy-secret.yaml` scan in CI
- **Re-entrancy protection**: `TreasuryGovernor.execute()` marks status=EXECUTED before any external calls
- **Routing law**: enforced at contract level — L3→L1 direct calls revert unconditionally
- **Emergency pause**: `GhostUpgradeGovernor.emergencyPause()` with GUARDIAN_ROLE key, per `AGENTS.md §8`

---

## 10. Testing

```bash
cd contracts

# Unit tests
forge test --match-path "test/treasury/*" -v

# Invariant tests
forge test --match-path "test/invariants/GhostTreasuryAI*" -v

# All treasury tests
forge test --match-path "test/treasury/*" test/invariants/GhostTreasuryAI* -v

# TypeScript build check
cd ../services/ghost-treasury-ai
pnpm tsc --noEmit
```

**Invariants (must hold at all times):**
1. `RESERVE_FLOOR` — stable reserve ≥ `minStableReserve` unless circuit breaker open
2. `NO_CB_EXECUTION` — no proposal executed while circuit breaker open
3. `STRATEGY_COUNT_MONOTONIC` — strategy count never decreases
4. `SNAPSHOT_COUNT_MONOTONIC` — solvency snapshot count never decreases
5. `NAV_NOT_ZERO` — treasury NAV is always > 0
6. `PAUSE_BLOCKS_PROPOSALS` — no proposals succeed while TreasuryGovernor is paused
