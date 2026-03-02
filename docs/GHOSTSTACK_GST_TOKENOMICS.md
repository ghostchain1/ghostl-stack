# GhostStack GST Tokenomics
## Full Mathematical Model v1.0

**Classification:** Technical — Economic Model  
**Status:** Production  
**Token:** $GST — Ghost Sovereign Token  

---

## Abstract

This document presents the complete mathematical model governing the Ghost Sovereign Token (GST) economic system. The model covers supply mechanics, fee flow architecture, burn algorithms, buyback equilibrium, treasury reserve modeling, yield distribution, and long-range supply projections. All parameters are constitutionally enforced and governance-adjustable within defined bounds.

---

## 1. Token Fundamentals

### 1.1 Genesis Parameters

```
Symbol:          GST
Name:            Ghost Sovereign Token
Decimals:        18
Genesis Supply:  S₀ = 1,000,000,000 GST (1 billion)
Contract (L1):   0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### 1.2 Token Classification

GST is a **multi-function utility token** with five distinct economic roles:

| Role | Function | Layer |
|---|---|---|
| Gas | Transaction fee payment | L1, L2, L3 |
| Governance | Voting weight | L1 |
| Staking | Validator collateral | L1 |
| Burn | Deflationary mechanism | All |
| Buyback | Treasury yield deployment | L1 |

### 1.3 Supply Dynamics

GST supply is governed by three forces:

```
S(t) = S₀ - B(t) - R(t) + E(t)

where:
  S(t)  = circulating supply at time t
  S₀    = genesis supply (1,000,000,000 GST)
  B(t)  = cumulative burn at time t
  R(t)  = cumulative buyback-and-burn at time t
  E(t)  = cumulative validator emission at time t
```

**Design principle:** B(t) + R(t) > E(t) over the long run, creating net deflationary pressure as the network matures.

---

## 2. Fee Flow Architecture

### 2.1 Layer Revenue Model

**L3 Revenue:**

```
R_L3(e) = Σᵢ fee_i(e)

where fee_i ∈ {gas_fees, sdk_fees, deploy_fees, commission_fees, nft_fees, api_fees}

All R_L3(e) routes to L2 aggregator (100%)
```

**L2 Revenue:**

```
R_L2(e) = R_L3(e) + R_L2_native(e)

R_L2_native(e) = trading_fees(e) + swap_fees(e) + bridge_fees(e) + launchpad_fees(e)

L2 operations retention: R_L2_ops(e) = R_L2_native(e) × 0.30
L1 treasury routing:     R_L2→L1(e)  = R_L3(e) + R_L2_native(e) × 0.70
```

**L1 Treasury Intake:**

```
T_intake(e) = R_L2→L1(e) + Y_return(e)

where Y_return(e) = yield returned from external strategies in epoch e
```

### 2.2 Fee Routing Invariant

The routing law is mathematically expressed as:

```
∀ fee f generated at layer L:
  if L = L3: destination(f) = L2 (mandatory)
  if L = L2: destination(f) ∈ {L2_ops, L1} (split by policy)
  if L = L1: destination(f) = Treasury

No fee may route L3 → L1 directly.
No fee may route to external without L1 ratification.
```

---

## 3. Burn Algorithm

### 3.1 Base Burn Formula

Each epoch e, a burn amount is computed and executed:

```
B(e) = F(e) × r_burn(e)

where:
  F(e)      = total protocol fees collected in epoch e (all layers)
  r_burn(e) = burn rate for epoch e
```

### 3.2 Adaptive Burn Rate

The burn rate adapts to network utilization:

```
r_burn(e) = r_base × (1 + φ(e))

φ(e) = max(0, (ū(e) - u_threshold) × κ)

where:
  r_base      = 0.02 (2% base burn rate)
  ū(e)        = average network utilization in epoch e
  u_threshold = 0.50 (50% utilization threshold)
  κ           = 0.10 (congestion sensitivity coefficient)
