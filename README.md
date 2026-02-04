# 👻 GhostL‑Stack

**GhostL‑Stack** is the canonical monorepo for the **GhostChain Sovereign Blockchain System** — a production‑grade, AI‑native, multi‑layer blockchain architecture consisting of:

* **GhostChain (L1)** — main Autonomous Layer 1 blockchain (Ethereum‑compatible base chain)
* **GhostL2 (L2)** — OP‑Stack rollup anchored to GhostChain
* **GhostL3 (L3)** — OP‑Stack rollup anchored to GhostL2

This repository is designed to be **diff‑only evolvable**, **governance‑locked**, **AI‑assisted**, and **court / regulator‑ready**.

---

## 🌌 High‑Level Architecture

```
┌───────────────────────────────────────────┐
│                GhostChain L1              │
│  (EVM, GHOST Gas, Governance, Treasury)   │
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

## ⛓️ Blockchain Layers

### GhostChain (L1)

* Ethereum‑compatible execution
* **Main Autonomous Layer 1 blockchain** (governance‑locked, AI‑assisted ops)
* **Canonical gas token:** GHOST (ERC‑20)
* Custom governance (no OpenZeppelin Governor)
* Treasury & slashing logic
* Compliance‑aware hooks

**Ghost Token (L1)**

* Contract: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
* Symbol: `GHOST` (ERC‑20, 18 decimals)
* Genesis mint: `1,000,000,000` GHOST to `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
* L2/L3 gas token: **GHOST** (L1 ERC‑20 address above)

**Key contracts:**

* `Governor.sol`
* `ProposalExecutor.sol`
* `FutureStack.sol`

---

### GhostL2 (OP Stack)

* Uses `op-geth`, `op-node`, `op-batcher`, `op-proposer`
* Anchored to GhostChain via OptimismPortal
* OutputOracle verified during preflight
* Uses GHOST as canonical gas

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

## 🏛️ Governance & Treasury

* On‑chain proposal execution
* Treasury ratification proposals
* Formal invariants (math + Solidity)
* Slashing tied to GHOST fees
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

---

## 🧪 Testing & Safety

* Hardhat + Foundry
* Gas token enforcement tests
* Chain‑ID uniqueness checks
* Oracle bytecode verification

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
* ✅ Canonical GHOST gas enforced
* ✅ OP‑Stack preflight passing (L1/L2)
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
