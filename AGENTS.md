# GhostStack AI Agent Instructions

> **Read this file before touching any code in this repository.**
> It is the authoritative source of rules for all AI coding agents operating inside `/home/ghost/ghostl-stack`.

---

## 1. Routing Law — Non-Negotiable

```
GhostL3 (chain_id 903)  →  GhostL2 (chain_id 901)  →  GhostChain L1 (chain_id 14000101)
```

- **L3 never calls L1 directly.** Any cross-chain message from L3 must transit L2 first.
- **L2 never calls external chains directly.** All external settlement goes through GhostChain L1.
- **GhostChain L1 is the only chain that talks to the outside world.**
- This constraint is enforced at runtime via `packages/routing-guard/` and `packages/routing-law/`.  Do not bypass it.

---

## 2. Chain Identity

| Layer | Chain ID    | RPC Port | Type                    |
|-------|-------------|----------|-------------------------|
| L1    | `14000101`  | `18545`  | Cosmos SDK + EVM        |
| L2    | `901`       | `29547`  | OP Stack (op-geth)      |
| L3    | `903`       | `39545`  | OP Stack (app-specific) |

- **Gas token everywhere:** `GST` only; no alternate gas-token branding or wrapped legacy gas assets
- **Explorer:** GhostScan (never the external block explorer)
- **Wallet:** GhostWallet only
- **DNS:** GNS — Ghost Name System
- **DEX:** GhostXchange (never Uniswap / SushiSwap)
- Treat `29547` as the canonical direct GhostL2 host RPC. `29545` may still exist in a few compatibility forwarding paths, but new configs and health checks must not use it as the direct L2 default.

---

## 3. Canonical Bridge Addresses

| Contract              | Address                                      |
|-----------------------|----------------------------------------------|
| L2L3Bridge            | `0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2` |
| L1 Rollup (L2)        | `0xad32D5C2Da9f4159C4cc98686C005852b3905355` |
| L2 Rollup (L3)        | `0x130A46b6E41DB6E1e18fb9c759F223c459190e90` |
| Finality Oracle L1    | `0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422` |
| Finality Oracle L2    | `0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A` |
| Finality Oracle L3    | `0x87F850cbC2cFfac086F20d0d7307E12d06fA2127` |

Never hardcode different addresses without a governance-proposal simulation first.

---

## 4. Repository Layout (Key Paths)

```
ghostl-stack/
├── contracts/src/           # Solidity 0.8.24 sources
│   ├── ghost/GhostBrand.sol        # Inherit for GST_UNIT, CANONICAL_GST, chain IDs
│   ├── constitution/GhostConstitution.sol
│   ├── treasury/SovereignTreasuryEngine.sol
│   └── governance/GhostChainGovernor.sol
├── packages/
│   ├── ghost-sdk-core/      # Preferred SDK for new code (no ethers dep)
│   ├── ghost-sdk/           # ethers v6 wrapper (existing consumer path)
│   ├── routing-guard/       # On-chain routing enforcement
│   └── brand-enforcer/      # 15-layer branding audit
├── services/                # 80+ Node/TypeScript microservices
├── apps/api/                # Express 5 BFF
├── apps/web/                # Next.js 16 frontend
├── infra/hypervisor/supervisor/   # GAIS — autonomous VM + container management
├── infrastructure/supervisor/     # Python infra supervisor daemon
├── ai-orchestrator/         # Global AI task router
├── autonomous-installer/    # Self-healing daemon + guardian
└── .github/copilot-instructions.md  # Full workspace rules (read before the below)
```

---

## 5. SDK Rules

- **New code** → use `ghost-sdk-core` (no ethers dependency).
- **Existing integrations** → `ghost-sdk` (ethers v6 wrapped) is acceptable.
- **Never** import `ethers` or the legacy `web3` npm package directly in application code.
- RPC namespace is `ghost_` — never `eth_`.

---

## 6. Solidity Conventions