```

**Burn Rate Table:**

| Network Utilization | φ(e) | r_burn(e) |
|---|---|---|
| 0% – 50% | 0.000 | 2.00% |
| 60% | 0.010 | 2.10% |
| 70% | 0.020 | 2.20% |
| 80% | 0.030 | 2.30% |
| 90% | 0.040 | 2.40% |
| 100% | 0.050 | 2.50% |

*Note: κ = 0.10 is the default. Governance may adjust κ ∈ [0.05, 0.20] via standard majority.*

### 3.3 Burn Execution

```
Burn execution per epoch:
  1. Compute F(e) from all layer fee collectors
  2. Compute r_burn(e) from utilization oracle
  3. Compute B(e) = F(e) × r_burn(e)
  4. Transfer B(e) GST to burn address (0x000...dead)
  5. Emit BurnEvent(epoch=e, amount=B(e), rate=r_burn(e))
  6. Update cumulative burn: B_total += B(e)
```

### 3.4 Annual Burn Projection

Assuming base case parameters:

```
Annual fee revenue:  F_annual = $15,000,000 equivalent
Average burn rate:   r_burn_avg = 2.15% (at 65% avg utilization)
Annual burn:         B_annual = $15,000,000 × 0.0215 = $322,500 equivalent

At GST price P:
  GST_burned_annual = $322,500 / P

At P = $0.10:  GST_burned_annual = 3,225,000 GST (0.32% of supply)
At P = $1.00:  GST_burned_annual = 322,500 GST (0.032% of supply)
At P = $10.00: GST_burned_annual = 32,250 GST (0.003% of supply)
```

---

## 4. Buyback Equilibrium Model

### 4.1 Buyback Allocation Formula

```
BB(e) = Y_net(e) × r_buyback

where:
  Y_net(e)   = net yield in epoch e (after stress losses)
  r_buyback  = 0.15 (15% of net yield allocated to buyback)
```

### 4.2 Buyback Execution Model

Buyback is executed via GhostXchange using Time-Weighted Average Price (TWAP):

```
TWAP execution parameters:
  Window:           7 days
  Max daily impact: 1% of 24h trading volume
  Execution:        Uniform distribution over window
  Slippage limit:   0.5% per execution

Daily buyback amount:
  BB_daily(e) = BB(e) / 7

Price impact per execution:
  impact(e) = BB_daily(e) / (V_24h(e) × 0.01)

Execution suspended if:
  impact(e) > 0.01 (1% daily impact limit exceeded)
  treasury_balance < reserve_floor × 1.5
```

### 4.3 Buyback Suspension Conditions

```
suspend_buyback = (
  treasury_balance < reserve_floor × 1.5
  OR Y_net(e) ≤ 0
  OR governance_halt = true
)
```

### 4.4 Buyback-and-Burn Flow

```
All bought-back GST is burned immediately:
  R(e) = BB(e) (all buyback proceeds burned)

Cumulative buyback-burn:
  R_total(t) = Σₑ R(e) for all epochs e ≤ t
```

### 4.5 Annual Buyback Projection

```
Base case:
  Annual net yield:    Y_net_annual = $750,000
  Buyback ratio:       r_buyback = 0.15
  Annual buyback:      BB_annual = $750,000 × 0.15 = $112,500

At GST price P:
  GST_buyback_annual = $112,500 / P

At P = $0.10:  GST_buyback_annual = 1,125,000 GST
At P = $1.00:  GST_buyback_annual = 112,500 GST
At P = $10.00: GST_buyback_annual = 11,250 GST
```

---

## 5. Treasury Reserve Model

### 5.1 Reserve Floor Formula

```
RF(t) = max(RF_absolute, T(t) × ρ_reserve)

where:
  RF(t)        = reserve floor at time t
  RF_absolute  = governance-set absolute minimum
  T(t)         = total treasury balance at time t
  ρ_reserve    = 0.20 (20% reserve ratio)
```

### 5.2 Asset Allocation Constraints

```
Let A_stable(t) = stable asset holdings at time t
Let A_volatile(t) = volatile/yield asset holdings at time t
Let A_total(t) = A_stable(t) + A_volatile(t) = T(t)

Constitutional constraints:
  A_stable(t) / A_total(t) ≥ 0.65  (minimum 65% stable)
  A_volatile(t) / A_total(t) ≤ 0.35 (maximum 35% volatile)

