# GhostChain — Full Stack Architecture

_Last updated: 2026-03-10_

This document covers the complete GhostChain stack: chain topology, AI layer, autonomous systems, and the Liquidity Gravity Engine (LGE).

---

## Chain Topology

```
GhostChain L1  (chain_id=14000101, RPC :18545)   ← Cosmos SDK + CometBFT + EVM
  └── GhostL2  (chain_id=901,       RPC :29545)   ← OP Stack (op-geth / op-node / batcher)
        └── GhostL3 (chain_id=903,   RPC :39545)  ← OP Stack, app-specific execution
```

**Routing law (non-negotiable):** L3 settles to L2 only. L2 settles to L1 only. L1 is the only layer with external settlement authority. Enforced at runtime by `packages/routing-guard/` and `packages/routing-law/`.

**Gas token everywhere:** `GST` — never ETH, Ether, WETH, or any non-GST token.

---

## Canonical Bridge Addresses

| Contract | Address |
|---|---|
| L2L3Bridge | `0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2` |
| L1 Rollup (L2) | `0xad32D5C2Da9f4159C4cc98686C005852b3905355` |
| L2 Rollup (L3) | `0x130A46b6E41DB6E1e18fb9c759F223c459190e90` |
| Finality Oracle L1 | `0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422` |
| Finality Oracle L2 | `0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A` |
| Finality Oracle L3 | `0x87F850cbC2cFfac086F20d0d7307E12d06fA2127` |

---

## AI Layer

### GhostBrain Core (`ghost-brain-core/`, port 7900)

The GhostBrain OS — the central AI runtime powering all autonomous decisions.

**Sub-systems:**
- `runtime/` — task kernel, scheduler (`TaskScheduler`), priority queue (`KernelPriority`)
- `supervisor/brain/` — `SupervisorCore`: heartbeat loop, health check, watchdog
- `swarm/coordination/` — `SwarmController`: multi-agent coordination
- `integration/` — `GhostL2Runtime`, `GhostL3InferenceGateway`, `AIEventLogger`
- `security/encryption/` — `KeyManager` (Vault HKDF key derivation), `MemoryEncryption` (AES-256-XTS chiplet interface)
- `evolution/verification/` — `SecurityAudit`: static analysis for forbidden patterns

### Global AI Orchestrator (`ai-orchestrator/`)

Unified task lifecycle: receives tasks from all AI agents, applies `PolicyGuard`, routes via `TaskRouter`, schedules via `TaskScheduler`.

**Agents:**
- `economic_agent.ts` — gas price monitor (L1/L2/L3), treasury drawdown, reward distributor
- `governance_agent.ts` — EVM + Cosmos proposal sync, L3→L1 routing bypass detection, SECURITY escalation
- `infrastructure_agent.ts` — node health sweeps (L1/L2/L3), GhostBrain integration
- `validator_agent.ts` — validator health, signing rate monitoring, slashing risk

**Safety invariants:**
- All tasks blocked by `PolicyGuard` (DENY/REQUIRE_HUMAN_APPROVAL) are never dispatched
- CRITICAL governance/security tasks escalate to the signing relay at `:7910` with `requires_human_review: true`
- No autonomous on-chain execution — all proposals require governance quorum ratification

### Python AI Swarm (`ai/swarm/`)

13-agent Python swarm for deep analysis and engineering tasks.

**Agents:** `blockchain_agent`, `economic_agent`, `engineering_agent`, `governance_agent`, `infrastructure_agent`, `security_agent` + 7 base/registry/bus modules.

**Communication:** `SwarmBus` (async message passing), `AgentRegistry` (discovery + health).

### Engineering Agent (`ai/engineering-agent/`)

Autonomous code analysis and patch generation:
- `repo_scanner.py` — scans for deprecated APIs, branding violations, lint issues
- `code_analyzer.py` — AST analysis for Solidity and TypeScript
- `patch_generator.py` — generates governance-safe patches
- `test_engine.py` — runs forge + tsc test suites before proposing patches
- `deployment_manager.py` — advisory deployment sequencing