- Compiler: `0.8.24`, optimizer enabled (runs=200), `via_ir=true`.
- Import OZ via the remapping: `@openzeppelin/contracts/...` → resolves to `contracts/lib/openzeppelin-contracts/` (GhostChain-rebranded v5.6.1).
- Inherit `GhostBrand.sol` for canonical constants (`GST_UNIT`, `CANONICAL_GST`, chain IDs).
- **Forge lint warnings are errors** — fix before committing:
  - `erc20-unchecked-transfer` → wrap with `require(...)`
  - `unsafe-typecast` → add overflow guard before narrowing casts
  - `unchecked-call` → capture `(bool ok,)` and `require(ok, ...)`

---

## 7. Governance Rules

- AI may **draft** proposals; humans must **ratify** them via governance quorum.
- Never autonomously modify consensus parameters, token supply logic, or bridge validator quorum.
- All advisory proposals go to the signing relay at `http://localhost:7910` — never executed inline.
- Run `npm run phase2:preflight` before any governance contract deployment.

---

## 8. Safety Invariants for Infrastructure Agents

- **VM_ALLOWLIST** and **CONTAINER_ALLOWLIST** control what may be auto-restarted. Empty list = no automatic action.
- Per-VM restart **cooldown** (120 s) and **circuit breaker** (4 restarts/hour) are enforced by `vm_manager.py`.
- **DRY_RUN mode** (`VM_MANAGER_DRY_RUN=1`): all write actions are logged but not executed — use in staging.
- Snapshots are created before every hard-restart or reboot when `VM_SNAPSHOT_ENABLED=1`.

---

## 9. Branding Audit

Run `npm run brand:full` before any release. It enforces 15 branding layers.

The audit **ignores** (do not try to fix these): `node_modules/`, `dist/`, `out/`, `contracts/lib/`, `contracts/test/constitutional/`.

---

## 10. Build Commands

```bash
# Contracts
cd contracts && forge build              # compile
cd contracts && forge test               # test (default profile)
npm --prefix contracts run formal:slither  # static analysis

# Root workspace
npm install                              # Node >=22.21.0 <23
npm run build                            # apps/api + apps/web
npm run lint                             # full eslint
npm run brand:full                       # branding audit (must exit 0)
npm run gst:leakage                      # check for non-GST token integrations
npm run test:foundry                     # forge tests

# Autonomous supervisor (Python)
pip install -r infra/hypervisor/supervisor/requirements.txt
python3 infra/hypervisor/supervisor/ghostais.py    # GAIS REST API :9100
python3 infra/hypervisor/supervisor/supervisor.py  # Prometheus exporter :9108
python3 infrastructure/supervisor/infrastructure_supervisor.py  # infra daemon
```

---

## 11. What Agents Must Never Do

| Action | Reason |
|--------|--------|
| Deploy to mainnet without a governance proposal | Breaks sovereignty model |
| Add external (non-GhostChain) / Arbitrum / Base chain references | Architecture violation |
| Use raw upstream wallet/RPC JavaScript libraries directly | Use `ghost-sdk-core` instead |
| Emit legacy upstream RPC namespaces | Must be `ghost_` |
| Reference alternate or wrapped gas-token branding | Must be GST |
| Bypass `routing-guard` checks | Routing law violation |
| Use `shell=True` in Python subprocess calls | Command injection risk |
| Generate or guess external URLs | Security policy |
| Modify validator quorum without governance | Consensus integrity |
| Push to main without preflight passing | CI requirement |

---

## 12. Contact Points (Service Ports)

| Service              | Port  |
|----------------------|-------|
| GhostChain L1 RPC    | 18545 |
| GhostL2 RPC          | 29547 |
| GhostL3 RPC          | 39545 |
| Cosmos LCD           | 1317  |
| CometBFT RPC         | 26657 |
| GhostBrain Core      | 7900  |
| GAIS REST API        | 9100  |
| Hypervisor metrics   | 9108  |
| Signing Relay        | 7910  |
| Compliance API       | 8090  |
| Prometheus           | 9090  |
| Grafana              | 3000  |

---

*Last updated: 2026-03-10. Source of truth: `.github/copilot-instructions.md`.*