Within volatile allocation:
  A_single_strategy(t) / A_volatile(t) ≤ 0.57 (max 20% of total in single strategy)
  risk_score(portfolio) ≤ 7200 bps
```

### 5.3 Treasury Growth Model

```
T(t+1) = T(t) + T_intake(e) + Y_gross(e) - D(e) - B_treasury(e)

where:
  T_intake(e)   = fee revenue routed to treasury in epoch e
  Y_gross(e)    = gross yield from external strategies
  D(e)          = distributions (validator rewards + grants + incentives)
  B_treasury(e) = treasury-level burns (buyback execution)
```

### 5.4 Runway Model

```
runway(t) = T(t) / avg_monthly_burn_rate

avg_monthly_burn_rate = (D_monthly + ops_monthly) / T(t)

Minimum runway target: 24 months
Warning threshold:     12 months
Emergency threshold:   6 months
```

### 5.5 Treasury Stress Test

**Scenario: Simultaneous yield loss + governance rejection + drawdown**

```
Inputs:
  T(0)         = 10,000,000 GST (initial treasury)
  T_intake(e)  = 0 (no new revenue)
  Y_gross(e)   = 0 (yield strategies fail)
  D(e)         = 0 (distribution suspended)
  stress_loss  = 500,000 GST/epoch (drawdown event)

Reserve floor: RF = 10,000,000 × 0.20 = 2,000,000 GST

Epochs until reserve floor breach:
  n = (T(0) - RF) / stress_loss
  n = (10,000,000 - 2,000,000) / 500,000
  n = 16 epochs

At epoch 16: PolicyViolationGuard triggers emergency freeze.
No further drawdown permitted.
Governance must ratify corrective proposal to resume.
```

---

## 6. Yield Distribution Model

### 6.1 Net Yield Formula

```
Y_net(e) = Y_gross(e) - L_stress(e)

where:
  Y_gross(e)  = Σᵢ yield_i(e) from all active strategies
  L_stress(e) = stress losses in epoch e (defaults, impermanent loss, etc.)

Distribution condition:
  if Y_net(e) > 0: distribute
  if Y_net(e) ≤ 0: suspend distribution, fund reserve buffer first
```

### 6.2 Distribution Split Formula

```
When Y_net(e) > 0:

  D_reserve(e)    = Y_net(e) × 0.20  (reserve buffer)
  D_validator(e)  = Y_net(e) × 0.30  (validator rewards)
  D_ecosystem(e)  = Y_net(e) × 0.30  (ecosystem grants)
  D_incentives(e) = Y_net(e) × 0.20  (L2/L3 incentive pools)

  Σ = D_reserve + D_validator + D_ecosystem + D_incentives = Y_net(e) ✓
```

### 6.3 Validator Reward Distribution

```
Per-validator reward:
  R_v(e) = D_validator(e) × (score_v(e) / Σᵥ score_v(e))

Validator score:
  score_v(e) = w₁ × uptime_v(e) + w₂ × perf_v(e) + w₃ × stake_weight_v(e)

  w₁ = 0.40 (uptime weight)
  w₂ = 0.35 (performance weight)
  w₃ = 0.25 (stake weight)

Minimum score threshold:
  if score_v(e) < score_min: R_v(e) = 0 (no reward for epoch)
  score_min = 0.60 (governance-adjustable)
```

### 6.4 Ecosystem Grant Distribution

```
Ecosystem grants are distributed via governance-ratified grant programs:

  D_ecosystem(e) → GrantPool contract
  GrantPool distributes to approved recipients per governance ratification
  Undistributed grants roll over to next epoch
  Maximum rollover: 3 epochs (then returned to reserve)
```

### 6.5 L2/L3 Incentive Distribution

```
L2/L3 incentives are distributed to liquidity providers and active users:

  D_incentives(e) → IncentivePool contract
  Split: 60% L2 liquidity incentives, 40% L3 activity incentives

  L2 liquidity incentives:
    Per-LP reward ∝ LP_share × time_weighted_liquidity

  L3 activity incentives:
    Per-user reward ∝ activity_score(user, epoch)
    activity_score = gas_spent × activity_multiplier
