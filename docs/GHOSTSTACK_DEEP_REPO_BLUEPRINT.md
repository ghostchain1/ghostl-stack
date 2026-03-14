# GhostStack Deep Repository Blueprint

> **Version:** 1.0.0  
> **Status:** Living Document — updated as the stack evolves  
> **Scope:** [`ghostl-stack/`](../ghostl-stack) — the monorepo containing all GhostChain protocol layers, services, contracts, and tooling

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Repository Architecture Overview](#2-repository-architecture-overview)
3. [Layer Map](#3-layer-map)
4. [Directory Reference](#4-directory-reference)
5. [Core Services](#5-core-services)
6. [GhostBrain AI Services](#6-ghostbrain-ai-services)
7. [Smart Contracts (GRC Standards)](#7-smart-contracts-grc-standards)
8. [Infrastructure & Deployment](#8-infrastructure--deployment)
9. [Packages](#9-packages)
10. [Data Mesh](#10-data-mesh)
11. [Chains](#11-chains)
12. [Branding & Compliance](#12-branding--compliance)
13. [CI/CD & Automation](#13-cicd--automation)
14. [Development Quickstart](#14-development-quickstart)
15. [Port Registry](#15-port-registry)
16. [Environment Variables Reference](#16-environment-variables-reference)
17. [Contribution Guidelines](#17-contribution-guidelines)

---

## 1. Introduction

GhostStack is a vertically integrated blockchain infrastructure platform built on GhostChain — a next-generation Layer 1 blockchain with integrated AI governance, autonomous economic management, and multi-layer scaling support.

The `ghostl-stack` monorepo contains:

- **Protocol contracts** — GRC20/721/1155 token standards, governance contracts
- **Core services** — Explorer, API gateway, indexer, runtime
- **GhostBrain AI services** — 15+ autonomous AI microservices for chain operation
- **Governance event bridge** — Real-time event pipeline from L1 contracts to GhostBrain
- **Compliance engine** — On-chain AML/KYC monitoring and regulatory reporting
- **Shared npm packages** — `ghost-sdk`, `ghost-devtools`, `ghost-registry`
- **Infrastructure** — Docker Compose stacks, Kubernetes manifests, Terraform modules
- **Data mesh** — Distributed data pipelines and analytics

---

## 2. Repository Architecture Overview

```
ghostl-stack/
├── apps/                    # Front-end applications
├── chains/                  # Chain configuration (devnet, testnet, mainnet)
├── contracts/               # Solidity smart contracts + Hardhat project
│   ├── grc/                 # GRC token standard implementations
│   └── lib/forge-std/       # Foundry forge-std library (git submodule)
├── data-mesh/               # Data pipelines and analytics
├── deployment/              # Deploy scripts, manifests
├── docs/                    # Architecture and operational documentation
├── infrastructure/          # Docker, Kubernetes, Terraform
├── packages/                # Shared npm packages
│   ├── ghost-sdk/           # Core GhostChain SDK
│   ├── ghost-devtools/      # Hardhat plugin and dev tooling
│   └── ghost-registry/      # Network registry, token metadata, brand map
├── scripts/                 # Operational shell scripts
├── services/                # All TypeScript microservices
├── system/                  # System-level configuration
└── validators/              # Validator node tooling
```

---

## 3. Layer Map

| Layer | Components | Purpose |
|-------|-----------|---------|
| **L1 — GhostChain** | IBFT consensus nodes, validators | Base settlement layer |
| **L2 — Scaling** | Optimistic / ZK rollup bridges | High-throughput execution |
| **L3 — App chains** | Sovereign app-specific chains | Domain-isolated computation |
| **Protocol** | GRC contracts, governance | On-chain rules and standards |
| **AI — GhostBrain** | 15+ AI microservices | Autonomous chain management |
| **Data** | Data mesh, indexer, explorer | Chain data visibility |
| **Applications** | API gateway, front-end apps | End-user interfaces |

---

## 4. Directory Reference

### `apps/`
Front-end web applications including the GhostChain dashboard, validator portal, and governance UI. Each app is independently deployable.

### `chains/`
Per-environment chain configuration files (genesis blocks, bootnode lists, RPC endpoints) for devnet, testnet, and mainnet.

### `contracts/`
Hardhat project root for all GhostChain smart contracts.

```
contracts/
├── grc/
│   ├── IGRC20.sol          # GRC20 token interface
│   ├── GRC20Base.sol       # Reference GRC20 implementation
│   ├── IGRC721.sol         # GRC721 NFT interface
│   └── IGRC1155.sol        # GRC1155 multi-token interface
├── lib/
│   └── forge-std/          # Foundry standard library (submodule)
├── hardhat.config.ts       # Hardhat configuration
├── package.json            # Contracts npm project
└── tsconfig.json           # TypeScript config for scripts
```

**GRC Standards** (Ghost Request for Comments) are the GhostChain equivalents of EVM ERC standards. All tokens deployed on GhostChain MUST use these interfaces to maintain ecosystem compatibility.

### `data-mesh/`
Distributed data platform built on Apache Kafka and ClickHouse. Provides real-time chain event streaming, analytics APIs, and historical data for GhostBrain AI models.

### `deployment/`
Infrastructure-as-code for all environments:
- Docker Compose files for local development
- Helm charts for Kubernetes deployment
- Terraform modules for cloud infrastructure

### `infrastructure/docker/`
Production Docker Compose stacks:
- `ghostbrain-stack.yml` — Full 16-service GhostBrain AI stack
- `ghost-core-stack.yml` — Core protocol services (explorer, API, indexer)

### `packages/`
Shared TypeScript/JavaScript packages published to the internal npm registry:

| Package | Description |
|---------|-------------|
| `@ghoststack/ghost-sdk` | Core SDK: providers, wallets, contracts, RPC |
| `@ghoststack/ghost-devtools` | Hardhat plugin, deploy engine, compiler hooks |
| `@ghoststack/ghost-registry` | Network registry, units, brand map, contract addresses |

### `scripts/`
Operational shell scripts for:
- Node startup/shutdown (`up.sh`, `down.sh`)
- Validator management
- Chain data backup and restore
- Dev environment setup

### `system/`
System-level configuration files, service definitions, and init scripts for baremetal deployments.

### `validators/`
Validator node tooling: key generation, registration, monitoring, and slashing protection.

---

## 5. Core Services

Located in `services/`:

| Service | Port | Description |
|---------|------|-------------|
| `ghost-api` | 3000 | Main API gateway — REST + GraphQL |
| `ghost-explorer` | 3001 | Block explorer UI backend |
| `ghost-indexer` | 3002 | Chain event indexer |
| `ghost-runtime` | 3003 | Runtime execution environment + RPC firewall |
| `ghost-branding` | — | Brand compliance scanner (CLI) |
| `ghost-compliance` | 9250 | AML/KYC monitoring and compliance engine |
| `ghostbrain-core` | 9100 | GhostBrain signal ingestion + inference HTTP API |
| `ghostcode-ai` | 3010 | AI-powered code generator and repo analyzer |
| `governance-event-bridge` | 9200 | L1 governance events → GhostBrain pipeline |

---

## 6. GhostBrain AI Services

GhostBrain is the autonomous AI operations layer for GhostChain. All services are located in `services/ghostbrain/` (legacy) and `services/ghostbrain-*/` (newer standalone services).

### 6.1 Core Brain Services

| Service | Port | Role |
|---------|------|------|
| `ghostbrain-core` | 9100 | Signal ingestion (`POST /signals`) and inference (`POST /think`) |
| `ghostbrain/swarm` | 9000 | Multi-agent swarm coordinator |
| `ghostbrain/kernel` | 9300 | Hypervisor kernel — resource scheduling |
| `ghostbrain/control-plane` | 9500 | Orchestration control plane |
| `ghostbrain/governance` | 9550 | Governance state machine |
| `ghostbrain/validator-fabric` | 9700 | Validator lifecycle manager |
| `ghostbrain/economy-engine` | 9800 | Token economy optimizer |
| `ghostbrain/data-mesh` | 9900 | Data pipelines for AI models |
| `ghostbrain/ai-copilot` | 9850 | AI Operations Copilot (AIOC) |

### 6.2 Standalone GhostBrain Microservices

| Service | Description |
|---------|-------------|
| `ghostbrain-agents` | Multi-agent framework: registry, messenger, coordinator |
| `ghostbrain-economy` | Treasury, liquidity, market, and tokenomics engines |
| `ghostbrain-evolution` | Performance analysis, upgrade planning, A/B experiments |
| `ghostbrain-memory` | Long-term memory, event store, knowledge graph |
| `ghostbrain-network` | P2P intelligence sync, consensus, trust scores |
| `ghostbrain-simulator` | Infrastructure, validator, market, governance simulators |

### 6.3 GhostBrain Core API

**`POST /signals`** — Ingest an on-chain or bridge event:
```json
{
  "source": "governance-event-bridge",
  "type": "ProposalCreated",
  "payload": { "proposalId": "...", "proposer": "0x..." }
}
```

**`POST /think`** — Query GhostBrain for a reasoning response:
```json
{
  "query": "Should we rebalance the liquidity pool given current TVL?",
  "context": "TVL dropped 15% in the last 24h",
  "mode": "deep"
}
```

**`GET /signals?limit=50`** — Retrieve recent signals queue.

---

## 7. Smart Contracts (GRC Standards)

### GRC20 — Fungible Token Standard
The GhostChain equivalent of ERC20. All fungible tokens (GST, GHOST, protocol tokens) must implement `IGRC20`. `GRC20Base.sol` provides the reference implementation.

Key differences from ERC20:
- Built-in `mint()` and `burn()` with governance guard
- Metadata extensions (decimals, symbol, name) required
- Transfer hooks for compliance integration

### GRC721 — Non-Fungible Token Standard
GhostChain NFT standard. Used for validator licenses, governance voting NFTs, and platform credentials.

### GRC1155 — Multi-Token Standard
Batch transfer support for mixed fungible/non-fungible assets. Used for in-protocol rewards and multi-class staking positions.

### Governance Contracts
- `GhostGovernor` — On-chain proposal + voting system (compatible with Governor Bravo pattern)
- `GhostTimelock` — Timelock controller for executed proposals

---

## 8. Infrastructure & Deployment

### Docker Compose Stacks

| File | Purpose |
|------|---------|
| `docker-compose.ghostbrain.yml` | GhostBrain Core + Bridge + Compliance (lightweight) |
| `infrastructure/docker/ghostbrain-stack.yml` | Full 16-service GhostBrain AI stack |
| `infrastructure/docker/ghost-core-stack.yml` | Protocol core services |

### Running the Core Stack

```bash
# Start GhostBrain Core + Governance Bridge
docker compose -f docker-compose.ghostbrain.yml up -d

# Start the full GhostBrain AI stack (requires GHOSTBRAIN_SRC set)
export GHOSTBRAIN_SRC=/home/ghost/hyperghost-tooling/hyper-ghost-ai/services
docker compose -f infrastructure/docker/ghostbrain-stack.yml up -d

# Check health
curl http://localhost:9100/health   # ghostbrain-core
curl http://localhost:9200/status   # governance-event-bridge
```

### Kubernetes (Helm)
Helm charts under `deployment/helm/`. Deploy to any Kubernetes cluster:
```bash
helm install ghostchain deployment/helm/ghostchain/ -f deployment/helm/values.prod.yaml
```

---

## 9. Packages

### `@ghoststack/ghost-sdk`
The primary developer SDK for interacting with GhostChain programmatically.

Modules:
- `GhostProvider` — JSON-RPC provider
- `GhostWallet` / `GhostSigner` — Key management
- `GhostContract` — Contract interaction
- `GhostEvent` — Event subscription
- `GhostBridge` — L1↔L2 bridge
- `GhostGasEngine` — Gas estimation and optimization
- `GRC20` / `GRC721` / `GRC1155` — Token interfaces
- `GhostLayerRouter` — Multi-layer routing

### `@ghoststack/ghost-devtools`
Hardhat plugin for GhostChain development.
- `hardhat-ghost` — Chain-aware Hardhat plugin
- `GhostDeployEngine` — Typed deployment manager
- `GhostCompilerHooks` — Custom compiler pipeline

### `@ghoststack/ghost-registry`
Static registry of chain metadata.
- `GhostNetworks` — Chain IDs, RPC endpoints, explorers
- `GhostUnits` — Token denomination conversions
- `GhostBrandMap` — Official branding assets and color tokens
- `GhostContracts` — Canonical contract addresses per chain

---

## 10. Data Mesh

The data mesh layer provides a decentralized data platform:

- **Kafka event bus** — All on-chain events are streamed to Kafka topics
- **ClickHouse** — High-performance OLAP for chain analytics
- **GraphQL API** — Unified data access layer for apps and GhostBrain
- **AI training pipelines** — Data prep for GhostBrain model training

---

## 11. Chains

### Devnet
- Internal development chain (IBFT consensus)
- Chain ID: configured in `chains/devnet/config.json`
- Funded accounts from `geth/keys/`

### Testnet
- Public test network for dApp developers
- Chain ID: configured in `chains/testnet/config.json`
- Faucet available at testnet.ghostchain.io/faucet

### Mainnet
- Production GhostChain L1
- Chain ID: configured in `chains/mainnet/config.json`
- Validators must be registered via governance

---

## 12. Branding & Compliance

### Brand Compliance
The `ghost-branding` service and `BrandingGuardian` agent enforce consistent GhostChain naming across all code, contracts, and documentation.

Rules enforced:
- All tokens use `GRC` prefix (not ERC)
- All services prefixed with `ghost-` or `ghostbrain-`
- Official color palette from `GhostBrandMap`
- No unauthorized forks of OZ contracts without `GRC` renaming

### Compliance Engine (`ghost-compliance`)
Monitors on-chain activity for regulatory compliance:
- Transaction pattern analysis
- Address screening against deny lists
- Regulatory report generation
- Integration with GhostBrain signal pipeline

---

## 13. CI/CD & Automation

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ghost-branding.yml` | Push to `main`, PR | Brand compliance scan |
| `ast-check.yml` | Push, PR | Solidity AST validation |
| `ai-enforcement.yml` | Schedule (daily) | AI-driven code quality enforcement |

### Makefile
The root `Makefile` provides convenience targets:

```bash
make build          # Build all packages and services
make test           # Run all test suites
make lint           # Lint all TypeScript and Solidity
make docker-up      # Start all Docker services
make docker-down    # Stop all Docker services
make deploy-devnet  # Deploy contracts to devnet
```

---

## 14. Development Quickstart

### Prerequisites
- Node.js 20+
- Docker + Docker Compose v2
- Foundry (`foundryup`)
- Git

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/ghostmode25/ghost-home-private-20260301.git
cd ghost-home-private-20260301/ghostl-stack

# 2. Install dependencies (all packages and services)
npm install             # root workspace
cd packages/ghost-sdk && npm install
cd ../ghost-devtools && npm install
cd ../ghost-registry && npm install

# 3. Install contract dependencies
cd ../../contracts && npm install
git submodule update --init --recursive   # pull forge-std

# 4. Build all packages
cd ../packages/ghost-sdk && npm run build
cd ../ghost-registry && npm run build
cd ../ghost-devtools && npm run build

# 5. Start dev services
cd ../..
docker compose -f docker-compose.ghostbrain.yml up -d

# 6. Verify health
curl http://localhost:9100/health
curl http://localhost:9200/health
```

---

## 15. Port Registry

| Port | Service |
|------|---------|
| 3000 | ghost-api |
| 3001 | ghost-explorer |
| 3002 | ghost-indexer |
| 3003 | ghost-runtime |
| 3010 | ghostcode-ai |
| 8545 | GhostChain L1 JSON-RPC |
| 9000 | ghostbrain-swarm |
| 9100 | ghostbrain-core |
| 9200 | governance-event-bridge |
| 9250 | ghost-compliance |
| 9300 | ghostbrain-kernel |
| 9500 | ghostbrain-control-plane |
| 9550 | ghostbrain-governance |
| 9700 | ghostbrain-validator-fabric |
| 9800 | ghostbrain-economy-engine |
| 9850 | ghostbrain-ai-copilot |
| 9900 | ghostbrain-data-mesh |

---

## 16. Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `GHOSTCHAIN_RPC_URL` | `http://localhost:8545` | L1 JSON-RPC endpoint |
| `GHOSTCHAIN_CHAIN_ID` | `1337` | Chain ID |
| `GOVERNANCE_CONTRACT_ADDRESS` | `0x000...` | On-chain governance contract |
| `GHOSTBRAIN_CORE_URL` | `http://ghostbrain-core:9100` | ghostbrain-core service URL |
| `GHOSTBRAIN_SRC` | `/home/ghost/hyperghost-tooling/hyper-ghost-ai/services` | Path to ghostbrain service sources |
| `LOG_LEVEL` | `info` | Pino log level |
| `NODE_ENV` | `development` | Runtime environment |
| `POLL_INTERVAL_MS` | `12000` | Governance bridge poll interval |
| `START_BLOCK` | `0` | Block from which to start event indexing |

---

## 17. Contribution Guidelines

### Naming Conventions
- **Services**: `ghost-<name>` (core) or `ghostbrain-<name>` (AI)
- **Packages**: `@ghoststack/<name>`
- **Contracts**: `GRC` prefix for all standards
- **Events**: `Ghost<EventName>` in contracts

### Code Standards
- All TypeScript: `strict: true`, `esModuleInterop: true`, `types: ["node"]`
- All Solidity: `pragma solidity ^0.8.24`, SPDX header required
- No `any` types — use `unknown` + type guards
- All services must implement `GET /health`

### Pull Request Process
1. Branch from `main` using `feature/<description>` or `fix/<description>`
2. Ensure all CI checks pass (branding, AST, compile)
3. Include test coverage for new service endpoints
4. Update this blueprint if adding new services or ports

---

*GhostStack — Built for the autonomous chain era.*
