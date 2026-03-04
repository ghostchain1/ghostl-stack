# GST Sovereign Identity Specification (GhostStack)

## Status
- **Version:** 1.0
- **Date:** 2026-03-04
- Scope: GhostChain (L1), GhostL2, GhostL3, all services, nodes, UIs, explorers, monitoring
- Exception: Bridges MAY reference external chain assets/tokens and their native units (e.g., ETH on Ethereum)

---

## 1. Canonical Identity

### 1.1 Native Currency (All GhostStack Chains)
| Field    | Value  |
|----------|--------|
| Name     | Ghost  |
| Symbol   | GST    |
| Decimals | 18     |

### 1.2 Chain Names
| Layer | Canonical Name |
|-------|----------------|
| L1    | GhostChain     |
| L2    | GhostL2        |
| L3    | GhostL3        |

### 1.3 Branding Rule
All internal surfaces MUST display Ghost/GST:
- Node logs, metrics, dashboards
- JSON-RPC responses and UI formatting
- Explorer display and labels
- Contracts (NatSpec, events, revert strings, docs)
- Tests and scripts

Bridges are allowed to mention foreign symbols/names ONLY where interoperability requires it.

---

## 2. Execution Layer Requirements

### 2.1 Protocol Currency Semantics
- Base unit: 10⁻¹⁸ GST (conceptually equivalent to "wei" for EVM compatibility — but NEVER labeled "wei" in user-facing surfaces).
- The label "ETH", "Ether", or "Gwei" MUST NOT be used in any internal user-facing surface.

### 2.2 JSON-RPC + UI Display
| Surface      | Required Label           |
|-------------|--------------------------|
| Balances    | GST                      |
| Fees        | GST                      |
| Gas price   | GST per gas unit         |
| Token name  | Ghost                    |
| Token symbol| GST                      |

---

## 3. Contract Layer Requirements

### 3.1 Forbidden Terms (Outside Bridges)
The following MUST NOT appear in:
- `/contracts/src` (except allowed bridge directories)
- `services/`, `apps/`, `infra/` configs, dashboards, docs

| Forbidden term       | Why |
|---------------------|-----|
| `ETH`               | Foreign currency symbol |
| `Ether` / `Ethereum`| Foreign chain/currency |
| `Gwei`              | Foreign denomination |
| `N ether` (literal) | Use `GST_UNIT` (1e18) instead |
| `"Insufficient ETH"`| User-facing string violation |
| `"Not enough ETH"`  | User-facing string violation |

### 3.2 Required Branding
Core contracts MUST anchor:
- `"GhostChain"` where chain naming appears
- `"Ghost"` and `"GST"` for token naming/symbol
- `decimals = 18` if declared

### 3.3 Unit Convention
```solidity
// ❌ Banned
require(msg.value >= 1 ether, "Insufficient ETH");

// ✅ Correct — GhostBrand.sol provides GST_UNIT = 1e18
import "./GhostBrand.sol";
require(msg.value >= GST_UNIT, "Insufficient GST");
```

---

## 4. Node & Service Branding

### 4.1 Node Names (Recommended)
```
ghostchain-validator-XX
ghostchain-rpc-XX
ghostl2-sequencer-XX
ghostl2-batcher-XX
ghostl3-sequencer-XX
ghostl3-batcher-XX
```

### 4.2 Metrics Labels (Prometheus/Grafana)
| Label             | Description                    |
|-------------------|--------------------------------|
| `gas_fee_gst`     | Gas fees collected in GST      |
| `revenue_gst`     | Protocol revenue in GST        |
| `burn_gst`        | Tokens burned in GST           |
| `validator_rewards_gst` | Validator rewards in GST |

---

## 5. Bridge Exception Policy

### 5.1 Allowlist Directories
Only these directories may contain external branding:

```
contracts/bridge/
contracts/bridges/
contracts/src/bridge/
services/bridge/
infra/opstack/bridge/
apps/bridge/
```

### 5.2 External Naming Constraints
Bridges MAY show:
- `"ETH on Ethereum"`
- `"USDC on <external chain>"`

Bridges MUST still show on the GhostStack side:
- `"GST on GhostChain"`

### 5.3 Routing Law (Enforced)
L3 → L2 → L1 only. No direct L3 → L1 bypass.

---

## 6. Compliance & Enforcement

### 6.1 CI Gate (`scripts/gst-symbol-gate.sh`)
Runs on every PR. Fails on:
- Forbidden patterns outside bridges
- Missing required branding anchors
- `"symbol": "ETH"` in JSON config files

### 6.2 Branding Audit (`scripts/brand-audit.sh`)
Full filesystem scan. Run manually or in release pipeline.

### 6.3 On-Chain Enforcement (`GhostIdentityConstitution.sol`)
Constitutional contract that:
- Hardcodes `Ghost / GST / 18` as the canonical identity
- Produces a canonical `IDENTITY_HASH` for off-chain verification
- Gates privileged system contract registration to governor

### 6.4 Release Gate
A release candidate MUST include:
- [ ] Successful `brand-audit.sh` run
- [ ] Explorer showing GST symbol
- [ ] Wallet UI showing Ghost/GST
- [ ] Nodes emitting `_gst`-labeled metrics
- [ ] `GhostIdentityConstitution` deployed and `IDENTITY_HASH` pinned in release notes