```

---

## 7. Validator Staking Model

### 7.1 Staking Parameters

```
Minimum stake:     S_min = governance-set (initially 100,000 GST)
Maximum stake:     S_max = no cap (but stake_weight is log-normalized)
Unbonding period:  U = 21 days
Slashing window:   W = 30 days (evidence must be submitted within W)
```

### 7.2 Stake Weight Normalization

To prevent stake concentration from dominating governance:

```
stake_weight_v = log(stake_v + 1) / Σᵥ log(stake_v + 1)

This ensures:
  - Large stakes have diminishing marginal weight
  - Small validators are not completely marginalized
  - No single validator can dominate by stake alone
```

### 7.3 Slashing Model

```
Slash amounts by violation type:

  Double signing:       slash_v = stake_v × 1.00 (100%)
  Sustained downtime:   slash_v = stake_v × 0.10 (10%)
  Routing violation:    slash_v = stake_v × 0.20 (20%)
  Governance attack:    slash_v = stake_v × 1.00 (100%)
  Constitutional breach: slash_v = stake_v × 1.00 (100%)

Slashed GST disposition:
  50% → burned (deflationary)
  50% → treasury (revenue)
```

### 7.4 Staking APY Model

```
Validator APY(v, e) = (R_v(e) × epochs_per_year) / stake_v × 100%

Base case (Y_net_annual = $750,000, 30% to validators):
  D_validator_annual = $225,000

  At 25 validators, equal stake:
    Per-validator annual reward = $225,000 / 25 = $9,000
    At stake = 100,000 GST, P = $1.00:
    APY = $9,000 / $100,000 = 9.0%

  At 100 validators, equal stake:
    Per-validator annual reward = $225,000 / 100 = $2,250
    APY = $2,250 / $100,000 = 2.25%
```

---

## 8. Long-Range Supply Projections

### 8.1 Supply Model

```
S(t) = S₀ - B_total(t) - R_total(t) + E_total(t)

Annual components (base case):
  B_annual  = $322,500 / P (fee burn)
  R_annual  = $112,500 / P (buyback burn)
  E_annual  = D_validator_annual / P (validator emission)

Net annual supply change:
  ΔS_annual = E_annual - B_annual - R_annual
```

### 8.2 Supply Projection Table (Base Case, P = $1.00)

| Year | Treasury Intake | Net Yield | Fee Burn (GST) | Buyback Burn (GST) | Validator Emission (GST) | Net Supply Change | Circulating Supply |
|---|---|---|---|---|---|---|---|
| 0 | — | — | — | — | — | — | 1,000,000,000 |
| 1 | $5M | $250K | 107,500 | 37,500 | 75,000 | -70,000 | 999,930,000 |
| 2 | $15M | $750K | 322,500 | 112,500 | 225,000 | -210,000 | 999,720,000 |
| 3 | $50M | $2.5M | 1,075,000 | 375,000 | 750,000 | -700,000 | 999,020,000 |
| 4 | $120M | $6M | 2,580,000 | 900,000 | 1,800,000 | -1,680,000 | 997,340,000 |
| 5 | $250M | $12.5M | 5,375,000 | 1,875,000 | 3,750,000 | -3,500,000 | 993,840,000 |

*Assumes P = $1.00 constant for illustration. Actual supply change is price-dependent.*

### 8.3 Deflationary Crossover Point

The deflationary crossover occurs when B_annual + R_annual > E_annual:

```
Crossover condition:
  (F_annual × r_burn + Y_net_annual × r_buyback) / P > D_validator_annual / P

  F_annual × r_burn + Y_net_annual × r_buyback > D_validator_annual

  F_annual × 0.02 + Y_net_annual × 0.15 > Y_net_annual × 0.30

  F_annual × 0.02 > Y_net_annual × 0.15

  F_annual / Y_net_annual > 7.5

This is satisfied when fee revenue is at least 7.5× net yield.
At 5% yield rate: F_annual / Y_net_annual = 1/0.05 = 20 > 7.5 ✓

