# GhostStack — AI Agent Workspace Instructions

> **GhostChain is a fully custom blockchain.** Ghost L2 and Ghost L3 **only transact with GhostChain (L1)**. GhostChain handles all external interactions. Never introduce Ethereum mainnet, Arbitrum, Base, or any non-Ghost chain dependency.

---

## Architecture Overview

```
GhostChain L1 (chain_id=14000101, RPC :18545)
  └── GhostL2   (chain_id=901,       RPC :29545)  — OP Stack, anchored to L1 via L1GhostPortal
        └── GhostL3 (chain_id=903,   RPC :39545)  — OP Stack, anchored to L2
```

- **GhostChain L1** — Cosmos SDK sovereign chain (`ghostchaind`), CometBFT consensus, EVM execution, governance-locked, GST gas token, treasury + slashing
- **GhostL2** — OP Stack (op-geth / op-node / op-batcher), settlement to L1
- **GhostL3** — OP Stack, app-specific execution, settlement to L2
- **AI Layer** — GhostBrain Core (port 7900): transaction classification, risk scoring, fraud detection, autonomous proposals (human-ratified)
- **Liquidity Gravity Engine (LGE)** — governance-locked on-chain: LoadBalancerVault, AdapterRegistry, SettlementOracle, CircuitBreaker, BridgeEscrow
- **GNS** — Ghost Name System (replaces ENS)
- **GhostXchange** — DEX (replaces generic AMM/Uniswap references)

### Canonical Bridge Addresses
| Contract | Address |
|---|---|
| L2L3Bridge | `0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2` |
| L1 Rollup (L2) | `0xad32D5C2Da9f4159C4cc98686C005852b3905355` |
| L2 Rollup (L3) | `0x130A46b6E41DB6E1e18fb9c759F223c459190e90` |
| Finality Oracle L1 | `0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422` |
| Finality Oracle L2 | `0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A` |
| Finality Oracle L3 | `0x87F850cbC2cFfac086F20d0d7307E12d06fA2127` |

---

## Build & Test Commands

### Contracts (Solidity 0.8.24, Foundry + Hardhat)

```bash
# Forge — primary development loop
cd contracts
forge build                          # compile all (via_ir=true, optimizer runs=200)
forge build --skip test              # skip test files
forge lint                           # lint warnings (erc20-unchecked-transfer, unsafe-typecast, etc.)
forge test                           # default profile
FOUNDRY_PROFILE=gns forge test       # GNS contracts only
FOUNDRY_PROFILE=ai forge test        # AI/GhostBrain layer
FOUNDRY_PROFILE=exchange forge test  # GhostX AMM
FOUNDRY_PROFILE=legacy forge test    # evm_version=paris, via_ir=false (L1 pre-Shanghai)
forge test --gas-report              # gas reporting

# Hardhat — secondary (needed for typechain, deploy scripts)
npm --prefix contracts run build          # hardhat compile
npm --prefix contracts run compile:docker # docker solc (4GB heap, via_ir=true)
npm --prefix contracts run test:sovereign # foundry sovereign treasury/federation/solvency tests
npm --prefix contracts run gas:sovereign  # gas report SovereignTreasuryEngine
npm --prefix contracts run formal:slither # slither audit
npm --prefix contracts run formal:echidna # echidna invariant fuzzing
```

### Root Workspace

```bash
# Install (Node >=22.21.0 <23 enforced, npm 10.9.4)
npm install

# Build
npm run build            # apps/api + apps/web
npm run build:services   # sequential service builds (avoids resource contention)

# Lint & Brand
npm run lint             # eslint across apps + packages
npm run brand:full       # MANDATORY before release — 15-layer branding audit (must exit 0)

# Tests
npm run test:foundry     # forge test (default profile)
npm run test:sovereign   # forge sovereign tests

# Compliance
npm run deprecations:check  # scan deprecated API usage
npm run gst:leakage         # verify no non-GST external token integration (fail-closed)
npm run gst:symbol          # verify GST symbol consistency
npm run verify:routing      # validate routing-law guards

# Preflight
npm run phase2:preflight    # deprecations + hardhat build smoke test (run before governance deploy)
npm run preflight:opstack   # validate L2/L3 chain configs before node startup
npm run env:sync:opstack    # sync env from L1/L2 deployments
npm run env:sync:opstack:l3 # sync env from L2/L3 deployments
```

---

## Directory Structure