---

## Autonomous Infrastructure

### GAIS — GhostChain AI Infrastructure Supervisor (`infra/hypervisor/supervisor/`)

REST API on `:9100`. Prometheus exporter on `:9108`.

- `ghostais.py` — GAIS REST API, health probe, VM + container management endpoints
- `vm_manager.py` — VM lifecycle (restart/reboot/snapshot); cooldown 120s, circuit-breaker 4/hr
- `node_healer.py` — automated node recovery with dry-run mode
- `validator_rebalancer.py` — advisory validator rebalance proposals → signing relay
- `auto_scaler.py` — capacity scaling proposals (never autonomous execution)

**Safety:** `VM_ALLOWLIST` and `CONTAINER_ALLOWLIST` control what may be auto-restarted. `DRY_RUN=1` logs all writes without executing.

### Infrastructure Supervisor (`infrastructure/supervisor/`)

Python daemon managing containerized services:
- `container_manager.py` — Docker container lifecycle
- `health_monitor.py` — HTTP/TCP health probing for all services
- `load_balancer.py` — weighted load distribution across node replicas
- `scaling_engine.py` — horizontal scaling proposals
- `vm_manager.py` — VM-level management (delegates to GAIS)

### Autonomous Installer (`autonomous-installer/`)

Self-healing installation and upgrade automation:
- `daemon/ghoststack_guardian.sh` — watchdog that restarts failed services
- `installer/install_stack.sh` — idempotent full-stack installer
- `monitoring/health_monitor.sh` + `metrics_collector.sh` — Prometheus scrape helpers
- `repair/auto_repair.sh` + `container_repair.sh` — container-level repair
- `scaling/autoscale_nodes.sh` + `validator_rebalance.sh` — scaling ops
- `upgrades/upgrade_services.sh` + `rollback_services.sh` — rolling upgrades

---

## Liquidity Gravity Engine (LGE)

### Goals

- **Canonical ledger on L1:** GhostChain L1 is the only canonical accounting surface.
- **Governance-locked deployments:** No external capital deployment without on-chain governance approval (caps, policies, timelocks).
- **No settlement → no continuation:** If settlement is overdue, further deployment is blocked by on-chain rules.
- **Autonomous, but bounded:** Off-chain agents propose actions only within on-chain invariants and policy limits.
- **Auditability:** Every deploy/unwind/settlement is recorded on-chain and mirrored to an append-only audit log.

### On-chain (GhostChain L1) — `contracts/src/liquidity/`

- **`LoadBalancerVault`** — accepts GST deposits, mints vault shares, enforces per-adapter and global caps, requires `SettlementOracle.requireCanContinue()` before new deploys.
- **`AdapterRegistry`** — governance registry for approved adapters (`externalChainId`, `riskTier`, `maxDeployCap`, `settlementInterval`).
- **`SettlementOracle`** — verifies ECDSA or ZK settlement proofs, enforces settlement windows, routes yield into `RewardRouter`.
- **`RewardRouter`** — governance-configured reinjection splits (BPS): POL, buyback+burn, validator rewards. Timelocked split changes.
- **`CircuitBreaker`** — global and per-adapter pause controls + rate-limit windows.
- **`OperatorBondVault`** — operator bond custody; `SettlementOracle` can record penalties.
- **`BridgeEscrow`** — routes principal via `StandardBridge` when bridge custody mode is enabled.

### Off-chain — `services/liquidity-router/`

- **Strategy Engine** — produces deploy proposals within on-chain policy bounds.
- **Risk Engine** — computes risk score; can only reduce action envelope, never expand.
- **Execution Manager** — submits `LoadBalancerVault` calls via signing relay.
- **Settlement Manager** — submits settlement proofs on schedule.

---

## Governance

### On-chain

