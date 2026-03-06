# 👻 GhostL‑Stack

[![Contracts Cascading Finality (Fast)](https://github.com/ghostchain1/ghostl-stack/actions/workflows/contracts-cascading-fast.yml/badge.svg)](https://github.com/ghostchain1/ghostl-stack/actions/workflows/contracts-cascading-fast.yml)

**GhostL‑Stack** is the canonical monorepo for the **GhostChain Sovereign Blockchain System** — a production‑grade, AI‑native, multi‑layer blockchain architecture consisting of:

* **GhostChain (L1)** — main Autonomous Layer 1 blockchain (EVM‑compatible base chain)
* **GhostL2 (L2)** — OP‑Stack rollup anchored to GhostChain
* **GhostL3 (L3)** — OP‑Stack rollup anchored to GhostL2

This repository is designed to be **diff‑only evolvable**, **governance‑locked**, **AI‑assisted**, and **court / regulator‑ready**.

---

## 🌌 High‑Level Architecture

```
┌───────────────────────────────────────────┐
│                GhostChain L1              │
│  (EVM, GST Gas, Governance, Treasury)     │
└───────────────▲───────────────────────────┘
                │ OptimismPortal / Oracles
┌───────────────┴───────────────────────────┐
│                GhostL2 (OP Stack)         │
│  op-geth · op-node · batcher · proposer   │
└───────────────▲───────────────────────────┘
                │ L3 Output Oracle
┌───────────────┴───────────────────────────┐
│                GhostL3 (OP Stack)         │
│  App‑specific execution & scaling layer   │
└───────────────────────────────────────────┘

Supporting Layers:
- AI / Protocol Intelligence
- Governance & Treasury
- Compliance & Evidence
- Observability (Prometheus/Grafana)
```

---

## 📁 Repository Layout

```
/home/ghost/ghostl-stack
├── apps/                # User‑facing apps (Next.js, dashboards, explorers)
├── services/            # Backend microservices (AI, governance, treasury, relayers)
├── contracts/           # Solidity smart contracts (L1/L2/L3)
├── infra/               # Docker, OP‑Stack, scripts, env management
│   ├── opstack/
│   ├── docker/
│   ├── scripts/
│   └── monitoring/
├── packages/            # Shared SDKs, UI libs, config packages
├── docs/                # Architecture, governance, whitepapers, evidence
├── .codex/              # Codex automation inputs, logs, ratification blocks
├── docker-compose.yml   # Canonical devnet composition
└── README.md
```

---

## 🧰 Dev Setup

See `docs/DEV_SETUP.md` for prerequisites, bootstrap instructions, and local bring-up commands.

---

## ⛓️ Blockchain Layers

### GhostChain (L1)

* EVM‑compatible execution
* **Main Autonomous Layer 1 blockchain** (governance‑locked, AI‑assisted ops)
* **Canonical gas token:** GST (ERC‑20)
* Custom governance (no OpenZeppelin Governor)
* Treasury & slashing logic
* Compliance‑aware hooks

**Ghost Token (L1)**

* Contract: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
* Symbol: `GST` (ERC‑20, 18 decimals)
* Genesis mint: `1,000,000,000` GST to `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
* L2/L3 gas token: **GST** (L1 ERC‑20 address above)

**Key contracts:**

* `Governor.sol`
* `ProposalExecutor.sol`
* `FutureStack.sol`

---

### GhostL2 (OP Stack)

* Uses `op-geth`, `op-node`, `op-batcher` by default (`infra/opstack` keeps `op-proposer` disabled)
* Authoritative proposer runtime: `services-ghost-rollup-proposer-1`
* Anchored to GhostChain via OptimismPortal
* OutputOracle verified during preflight
* Uses GST as canonical gas

Ports (default devnet):

* L1 RPC: `18545`
* L2 RPC: `29547`

---

### GhostL3 (OP Stack)

* Anchored to GhostL2
* Independent execution domain
* App‑specific scaling & experimentation

Ports:

* L3 RPC: `39545`

---

## 🤖 AI & Protocol Intelligence

GhostL‑Stack is **AI‑native by design**:

* Transaction classification & risk scoring
* Fraud detection & explainability (SHAP)
* Gas optimization (Ghost Gas Engine)
* Self‑healing automation (governance‑approved)
* AI‑written proposals (human‑ratified)

AI services live under:

```
/services/ai-*
/services/protocol-intelligence
```

### AI Vault (Secrets Gateway)

`ai-vault` is the policy-enforcing, AI-assisted Vault gateway that monitors and controls secret access.

- Use `ai-vault-dev` for local/dev runs via `services/docker-compose.legacy.yml`
- Use `ai-vault` for hardened/production profiles
- Services root path: `/home/ghost/ghostl-stack/services`
- Mounted into the container read-only at `/services`
- Container `SERVICES_ROOT` defaults to `/services`
- Override host path with `SERVICES_ROOT` in `services/stack.env`

See `docs/ai-vault.md` for setup and policy details.

---

## 📦 GhostChain SDK (`@ghostchain/sdk`)

The **GhostChain Sovereign SDK** is the official TypeScript SDK for building on GhostChain L1, GhostL2, and GhostL3. It is zero-dependency (no ethers.js, no web3.js) and uses native cryptography via `@noble/curves` and `@noble/hashes`.

**Location:** [`packages/ghost-sdk/`](packages/ghost-sdk/)  
**Full docs:** [`packages/ghost-sdk/README.md`](packages/ghost-sdk/README.md)

### Highlights

* 38+ sub-path exports — import only what you need
* Native secp256k1 signing, keccak256, RLP, ABI encoding/decoding
* GST gas estimation with speed presets (`slow` / `standard` / `fast` / `instant`)
* ERC-20 / ERC-721 / ERC-1155 token modules with calldata builders
* Concurrent-safe nonce manager (`GhostNonceManager`)
* JSON-RPC client with retry + endpoint failover (`GhostRpcClient`)
* Branded block numbers (`GhostBlockNumber`) with multi-layer watcher
* Cross-chain bridge client and L1/L2/L3 routing
* Smart account + Account Abstraction (ERC-4337)
* GhostBrain AI consensus client, AI gas optimizer
* Ghost Name Service (GNS) resolver

### Quick install (monorepo)

```bash
pnpm add @ghostchain/sdk
```

### Example

```ts
import { createGhostL1RpcClient } from '@ghostchain/sdk/rpc';
import { GhostERC20 } from '@ghostchain/sdk/token/erc20';
import { GhostGasTracker } from '@ghostchain/sdk/gas';

const rpc = createGhostL1RpcClient();           // http://localhost:18545
const gst = new GhostERC20('0x5FbDB2315678afecb367f032d93F642f64180aa3', rpc);
const balance = await gst.balanceOf('0xYOUR_ADDRESS');

const gas = new GhostGasTracker(rpc);
const estimate = await gas.getGasEstimate('fast');
```

### Chain IDs

| Layer | Chain ID | Default RPC |
|---|---|---|
| GhostChain L1 | `14000101` | `localhost:18545` |
| GhostL2 | `901` | `localhost:29547` |
| GhostL3 | `903` | `localhost:39545` |

---

## 🏛️ Governance & Treasury

* On‑chain proposal execution
* Treasury ratification proposals
* Formal invariants (math + Solidity)
* Slashing tied to GST fees
* Court‑ready cryptographic evidence packs

Governance rules:

* **Diff‑only evolution**
* **No chain resets**
* **Sequential service wiring**
* **Fail‑fast preflight checks**

---

## 📚 Evidence Packs

* Evidence pack index: `docs/evidence/README.md`
* Artifacts are generated under `infra/evidence/out` and verified via the `.sha256` files.
* AI governance evidence pack: `infra/scripts/evidence-pack-ai-governance.sh`
* AI governance release gate workflow: `.github/workflows/ai-governance-gate.yml`

## 🚦 GhostLoad Index

GhostLoad is the bounded autonomous load-balancing control plane for GhostChain/GhostL2/GhostL3 with strict routing law and governance safety rails.

Core docs:

* Architecture: [docs/ghostload/ARCHITECTURE.md](docs/ghostload/ARCHITECTURE.md)
* Baseline metrics: [docs/ghostload/BASELINE.md](docs/ghostload/BASELINE.md)
* Rollout and rollback: [docs/ghostload/ROLLOUT.md](docs/ghostload/ROLLOUT.md)
* Governance proposal template: [docs/ghostload/GOVERNANCE_PROPOSAL.md](docs/ghostload/GOVERNANCE_PROPOSAL.md)

Core components:

* Policy engine: [packages/ghostload-policy](packages/ghostload-policy)
* AI decision service: [services/ghostload-ai](services/ghostload-ai)
* Controller actuator: [services/ghostload-controller](services/ghostload-controller)
* Simulator + stress scenarios: [tools/ghostload-sim](tools/ghostload-sim)

Validation and evidence:

* Composite test command: `npm run ghostload:test`
* Scenario outputs: [artifacts/ghostload](artifacts/ghostload)
* Readiness summary: [artifacts/ghostload/READINESS_SUMMARY.md](artifacts/ghostload/READINESS_SUMMARY.md)

CI wiring:

* GhostLoad quality gate: [.github/workflows/ci.yml](.github/workflows/ci.yml) (`ghostload-quality` job)

---

## 📊 Observability & Ops

* Prometheus metrics across all layers
* Grafana dashboards (auto‑imported)
* Health checks & doctor scripts

Key tools:

* `infra/scripts/doctor.sh`
* `docs/checklists/WHAT_YOU_CAN_RUN_TODAY.md` (doctors, gates, bridge E2E, evidence, scans)
* `infra/scripts/up.sh`
* `infra/scripts/preflight:opstack`

Recent submodule PRs:

```
op-geth: https://github.com/ghostchain1/op-geth/pull/1
optimism: https://github.com/ghostchain1/optimism/pull/1
```

---

## 🐳 Docker & Deployment

* ARM64‑first (WSL2, GCP T2A)
* Multi‑stage builds
* One container per responsibility
* Duplicate containers avoided by design

Start devnet:

```
docker compose up -d
```

Enforced promotion workflow (recommended):

```bash
# Stage 1: devnet
bash tools/ghostctl up devnet

# Stage 2: testnet (blocked unless devnet stage is complete)
bash tools/ghostctl up testnet

# Stage 3: mainnet (blocked unless governance approval is valid)
bash tools/ghostctl up mainnet --proposal-id <id>
```

Gate checks:

```bash
bash tools/ghostctl verify-routing
bash tools/ghostctl verify-governance --proposal-id <id>
bash scripts/security/compose-hardening-audit.sh
```

Publish GhostDNS/HGOP images to GHCR (`ghcr.io/ghostchain1/*`):

```bash
export GHCR_TOKEN=<token-with-packages-write>
export GHCR_USER=ghostchain1

# default tag = git short sha, also pushes :latest
npm run release:push:ghostdns:ghcr

# optional env tag (e.g. staging/prod)
PUSH_ENV_TAG=staging npm run release:push:ghostdns:ghcr
```

Runbooks:

- `docs/RUNBOOKS/README.md`
- `docs/RUNBOOKS/ENV_PROMOTION.md`
- `docs/RUNBOOKS/INCIDENT_DEPLOY_GATES.md`

Production bootstrap + readiness (Vault-backed):

```bash
npm run configure:build:ready
```

Recommended full secured production gate (dry-run by default):

```bash
npm run security:production:preflight
```

Requires Vault credentials (`VAULT_ADDR` + `VAULT_TOKEN`, or AppRole `VAULT_ROLE_ID` + `VAULT_SECRET_ID`).
Local non-production rehearsal:

```bash
bash scripts/security/secure-production-build.sh --mode=dev --secrets=dev --skip-lint --skip-build --skip-foundry
```

Execute full secured production build path:

```bash
npm run security:production:build
```

Dedicated CI preflight workflow: `.github/workflows/security-production-preflight.yml`

### Production app runtimes (root commands)

Required for API startup:

```bash
export GHOSTWALLET_MASTER_KEY=<32-byte-hex-or-base64>
```

Start individually:

```bash
npm run start:api:prod
npm run start:worker:prod
PORT=3200 npm run start -w apps/web
```

Start combined:

```bash
# API + Worker
npm run start:apps:prod

# API + Worker + Web
# Optional overrides: API_PORT, WEB_PORT, WORKER_HEALTH_PORT
npm run start:stack:prod
```

Quick verification:

```bash
npm run smoke:stack:prod
npm run verify:prod
npm run smoke:kong:auth -- .env
```

Release gate checklist: `docs/checklists/RELEASE_GATE.md`

---

## 🧪 Testing & Safety

* Hardhat + Foundry
* Gas token enforcement tests
* Chain‑ID uniqueness checks
* Oracle bytecode verification
* Fast cascading finality suite: `cd /home/ghost/ghostl-stack/contracts && npm run test:cascading-finality:ci`

Fast workflow: `.github/workflows/contracts-cascading-fast.yml`

Any failure:

* STOP
* FIX
* CONTINUE ONLY AFTER SUCCESS

---

## 🧬 Codex Automation

All major changes are driven via **Codex Final Evolution Prompts**:

* Diff‑only execution
* Governance‑locked steps
* Ratification blocks
* On‑chain notarization (planned)

Location:

```
/.codex/
```

---

## 🌍 Environments

* Devnet (local Docker)
* Testnet (GCP)
* Mainnet (planned, governance‑locked)

---

## 🚀 Current Status

* ✅ L1/L2/L3 built, wired, and tested
* ✅ Canonical GST gas enforced
* ✅ OP‑Stack preflight passing (L1/L2)
* ✅ `@ghostchain/sdk` v1.0.0 — production-complete (38+ sub-path exports, zero ethers)
* ✅ ERC-20/721/1155, gas tracker, nonce manager, RPC client, signature utils
* ✅ GhostBrain AI client + AI gas optimizer integrated
* ⚠️ L3 OutputOracle wiring in progress
* 🧠 AI services integrated (expanding)

---

## 🧾 Philosophy

GhostL‑Stack is not just a blockchain.

It is a **sovereign protocol operating system** — auditable, evolvable, intelligent, and accountable.

> *"Code is law — but evidence is power."*

---

## 📜 License

Proprietary / Governance‑controlled

Unauthorized forks without ratification are invalid by definition.