```
ghostl-stack/
├── .github/copilot-instructions.md  ← this file
├── contracts/                       # Solidity (0.8.24)
│   ├── foundry.toml                 # Profiles: default, legacy, gns, ai, exchange
│   ├── hardhat.config.ts            # chain enforcement, docker solc, formal verification
│   ├── src/
│   │   ├── l1/, l2/, l3/            # layer-specific contracts
│   │   ├── governance/, constitution/# GhostChainGovernor, GhostConstitution
│   │   ├── treasury/, econ/         # SovereignTreasuryEngine, RewardDistributor
│   │   ├── federation/, consensus-governance/
│   │   ├── ai/, ghost/, ghostx/, gns/
│   │   ├── bridge/, liquidity/, opstack/
│   │   └── compliance/, security/
│   ├── test/
│   │   ├── foundry/                 # forge unit + fuzz tests
│   │   └── invariants/              # echidna/forge invariant tests
│   └── lib/
│       └── openzeppelin-contracts/  # OZ v5.6.1, rebranded "GhostChain Contracts v5.6.1"
├── apps/
│   ├── api/                         # Express 5.2.1 BFF, SQLite auth, 60+ service routers
│   ├── web/                         # Next.js 16.1.6, App Router, L1/L2/L3 explorer proxies
│   └── worker/                      # BullMQ worker
├── services/                        # 80+ Node/TypeScript microservices
│   ├── ghostbrain-core/             # AI core (port 7900)
│   ├── governance-event-bridge/     # polls L1/L2 governor → ghostbrain signals
│   ├── ghost-rollup-proposer/
│   ├── hyper-ghost-governor/
│   ├── l3-fee-collector/            # port 7681
│   ├── l2-revenue-aggregator/       # port 7682
│   ├── treasury-engine/             # port 7683
│   └── reward-distributor/          # port 7684
├── packages/                        # 50+ shared libs
│   ├── ghost-sdk/                   # ethers v6 wrapped (primary consumer path)
│   ├── ghost-sdk-core/              # native, no-ethers (preferred for new code)
│   ├── routing-guard/, routing-law/ # on-chain + off-chain routing enforcement
│   └── brand-enforcer/              # 15-layer branding audit
├── chains/
│   ├── l2/rollup.json               # GhostL2 OP Stack config
│   └── l3/rollup.json               # GhostL3 OP Stack config
├── infra/
│   ├── opstack/                     # OP Stack node configs, Geth setup
│   ├── ghostchain/                  # Cosmos SDK sovereign chain (ghostchaind, CometBFT)
│   ├── kubernetes/, helm/, terraform/
│   └── vault/                       # HashiCorp Vault integration
├── tools/
│   ├── branding/                    # audit & enforce GhostChain branding (15-layer rules)
│   ├── governance/                  # proposal builders
│   └── sovereignty/                 # SED engine (scan/enforce/rewrite sovereignty rules)
├── docker-compose.yml               # canonical devnet
└── stack.env.example                # service URLs, chain IDs, ports — copy to .env
```

---

## Branding Rules (Mandatory — 15 Layers)

Always use GhostChain branding. The `npm run brand:full` audit enforces this at CI time.

| Concept | Use | Never Use |
|---|---|---|
| Gas token / native token | **GST** | ETH, Ether, WETH |
| Chain name | **GhostChain** | Ethereum, Mainnet |
| RPC namespace | **`ghost_`** | `eth_` |
| SDK | **`ghost-sdk`** or **`ghost-sdk-core`** | ethers.js, web3.js (directly) |
| Explorer | **GhostScan** | Etherscan |
| Wallet | **GhostWallet** | MetaMask |
| DNS | **GNS** | ENS |
| DEX | **GhostXchange** | Uniswap, SushiSwap |
| AI Engine | **GhostBrain** | OpenAI/ChatGPT directly |
| Package scope | **`@ghostchain/*`** | `@ethereum/*`, `@openzeppelin/*` |
| Contract lib header | **`// GhostChain Contracts v5.6.1 (path/File.sol)`** | `// OpenZeppelin Contracts` |

**Exemptions** (branding audit ignores): `node_modules/`, `dist/`, `out/`, `contracts/lib/`, `contracts/test/constitutional/`

---

## Solidity Conventions

### Compiler
- Version: `0.8.24` (all contracts)
- Optimizer: enabled, runs=200
- `via_ir: true` (default profile); `via_ir: false` + `evm_version=paris` (legacy profile, pre-Shanghai L1 compat)
- `remappings`: `@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/`

### Patterns
- Inherit **`GhostBrand.sol`** for `GST_UNIT` (1e18), `CANONICAL_GST` address, canonical chain IDs
- **`GhostConstitution.sol`** — governance-locked clause amendments (immutable + amendable, ZK verifier integration)
- Governance: **`GhostChainGovernor`** (custom) — not OpenZeppelin Governor
- Formal verification: Slither, Scribble, Echidna, Certora optional (controlled via `FORMAL_VERIFY=true`)

### Forge Lint — Fix Required (warning = must fix)
- `erc20-unchecked-transfer` → wrap `token.transfer(...)` / `token.transferFrom(...)` with `require(..., "msg")`
- `unsafe-typecast` → add `require(x <= type(uintN).max, "overflow")` before each narrowing cast
- `unchecked-call` → add `(bool ok,) = addr.call(...); require(ok, "msg");`

### Forge Lint — Notes (informational, fix opportunistically)
- `unwrapped-modifier-logic` → extract modifier body to `_internalFn()` to reduce bytecode size
- `screaming-snake-case-immutable` → rename immutables to `SCREAMING_SNAKE_CASE`
- `unaliased-plain-import` → use `import { Foo } from "...";` or `import "..." as X;`
- `asm-keccak256` → use inline assembly scratch-space hash for gas efficiency