- **`GhostChainGovernor`** (`contracts/src/governance/`) — custom governor; not OZ Governor.
- **`GhostConstitution`** (`contracts/src/constitution/`) — governance-locked clause amendments, immutable + amendable, ZK verifier integration.
- **`ProposalManager`** (`governance-ai/contracts/`) — entry-point for proposal submission, GST deposit escrow.
- **`VoteSystem`** (`governance-ai/contracts/`) — GST-weighted voting, delegation, finalisation.

### AI Governance Plane

- AI may **draft** proposals; humans must **ratify** via governance quorum.
- All CRITICAL/SECURITY actions → signing relay at `:7910` with `requires_human_review: true`.
- `governance-event-bridge/` — polls L1/L2 governor events → GhostBrain signals.
- `hyper-ghost-governor/` — advanced proposal routing with cross-layer fan-out.

---

## Economic Systems

### GST Tokenomics

- Native gas token on L1/L2/L3 — `GST` everywhere.
- `SovereignTreasuryEngine` (`contracts/src/treasury/`) — primary treasury logic.
- `RewardDistributor` (`contracts/src/econ/`) — epoch-based GST distribution to stakers/validators.
- Treasury Engine service (`:7683`), Reward Distributor (`:7684`), L2 Revenue Aggregator (`:7682`), L3 Fee Collector (`:7681`).

### Economic AI (`economic-ai/`)

TypeScript AI layer for economic optimization:
- `gas/gas_optimizer.ts` — dynamic gas price optimization across L1/L2/L3
- `demand/demand_analyzer.ts` — GST demand forecasting
- `supply/supply_controller.ts` + `burn_manager.ts` — supply management
- `treasury/treasury_ai.ts` + `revenue_tracker.ts` — treasury AI and revenue tracking

---

## Identity

### GID — Ghost Identity (`gid/`)

Wallet-based authentication using EVM ECDSA challenge-response.

- `auth/auth_gateway.ts` — challenge/response (EVM personal_sign scheme), rate-limited, in-memory sessions.
- Sessions forwarded to GhostBrain Core (`:7900`) for identity graph correlation.
- GNS (Ghost Name System) integration for human-readable addresses.

---

## Interchain Bridge

### GhostBridge (`interchain-bridge/`)

GhostChain-native bridge for cross-layer asset movement:

- `contracts/GhostBridge.sol` — on-chain bridge with validator quorum (`uint8 quorumThreshold`), ECDSA validator set, finality oracle integration.
- `contracts/AssetLocker.sol` — GST custody on source chain.
- `contracts/WrappedGhostAsset.sol` — wrapped representation on destination layer.
- `relayer/bridge_relayer.ts` — off-chain message relay.
- `oracle/state_oracle.ts` — cross-layer state attestation.
- `security/fraud_detector.ts` — double-spend and replay detection.
- `monitoring/bridge_monitor.ts` — health monitoring.

---

## Validator Layer

### Validator AI (`validator-ai/`)

Autonomous validator monitoring and optimization:
- `monitor/validator_monitor.ts` + `block_analyzer.ts` — real-time health and block analysis
- `prediction/fork_predictor.ts` + `latency_predictor.ts` — predictive health scoring
- `security/anomaly_detector.ts` + `attack_detector.ts` — consensus attack detection
- `balancing/validator_balancer.ts` + `stake_optimizer.ts` — advisory stake rebalancing

---

## Service Port Reference

| Service | Port |
|---|---|
| GhostChain L1 RPC | 18545 |
| GhostL2 RPC | 29545 |
| GhostL3 RPC | 39545 |
| Cosmos LCD | 1317 |
| CometBFT RPC | 26657 |
| GhostBrain Core | 7900 |
| Signing Relay | 7910 |
| GAIS REST API | 9100 |
| GAIS Prometheus | 9108 |
| L3 Fee Collector | 7681 |
| L2 Revenue Aggregator | 7682 |
| Treasury Engine | 7683 |
| Reward Distributor | 7684 |
| Compliance API | 8090 |