Conclusion: The model is net deflationary at all yield rates ≤ 13.3%.
```

### 8.4 Price Sensitivity Analysis

Net annual GST removed (burn + buyback - emission) at various price points:

| GST Price | Fee Burn (GST) | Buyback Burn (GST) | Validator Emission (GST) | Net Removed (GST) | Net Removed (%) |
|---|---|---|---|---|---|
| $0.01 | 32,250,000 | 11,250,000 | 22,500,000 | 21,000,000 | 2.10% |
| $0.10 | 3,225,000 | 1,125,000 | 2,250,000 | 2,100,000 | 0.21% |
| $1.00 | 322,500 | 112,500 | 225,000 | 210,000 | 0.021% |
| $10.00 | 32,250 | 11,250 | 22,500 | 21,000 | 0.0021% |

*Base case Year 2 parameters. Higher price = lower GST volume removed, but higher USD value.*

---

## 9. Governance Parameter Bounds

### 9.1 Adjustable Parameters

All parameters below are governance-adjustable within constitutional bounds:

| Parameter | Default | Min | Max | Amendment Type |
|---|---|---|---|---|
| Base burn rate (r_base) | 2.0% | 0.5% | 5.0% | Standard |
| Congestion sensitivity (κ) | 0.10 | 0.05 | 0.20 | Standard |
| Buyback ratio (r_buyback) | 15% | 5% | 30% | Standard |
| Reserve ratio (ρ_reserve) | 20% | 15% | 40% | Constitutional |
| Stable asset minimum | 65% | 50% | 100% | Constitutional |
| Volatile yield maximum | 35% | 0% | 50% | Constitutional |
| Risk cap | 7200 bps | 3000 bps | 9000 bps | Standard |
| Distribution split (reserve) | 20% | 10% | 40% | Standard |
| Distribution split (validator) | 30% | 15% | 50% | Standard |
| Distribution split (ecosystem) | 30% | 10% | 50% | Standard |
| Distribution split (incentives) | 20% | 5% | 40% | Standard |
| Validator minimum score | 0.60 | 0.40 | 0.80 | Standard |
| Minimum stake | 100,000 GST | 10,000 GST | 1,000,000 GST | Standard |
| Unbonding period | 21 days | 7 days | 90 days | Standard |

### 9.2 Constitutional Constraints (Non-Adjustable)

The following cannot be changed by any governance vote:

```
1. Routing law: L3 → L2 → L1 (no bypass)
2. Emergency mode: freeze-only (no withdrawals)
3. EOA authority: no EOA holds unilateral treasury authority
4. Canonical path: all mutations traverse canonical execution path
5. AI execution: AI cannot execute treasury actions autonomously
```

---

## 10. Economic Security Analysis

### 10.1 Governance Attack Cost

```
Cost to capture governance (51% attack):
  Required voting weight: 51% of total voting supply
  
  If voting supply = 30% of circulating supply (typical participation):
    Required GST = 0.51 × 0.30 × S(t) = 0.153 × S(t)
  
  At S(t) = 1,000,000,000 GST, P = $1.00:
    Attack cost = 0.153 × 1,000,000,000 × $1.00 = $153,000,000

  Constitutional protection: even at 51% capture, constitutional invariants
  cannot be overridden. Supermajority (66%) required for constitutional changes.
  
  Supermajority attack cost:
    Required GST = 0.66 × 0.30 × S(t) = 0.198 × S(t)
    Attack cost = $198,000,000 at P = $1.00
```

### 10.2 Treasury Attack Surface

```
Treasury attack vectors and mitigations:

1. Direct theft:
   Mitigation: TreasuryVault only callable by TreasuryController
   Residual risk: TreasuryController smart contract vulnerability

2. Governance capture + treasury drain:
   Mitigation: Reserve floor invariant (I₁), epoch budget cap (I₂)
   Maximum extractable per epoch: EPOCH_BUDGET_CAP
   Emergency freeze: triggered if reserve floor breached

3. AI manipulation:
   Mitigation: AI is advisory-only (invariant G₄)
   AI cannot execute treasury actions
   All AI proposals require governance ratification

4. Bridge exploit:
   Mitigation: Routing law (R₁, R₂) prevents L3→L1 bypass
   Bridge transactions monitored by GhostSentinel
   Constitutional routing enforcement at contract level
```

### 10.3 Validator Attack Surface

```
Validator attack vectors and mitigations:

1. Double signing:
   Detection: GhostSentinel (< 500ms)
   Consequence: 100% slash
   Constitutional enforcement: automatic + governance confirmation

2. Cartel formation:
   Mitigation: Multi-region quorum (no region > 40% stake)
   Log-normalized stake weight (diminishing returns)
   GhostSentinel coordination detection

3. Long-range attack:
   Mitigation: Cascading finality protocol
   Constitutional finality anchor on L1
   Evidence-backed dispute resolution

4. Validator bribery:
   Mitigation: Constitutional slashing for governance attacks
   Evidence collection by GhostSentinel
   100% slash for governance attack conviction
```

---

## 11. Equilibrium Analysis

### 11.1 Gas Equilibrium

```
Equilibrium condition:
  gas_target* = argmin E[|actual_demand - gas_target|]

  subject to:
    gas_target_min ≤ gas_target ≤ gas_target_max
    |gas_target(t+1) - gas_target(t)| ≤ max_adjustment_rate

AI Gas Equilibrium Engine converges to gas_target* within:
  - 3 epochs under normal conditions
  - 7 epochs under high volatility conditions
  - Bounded by constitutional gas target limits
```

### 11.2 Validator Equilibrium

```
Equilibrium condition:
  ∀v: stake_v* = argmax R_v(stake_v) - opportunity_cost(stake_v)

  At equilibrium:
    marginal_reward(stake_v*) = opportunity_cost_rate

  This implies:
    D_validator(e) / (Σᵥ score_v × stake_v) = opportunity_cost_rate

  Equilibrium validator count:
    n* = D_validator_annual / (opportunity_cost_rate × S_min)
```

### 11.3 Treasury Equilibrium

```
Long-run treasury equilibrium:
  T* = T_intake_annual / (r_distribution + r_burn_treasury)

  where:
    r_distribution = fraction of treasury distributed annually
    r_burn_treasury = fraction burned via buyback annually

  At base case:
    T_intake_annual = $15,000,000
    r_distribution = 0.05 (5% of treasury distributed annually)
    r_burn_treasury = 0.01 (1% of treasury burned via buyback)

    T* = $15,000,000 / (0.05 + 0.01) = $250,000,000

  Long-run equilibrium treasury: ~$250M at base case parameters.
```

---

## 12. Summary

### 12.1 Key Economic Properties

| Property | Value | Mechanism |
|---|---|---|
| Genesis supply | 1,000,000,000 GST | Fixed at deployment |
| Net supply trend | Deflationary | Burn + buyback > emission |
| Deflationary crossover | Year 1 (base case) | Fee burn dominates |
| Long-run treasury | ~$250M (base case) | Equilibrium model |
| Validator APY | 2–9% (base case) | Yield distribution |
| Governance attack cost | $153M–$198M | Voting weight model |
| Reserve floor | 20% of treasury | Constitutional invariant |
| Emergency protection | Freeze-only | Constitutional invariant |

### 12.2 Model Assumptions Summary

| Assumption | Value | Adjustable |
|---|---|---|
| Base burn rate | 2% | Yes (0.5–5%) |
| Buyback ratio | 15% | Yes (5–30%) |
| Reserve ratio | 20% | Yes (15–40%, constitutional) |
| Distribution split | 20/30/30/20 | Yes (within bounds) |
| Yield rate (external) | 5% avg | Market-determined |
| Validator count | 25–100 | Governance-determined |
| Minimum stake | 100,000 GST | Yes (10K–1M) |

### 12.3 Constitutional Economic Invariants

```
The following economic invariants are constitutionally enforced
and cannot be modified by any governance vote:

1. treasury_balance ≥ RESERVE_FLOOR (always)
2. epoch_spending ≤ EPOCH_BUDGET_CAP
3. emergency_mode = freeze_only (no withdrawals)
4. no_EOA holds unilateral_treasury_authority
5. all_buyback_proceeds are burned (no recycling)
6. routing_law: L3 → L2 → L1 (no bypass)
```

---

*GhostStack GST Tokenomics Mathematical Model v1.0*  
*Ghost Sovereign Token — Constitutional Economic Instrument*  
*Autonomy Secured.*