---

## Service Port Reference

| Service | Port |
|---|---|
| GhostChain L1 RPC | 18545 |
| GhostL2 RPC | 29545 |
| GhostL3 RPC | 39545 |
| Cosmos LCD | 1317 |
| CometBFT RPC | 26657 |
| Cosmos gRPC | 9090 |
| GhostBrain Core | 7900 |
| L3 Fee Collector | 7681 |
| L2 Revenue Aggregator | 7682 |
| Treasury Engine | 7683 |
| Reward Distributor | 7684 |
| Sovereign Governor | 7685 |
| Compliance Service | 8090 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| PostgreSQL (GNS) | 5433 |
| Redis (gas engine) | 6380 |

---

## Environment Setup

```bash
# 1. Copy env
cp stack.env.example .env

# 2. Set required secrets (no defaults — service fails closed without these)
POSTGRES_PASSWORD=<set>
COMPLIANCE_JWT_SECRET=<set>

# 3. Start devnet
docker compose up -d

# 4. Cosmos sovereign chain (optional, separate)
# ghostchaind binary at /tmp/ghostchaind
# COSMOS_CHAIN_ID=ghostchain-1, moniker configurable
```

---

## Pitfalls & Common Mistakes

### Chain Identity
- **Never** deploy contracts targeting Ethereum mainnet or any chain other than L1 (14000101), L2 (901), or L3 (903). `hardhat.config.ts` enforces this and rejects other chain IDs.
- L2 and L3 **must not** call external chains directly — all cross-chain traffic routes through GhostChain L1.

### Node / Package Manager
- Node **>=22.21.0 <23** required. The preinstall hook enforces this — mismatched versions silently fail in complex ways.
- **npm** is canonical (10.9.4). pnpm workspace file exists but running pnpm will fail the preinstall check.

### SDK Usage
- New code should use **`ghost-sdk-core`** (no ethers dependency) when possible.
- **`ghost-sdk`** (ethers v6 wrapped) is the current primary path — `import ghost` resolves here.
- Do not use `ethers` or `web3.js` directly in application code.

### GST / Token Leakage
- `npm run gst:leakage` is fail-closed — it blocks non-GST external token integrations.
- Never integrate Chainlink price feeds directly; route through GhostBrain oracle layer.

### Docker / Build Resources
- Hardhat/solc in Docker requires `NODE_OPTIONS=--max_old_space_size=4096`
- Build services sequentially: `./scripts/build-services-sequential.sh` (parallel builds OOM)

### Governance
- AI may **write** proposals; humans must **ratify** them — no autonomous on-chain execution without governance quorum
- Run `npm run phase2:preflight` before any governance contract deployment

### OP Stack Preflight
- Always run `npm run preflight:opstack` before starting L2/L3 nodes
- Sync env after any L1/L2 deployment: `npm run env:sync:opstack`

### LGE / Settlement
- If `SettlementOracle` does not report "can continue", `LoadBalancerVault` pauses recursively — check oracle health first when debugging paused state
- Circuit breaker triggers alerts + watchdog remediation on missed settlement windows

### OpenZeppelin Library
- OZ v5.6.1 is installed at `contracts/lib/openzeppelin-contracts/` with GhostChain headers — do not replace with upstream OZ
- Import via `@openzeppelin/contracts/...` (remapping in `foundry.toml` resolves to the rebranded lib)

---

## Key Files for Agent Context

| File | Purpose |
|---|---|
| [contracts/foundry.toml](contracts/foundry.toml) | Forge profiles, remappings, fuzz config |
| [contracts/hardhat.config.ts](contracts/hardhat.config.ts) | Chain enforcement, solc settings, docker solc |
| [contracts/src/ghost/GhostBrand.sol](contracts/src/ghost/GhostBrand.sol) | Base contract with GST constants |
| [contracts/src/constitution/GhostConstitution.sol](contracts/src/constitution/GhostConstitution.sol) | Governance-locked on-chain law |
| [contracts/src/treasury/SovereignTreasuryEngine.sol](contracts/src/treasury/SovereignTreasuryEngine.sol) | Primary treasury logic |
| [contracts/src/governance/GhostChainGovernor.sol](contracts/src/governance/GhostChainGovernor.sol) | Custom governor |
| [packages/ghost-sdk-core/](packages/ghost-sdk-core/) | Native SDK (preferred for new code) |
| [packages/routing-guard/](packages/routing-guard/) | On-chain routing enforcement |
| [tools/branding/](tools/branding/) | 15-layer branding audit rules |
| [stack.env.example](stack.env.example) | All service env vars with descriptions |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | LGE architecture deep-dive |
| [docs/DEV_SETUP.md](docs/DEV_SETUP.md) | Full developer setup guide |
| [PLAN.md](PLAN.md) | Phase roadmap and migration checklist |