---

## Key Source Paths

| Path | Contents |
|---|---|
| `contracts/src/ghost/GhostBrand.sol` | `GST_UNIT`, `CANONICAL_GST`, canonical chain IDs |
| `contracts/src/governance/GhostChainGovernor.sol` | Custom governor |
| `contracts/src/treasury/SovereignTreasuryEngine.sol` | Primary treasury |
| `contracts/src/constitution/GhostConstitution.sol` | On-chain law |
| `ghost-brain-core/` | GhostBrain OS runtime |
| `ai-orchestrator/` | Global AI task orchestrator |
| `ai/swarm/` | Python multi-agent swarm |
| `ai/engineering-agent/` | Code analysis + patch agent |
| `infra/hypervisor/supervisor/` | GAIS (VM + container manager) |
| `infrastructure/supervisor/` | Python infra daemon |
| `autonomous-installer/` | Self-healing installer |
| `economic-ai/` | Economic optimization AI |
| `governance-ai/` | Governance AI + Solidity contracts |
| `interchain-bridge/` | GhostBridge contracts + relayer |
| `validator-ai/` | Validator monitoring AI |
| `gid/` | Ghost Identity (GID) |
| `packages/routing-guard/` | On-chain routing enforcement |
| `packages/ghost-sdk-core/` | Native SDK (no ethers) |

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


---

## GhostBrain Autonomous Infrastructure OS (GBA-OS)

> Added Phase 17 — 2026-03-10

GBA-OS turns `services/ghostbrain-core` (port 7900) into a self-managing distributed OS for blockchain infrastructure. It runs a 30-second control loop and exposes 16 REST API endpoints.

### Layers

```
ghostbrain-core (port 7900)
├── kernel/
│   ├── brain.ts          — 10-step 30s control loop
│   └── event_loop.ts     — typed async event bus (7 event types)
├── cluster/
│   ├── cluster_node.ts   — peer registry (90s staleness)
│   ├── cluster_gossip.ts — AI insight fan-out to peers
│   ├── cluster_sync.ts   — push stats → Memory Service + Cluster
│   └── leader_election.ts — 5s cached leader query
├── orchestration/        — load balancer, resource scheduler, memory balancer
├── protection/           — threshold monitor, crash predictor, stability guard, auto-recovery
├── observability/        — Prometheus exporter, alert engine, event logger
└── predictive/
    ├── load_forecaster.ts      — EWMA + OLS linear regression (30/60/120s horizons)
    ├── anomaly_detector.ts     — rolling z-score (N=60), auto-resolving (120s)
    ├── pattern_recognition.ts  — autocorrelation + time-of-day + Pearson correlation
    ├── predictive_balancer.ts  — scored MigrationRecommendations
    └── failure_predictor.ts    — composite risk (50% trend + 30% anomaly + 20% pattern)
```

### API Endpoints

| Group | Endpoints |
|---|---|
| Kernel | `GET /api/v1/kernel/status`, `GET /api/v1/kernel/events` |
| Orchestrator | `GET /api/v1/orchestrator/status`, `GET /api/v1/orchestrator/targets` |
| Protection | `GET /api/v1/protection/predictions`, `/stability`, `/thresholds` |
| Observability | `GET /metrics`, `GET /api/v1/observability/alerts`, `/push-stats`, `/log-stats` |
| Predictive | `GET /api/v1/predictive/forecasts`, `/anomalies`, `/patterns`, `/failures`, `/recommendations` |

### Governance Boundary

GBA-OS operates within the existing GhostChain governance model:
- The brain tick may **propose** recovery actions and **enqueue** jobs.
- Recovery jobs execute only within pre-approved `JobType` bounds.
- Cluster gossip propagates AI insights — it does not alter on-chain state.
- The failure predictor surfaces risk signals; humans or governance must ratify any resulting on-chain changes (e.g., validator set modifications, adapter pauses).
