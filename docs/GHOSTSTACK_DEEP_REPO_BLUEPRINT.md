# GhostStack Deep Repository Blueprint

**Companion to:** `docs/GHOSTSTACK_MASTER_ARCHITECTURE_BLUEPRINT.md`  
**Purpose:** Directory-tree-level specification for the complete monorepo — every microservice, AI wiring, SDK architecture, validator infrastructure, and deployment automation.  
**Version:** 2.0 (post-governance-event-bridge)

---

## Table of Contents

1. [Complete Folder Structure](#1-complete-folder-structure)
2. [Every Microservice — Full Inventory](#2-every-microservice--full-inventory)
3. [AI Orchestration — Deep Wiring](#3-ai-orchestration--deep-wiring)
4. [SDK Architecture](#4-sdk-architecture)
5. [Validator Infrastructure](#5-validator-infrastructure)
6. [Deployment Automation](#6-deployment-automation)

---

## 1. Complete Folder Structure

The repository is a Node.js/pnpm monorepo. Every folder below is real and present in the workspace.

```
ghostl-stack/
│
├── apps/                          ← Control-plane web/API layer
│   ├── api/                       ← Express 5 REST gateway  (port 4000)
│   ├── web/                       ← Next.js 14 admin dashboard (port 3200)
│   ├── worker/                    ← Background job processor
│   ├── ghostx/                    ← GhostX exchange frontend
│   ├── docker-compose.yml         ← Production app-layer compose
│   └── docker-compose.dev.yml     ← Development overrides
│
├── packages/                      ← Shared TypeScript library packages (35 total)
│   ├── ghost-sdk/                 ← Primary developer SDK (ethers-wrapped)
│   ├── ghost-sdk-core/            ← Native primitives SDK (no ethers)
│   │   └── src/
│   │       ├── registry/          ← GhostNetworkRegistry.ts
│   │       ├── routing/           ← GhostCrossChainRouter.ts
│   │       ├── wallet/            ← GhostWallet.ts, GhostSigner.ts
│   │       ├── rpc/               ← GhostJsonRpc.ts
│   │       ├── gas/               ← GhostGasEngine.ts
│   │       └── contract/          ← GhostContract.ts
│   ├── ghost-ai-sdk/              ← AI service integration SDK
│   ├── ghostchain-sdk/            ← GhostChain-specific low-level SDK
│   ├── ghost-devkit/              ← Dev tooling + test helpers
│   ├── ghost-infra/               ← Infrastructure management SDK
│   ├── ghost-swarm/               ← Swarm intelligence client library
│   ├── ghost-cognitive/           ← Cognitive AI client
│   ├── ghost-consciousness/       ← Consciousness layer client
│   ├── ghost-autonomous/          ← Autonomous operations SDK
│   ├── dtn-cli/                   ← DTN relay CLI
│   ├── pq-crypto/                 ← Post-quantum cryptography primitives
│   ├── routing-guard/             ← Routing rule enforcement (enforces law)
│   ├── routing-law/               ← Routing policy (Zod-validated invariants)
│   ├── ghostdns-policy/           ← DNS policy types
│   ├── ghostdns-types/            ← GNS type definitions
│   ├── ghostload-policy/          ← Load balancer policy definitions
│   ├── governance-bundle/         ← Governance contract interfaces
│   ├── contract-schemas/          ← On-chain ABI + schema definitions
│   ├── hardhat-ghost/             ← Hardhat plugin for GhostChain
│   ├── ghostwallet/               ← Wallet primitives library
│   ├── brand-enforcer/            ← UI brand compliance checker
│   ├── types/                     ← Shared TypeScript types
│   └── ui/                        ← Shared UI component library
│
├── services/                      ← 150+ microservices (see Section 2)
│   ├── ghostbrain-core/           ← Brain loop hub  (port 7900)
│   ├── ghostbrain-gsa/            ← Swarm agent coordinator (7901)
│   ├── hyper-ghost-ai/            ← Top-level AI decision hub
│   ├── host-orchestrator-ai/      ← KVM + Docker execution agent
│   ├── governance-event-bridge/   ← On-chain→AI governance pipeline ✨
│   └── … (see Section 2 for complete list)
│
├── contracts/                     ← Solidity smart contracts
│   ├── src/
│   │   ├── token/                 ← GhostSettlementToken.sol (GST ERC-20)
│   │   ├── governance/            ← GhostChainGovernor.sol
│   │   ├── ai/                    ← GhostBrainIntegration.sol, AICommandCenter.sol
│   │   │                             AILayerGuardian.sol, GhostRiskOracle.sol
│   │   ├── liquidity/             ← LoadBalancerVault.sol, AdapterRegistry.sol
│   │   │                             SettlementOracle.sol, RewardRouter.sol
│   │   │                             CircuitBreaker.sol, OperatorBondVault.sol
│   │   ├── bridge/                ← Cross-chain bridge contracts
│   │   ├── staking/               ← Validator staking contracts
│   │   ├── oracle/                ← Price + settlement oracles
│   │   └── utils/                 ← Shared Solidity utilities
│   ├── script/                    ← Foundry deploy scripts
│   ├── scripts/                   ← Hardhat deploy scripts (TypeScript)
│   │   ├── deploy_all.ts
│   │   ├── deploy_l1.ts
│   │   ├── deploy_l2.ts
│   │   ├── deploy_l3.ts
│   │   ├── deploy_ai_layers.ts
│   │   ├── deploy_liquidity_gravity.ts
│   │   ├── one_click_testnet.ts
│   │   ├── run_slither.ts
│   │   ├── run_echidna.ts
│   │   └── run_foundry_tests.ts
│   ├── test/                      ← Hardhat + Foundry test suites
│   ├── foundry.toml               ← Foundry config
│   ├── hardhat.config.ts          ← Hardhat config (multi-network)
│   └── lib/                       ← Foundry dependencies (forge install)
│
├── infra/                         ← Infrastructure-as-code
│   ├── ghostchain/                ← L1 GhostChain node config + compose
│   │   ├── docker-compose.l1.yml  ← L1 node cluster (node1, node2, bootnode)
│   │   ├── docker-compose.ibft.yml← IBFT validator cluster
│   │   ├── config/                ← genesis.json, ibft config
│   │   ├── geth/                  ← geth data directories
│   │   ├── ibft/                  ← IBFT validator keys (per-node)
│   │   ├── secrets/               ← Validator key secrets (gitignored)
│   │   └── scripts/               ← init.sh, up.sh, down.sh, health.sh
│   ├── opstack/                   ← OP Stack L2/L3
│   │   ├── docker-compose.yml     ← op-node, l2-geth, op-batcher, op-proposer
│   │   ├── docker-compose.l3.yml  ← l3-op-node, l3-geth, l3-batcher
│   │   ├── docker-compose.challengers.yml ← fraud proof challenger
│   │   ├── docker-compose.l2-node.yml
│   │   ├── docker-compose.l3-node.yml
│   │   ├── docker-compose.network-manager.yml
│   │   ├── docker-compose.mainnet-geth.yml
│   │   ├── op-intent/             ← OP Stack intent configurations
│   │   ├── op-deployer-state/     ← deployer state artifacts
│   │   ├── gate/                  ← RPC gate proxy config
│   │   ├── l3/                    ← L3 specific configs
│   │   ├── rpc-forward/           ← Port forwarding rules
│   │   └── scripts/               ← L2/L3 deploy scripts
│   ├── hypervisor/                ← KVM hypervisor control plane
│   ├── helm/                      ← Helm charts (4 chart bundles)
│   │   ├── ghostchain-core/       ← Core chain chart
│   │   ├── ghostchain-observability/ ← Metrics + dashboards chart
│   │   ├── ghostchain-services/   ← Microservices chart
│   │   ├── ghostchain-ui/         ← Web UI chart
│   │   └── helm-template.sh       ← Chart template generator
│   ├── k8s/                       ← Kubernetes manifests
│   │   ├── base/                  ← Base Kustomize configs
│   │   ├── prod/                  ← Production overlays
│   │   ├── staging/               ← Staging overlays
│   │   ├── blueprints/            ← K8s deployment blueprints
│   │   └── migration/             ← Migration manifests
│   ├── terraform/                 ← Cloud provisioning
│   │   ├── eks/                   ← AWS EKS cluster definition
│   │   ├── gke/                   ← GCP GKE cluster definition
│   │   └── terraform-plan.sh
│   ├── vault/                     ← HashiCorp Vault policies
│   ├── grafana/                   ← Dashboard JSON exports
│   ├── prometheus/                ← Prometheus rules + alertmanager config
│   ├── observability/             ← Unified observability package
│   ├── dns/                       ← DNS zone / BIND9 templates
│   ├── authz/                     ← Authorization policies
│   ├── keycloak/                  ← Keycloak realm config
│   ├── safeops/                   ← Safe operations runbooks
│   ├── playbooks/                 ← Ansible playbooks
│   ├── ghost-geth/                ← Custom go-ethereum build
│   ├── gns/                       ← GNS infrastructure templates
│   ├── docker/                    ← Docker daemon + registry config
│   ├── evidence/                  ← Evidence collection tools
│   └── scripts/                   ← Unified deployment scripts (see Section 6)
│       ├── up-full.sh             ← Full stack bring-up
│       ├── up.sh                  ← Partial stack bring-up
│       ├── down.sh                ← Graceful shutdown
│       ├── doctor.sh              ← Health check all layers
│       ├── doctor-l1/l2/l3.sh    ← Per-chain health checks
│       ├── release-l1/l2/l3.sh   ← Release scripts per chain
│       ├── rollback-l1/l2/l3.sh  ← Per-chain rollback
│       ├── reset.sh               ← Full environment reset
│       ├── install_deps.sh        ← Dependency installer
│       ├── env-sync-*.sh          ← Environment variable sync
│       ├── keys/                  ← Key generation tooling
│       ├── opstack/               ← OP Stack-specific scripts
│       ├── production/            ← Production launch scripts
│       ├── chains/                ← Chain management scripts
│       ├── gates/                 ← Gate/proxy scripts
│       ├── chaos/                 ← Chaos engineering scripts
│       ├── federation/            ← Federation management
│       ├── security/              ← Security scan scripts
│       ├── wallet/                ← Wallet setup scripts
│       ├── bridge-e2e.sh          ← End-to-end bridge test
│       ├── evidence-pack-*.sh     ← Evidence collection scripts
│       └── demo-*.sh              ← Bridge demo scripts (deposit/withdraw)
│
├── chains/                        ← On-disk chain state
│   ├── l2/                        ← L2 data directory
│   └── l3/                        ← L3 data directory
│
├── config/                        ← Shared configuration
│   └── gst-allowlist.txt          ← GST transfer allowlist
│
├── governance/                    ← Governance proposals + artifacts
├── security/                      ← Security policy + audit configs
│   └── trivy-secret.yaml          ← Trivy secret scanner rules
├── observability/                 ← Root-level observability config
├── grafana/                       ← Root-level Grafana dashboards
├── launch-system/                 ← Launch sequence orchestration
├── environments/                  ← Per-environment .env bundles
│   ├── devnet/
│   ├── testnet/
│   └── mainnet/
├── artifacts/                     ← Build/deploy artifacts
│   ├── governor/                  ← Governor deployment artifacts
│   └── solvency/                  ← ZK solvency proof artifacts
├── evidence/                      ← Cryptographic evidence store
├── tests/                         ← Cross-service integration tests
├── tools/                         ← Dev tools + utilities
├── scripts/                       ← Root-level convenience scripts
├── logs/                          ← Runtime logs (gitignored)
├── docs/                          ← All documentation
│   └── GHOSTSTACK_MASTER_ARCHITECTURE_BLUEPRINT.md
│   └── GHOSTSTACK_DEEP_REPO_BLUEPRINT.md  ← THIS FILE
│
├── docker-compose.yml             ← Main production compose entry
├── docker-compose.dev.yml         ← Dev compose (all services)
├── docker-compose.ghostbrain.yml  ← AI/brain stack
├── docker-compose.autonomy.yml    ← Autonomy services
├── docker-compose.phase3.yml      ← Compliance + governance
├── docker-compose.agents.yml      ← Swarm agent network
├── docker-compose.ai-consensus.yml← AI consensus layer
├── docker-compose.cascading-finality.yml
├── docker-compose.ghostx.yml      ← GhostX + GNS + gas engine
├── docker-compose.sovereign.yml   ← Hardened sovereign stack
├── docker-compose.econ.devnet.yml
├── docker-compose.econ.testnet.yml
├── docker-compose.econ.mainnet.yml
├── compose.testnet.yml
├── pnpm-workspace.yaml            ← Workspace package definitions
├── package.json                   ← Root package.json (workspaces)
├── tsconfig.base.json             ← Shared TypeScript base config
└── stack.env.example              ← Environment variable template
```

---

## 2. Every Microservice — Full Inventory

### 2.1 Quick Reference Legend

| Column | Meaning |
|--------|---------|
| **Service** | Directory name under `services/` |
| **Port** | Primary exposed port (blank = internal only) |
| **Compose** | Docker Compose file that defines it |
| **Lang** | Primary language |
| **Role** | One-line purpose |

### 2.2 Master Microservice Table

| Service | Port | Compose File | Lang | Role |
|---------|------|--------------|------|------|
| **Blockchain Stack** | | | | |
| `ghost-rpc-proxy` | 18545 | `infra/ghostchain/docker-compose.l1.yml` | Go/nginx | L1 RPC gateway + rate limiter |
| `ghost-relayer` | 8080 | `docker-compose.ghostbrain.yml` | TypeScript | L1↔L2 message relay |
| `ghostchain-bridge-hub` | 8090 | `docker-compose.ghostx.yml` | TypeScript | Cross-chain bridge hub |
| `ghost-rollup-challenger` | — | `infra/opstack/docker-compose.challengers.yml` | Go | Fraud proof challenger |
| `ghost-rollup-proposer` | — | `infra/opstack/docker-compose.challengers.yml` | Go | Output root proposer (alt) |
| `ghost-mapper` | 18545/29547/39545 | `docker-compose.dev.yml` | Node.js | Dev RPC port mapper |
| `rpc-forward-l1-29545` | 29545 | `infra/opstack/rpc-forward/` | nginx | L1 RPC port forwarder |
| `network-manager-service` | — | `infra/opstack/docker-compose.network-manager.yml` | TypeScript | Chain network manager |
| **AI / Brain Stack** | | | | |
| `ghostbrain-core` | 7900 | `docker-compose.ghostbrain.yml` | TypeScript | Brain loop · plans · signals · think |
| `ghostbrain-gsa` | 7901 | `docker-compose.ghostbrain.yml` | TypeScript | Swarm agent coordinator |
| `host-orchestrator-ai` | 7902 | `docker-compose.ghostbrain.yml` | TypeScript | KVM + Docker execution agent |
| `hyper-ghost-supervisor` | 7903 | `docker-compose.ghostbrain.yml` | TypeScript | VM health → brain signals |
| `hyper-ghost-ai` | 7741 | `docker-compose.autonomy.yml` | TypeScript | Top-level AI decision hub |
| `hyper-ghost-governor` | 7401 | `docker-compose.phase3.yml` | TypeScript | AI-assisted governance actor |
| `hg-risk-oracle` | — | `docker-compose.autonomy.yml` | TypeScript | Risk assessment oracle |
| `hg-treasury-agent` | — | `docker-compose.econ.mainnet.yml` | TypeScript | Autonomous treasury operations |
| `hg-proof-snapshotter` | — | `docker-compose.autonomy.yml` | TypeScript | ZK proof snapshot generation |
| `hg-reporting-indexer` | — | `docker-compose.autonomy.yml` | TypeScript | Governance reporting indexer |
| `ghost-ai-attestor` | — | `docker-compose.ai-consensus.yml` | TypeScript | Cross-chain attestation agent |
| `ghost-ai-consensus` | — | `docker-compose.ai-consensus.yml` | TypeScript | Consensus-level AI validation |
| `ghost-ai-contract-engine` | — | `docker-compose.autonomy.yml` | TypeScript | Smart contract AI analyzer |
| `ghostcontract-ai` | — | `docker-compose.autonomy.yml` | TypeScript | Contract risk AI |
| `ghostdns-ai` | — | `docker-compose.autonomy.yml` | TypeScript | DNS anomaly + routing AI |
| `ghostdns-ai-policy` | — | `docker-compose.autonomy.yml` | TypeScript | DNS policy enforcement AI |
| `ghostload-ai` | — | `docker-compose.autonomy.yml` | TypeScript | Load balancing AI |
| `ghostvm-ai` | — | `docker-compose.autonomy.yml` | TypeScript | VM resource optimization AI |
| `ghost-storage-ai` | — | `docker-compose.autonomy.yml` | TypeScript | Storage tier optimization |
| `vm-protocol-ai` | — | `docker-compose.autonomy.yml` | TypeScript | Hypervisor protocol AI |
| `explainability-service` | — | `docker-compose.autonomy.yml` | TypeScript | AI decision explainability |
| `forecasting-service` | — | `docker-compose.autonomy.yml` | TypeScript | On-chain metrics forecasting |
| `autonomous-vault-hypervisor` | — | `docker-compose.autonomy.yml` | TypeScript | Autonomous vault management |
| `anomaly-detection-service` | — | `docker-compose.autonomy.yml` | TypeScript | On-chain anomaly detection |
| `ai-clock-sync` | — | `docker-compose.autonomy.yml` | TypeScript | Distributed AI clock sync |
| `ai-monitor` | — | `docker-compose.autonomy.yml` | TypeScript | AI health + performance monitor |
| `ai-policy` | — | `docker-compose.autonomy.yml` | TypeScript | Policy evaluation engine |
| `ai-vault` | — | `docker-compose.autonomy.yml` | TypeScript | AI secret management |
| `ghost-registry` | 8088 (host:28088) | `docker-compose.autonomy.yml` | TypeScript | RPC endpoint registry |
| `governance-event-bridge` | — | `docker-compose.ghostbrain.yml` | TypeScript | Chain events → brain signals ✨ |
| `agent-node` | — | `docker-compose.agents.yml` | TypeScript | Leaf executor swarm agent |
| `agent-registry-service` | — | `docker-compose.agents.yml` | TypeScript | Agent identity registry |
| **Control Plane** | | | | |
| `apps/api` | 4000 | `apps/docker-compose.yml` | Express 5/TS | REST API · auth proxy · all routes |
| `apps/web` | 3200 | `apps/docker-compose.yml` | Next.js 14 | Admin UI + dashboards |
| `apps/worker` | — | `apps/docker-compose.yml` | Node.js | Background job processor |
| **Identity & Security** | | | | |
| `auth-service` | 7700 | `docker-compose.phase3.yml` | TypeScript | JWT/session authentication |
| `ghost-guard` | 7701 | `docker-compose.phase3.yml` | TypeScript | Request guard + rate limiter |
| `ghost-jwks-guard` | 7702 | `docker-compose.phase3.yml` | TypeScript | JWKS key verification |
| `rbac-service` | 7703 | `docker-compose.phase3.yml` | TypeScript | Role-based access control |
| `session-service` | 7704 | `docker-compose.phase3.yml` | TypeScript | Session management |
| `ghost-compliance` | 7800 | `docker-compose.yml` | TypeScript | Compliance rule engine |
| `ghost-compliance-worker` | — | `docker-compose.yml` | TypeScript | Async compliance jobs |
| `compliance-export-service` | — | `docker-compose.phase3.yml` | TypeScript | Compliance report exporter |
| `audit-log-service` | 7705 | `docker-compose.phase3.yml` | TypeScript | Immutable audit trail |
| `secrets-health-service` | — | `docker-compose.autonomy.yml` | TypeScript | Vault secret health monitor |
| `key-rotation-service` | — | `docker-compose.autonomy.yml` | TypeScript | Automated key rotation |
| `ghost-pil` | — | `docker-compose.phase3.yml` | TypeScript | Policy-in-language engine |
| `ghost-pil-worker` | — | `docker-compose.phase3.yml` | TypeScript | PIL async processor |
| `ghost-secure-logger` | — | `docker-compose.phase3.yml` | TypeScript | Secure structured logger |
| `verification-service` | — | `docker-compose.phase3.yml` | TypeScript | Identity/contract verification |
| `feature-flags-service` | — | `docker-compose.autonomy.yml` | TypeScript | Feature flag management |
| **Observability** | | | | |
| `alerts-service` | 7600 | `docker-compose.yml` | TypeScript | Custom alert processor |
| `notifications-service` | 7601 | `docker-compose.yml` | TypeScript | Multi-channel notification router |
| `consensus-telemetry-service` | 7602 | `docker-compose.yml` | TypeScript | IBFT + OP Stack telemetry |
| `chain-status-service` | 7603 | `docker-compose.yml` | TypeScript | Live chain head + finality lag |
| **Treasury & Economics** | | | | |
| `treasury-service` | 7500 | `docker-compose.econ.mainnet.yml` | TypeScript | Core treasury operations |
| `treasury-engine` | 7501 | `docker-compose.econ.mainnet.yml` | TypeScript | Autonomous reserve management |
| `treasury-ai` | 7502 | `docker-compose.econ.mainnet.yml` | TypeScript | AI treasury strategy |
| `treasury-evidence` | 7503 | `docker-compose.econ.mainnet.yml` | TypeScript | ZK solvency proof store |
| `l3-fee-collector` | — | `docker-compose.econ.mainnet.yml` | TypeScript | L3 → L2 fee routing |
| `l2-revenue-aggregator` | — | `docker-compose.econ.mainnet.yml` | TypeScript | L2 revenue → treasury sweep |
| `reward-distributor` | — | `docker-compose.econ.mainnet.yml` | TypeScript | Validator + staker rewards |
| `payout-service` | — | `docker-compose.econ.mainnet.yml` | TypeScript | Scheduled payout execution |
| `supply-service` | — | `docker-compose.econ.mainnet.yml` | TypeScript | GST supply tracking |
| `fee-model-service` | — | `docker-compose.econ.mainnet.yml` | TypeScript | Gas fee model calculator |
| `liquidity-service` | — | `docker-compose.econ.mainnet.yml` | TypeScript | Protocol-owned liquidity |
| `liquidity-router` | — | `docker-compose.econ.mainnet.yml` | TypeScript | LGE strategy + execution |
| `liquidity-prover` | — | `docker-compose.econ.mainnet.yml` | TypeScript | ZK liquidity proof generation |
| **Governance** | | | | |
| `governance-service` | 7400 | `docker-compose.phase3.yml` | TypeScript | On-chain proposal management |
| `staking-service` | 7402 | `docker-compose.phase3.yml` | TypeScript | Validator staking + delegation |
| `validator-service` | 7403 | `docker-compose.phase3.yml` | TypeScript | Validator registry |
| `rewards-service` | 7404 | `docker-compose.phase3.yml` | TypeScript | Reward computation |
| `participation-service` | 7405 | `docker-compose.phase3.yml` | TypeScript | Voting participation tracking |
| `slashing-detection-service` | — | `docker-compose.phase3.yml` | TypeScript | Slashing condition monitor |
| `dispute-service` | — | `docker-compose.phase3.yml` | TypeScript | Fraud proof dispute resolution |
| **Explorer & Indexing** | | | | |
| `ghostscout-l1` | 4000 | `docker-compose.ghostx.yml` | Elixir/Phoenix | L1 block explorer backend |
| `ghostscout-l2` | 4001 | `docker-compose.ghostx.yml` | Elixir/Phoenix | L2 block explorer backend |
| `ghostscout-l3` | 4002 | `docker-compose.ghostx.yml` | Elixir/Phoenix | L3 block explorer backend |
| `ghostscout-frontend-l1` | 3001 | `docker-compose.ghostx.yml` | Next.js | L1 explorer UI |
| `ghostscout-frontend-l2` | 3002 | `docker-compose.ghostx.yml` | Next.js | L2 explorer UI |
| `ghostscout-frontend-l3` | 3003 | `docker-compose.ghostx.yml` | Next.js | L3 explorer UI |
| `ghostscout-db` | — | `docker-compose.ghostx.yml` | PostgreSQL | Explorer state database |
| `block-index-service` | 7300 | `docker-compose.yml` | TypeScript | Block indexer |
| `tx-index-service` | 7301 | `docker-compose.yml` | TypeScript | Transaction indexer |
| `mempool-service` | 7302 | `docker-compose.yml` | TypeScript | Mempool monitor |
| `global-search-service` | 7303 | `docker-compose.yml` | TypeScript | Cross-chain search |
| `entity-tagging-service` | — | `docker-compose.yml` | TypeScript | Address / entity labeling |
| `gns-indexer` | — | `docker-compose.ghostx.yml` | TypeScript | GNS zone indexer |
| `ghostdns-indexer` | — | `docker-compose.ghostx.yml` | TypeScript | DNS record indexer |
| `contract-registry-service` | — | `docker-compose.autonomy.yml` | TypeScript | On-chain contract registry |
| `contract-risk-service` | — | `docker-compose.autonomy.yml` | TypeScript | Contract risk classifier |
| `bridge-service` | — | `docker-compose.yml` | TypeScript | Bridge event tracker |
| **GhostX, GNS, Gas** | | | | |
| `ghostx-api` | 8100 | `docker-compose.ghostx.yml` | TypeScript | GhostXchange trading API |
| `gns-api` | 8200 | `docker-compose.ghostx.yml` | TypeScript | Ghost Name Service API |
| `ghostdns-resolver` | 5353 | `docker-compose.ghostx.yml` | Node.js | Recursive DNS resolver |
| `ghostload-controller` | 8300 | `docker-compose.yml` | Go/nginx | L7 load balancer controller |
| `ghost-gas-engine` | 8400 | `docker-compose.ghostx.yml` | TypeScript | Gas market engine |
| `ghost-gas-engine-worker` | — | `docker-compose.ghostx.yml` | TypeScript | Gas engine async jobs |
| `gas-engine-postgres` | 5432 (internal) | `docker-compose.ghostx.yml` | PostgreSQL | Gas market database |
| `gas-engine-redis` | — | `docker-compose.ghostx.yml` | Redis | Gas engine cache |
| `gas-engine-migrate` | — | `docker-compose.ghostx.yml` | Node.js | Gas DB migration runner |
| **Node & VM Management** | | | | |
| `ghost-sync-sentinel` | — | `docker-compose.autonomy.yml` | TypeScript | State sync watchdog |
| `upgrade-orchestrator-service` | — | `docker-compose.autonomy.yml` | TypeScript | Coordinated node upgrades |
| `network-context-service` | 7633 (host:17633) | `docker-compose.autonomy.yml` | TypeScript | Network topology context |
| `node-health-service` | — | `docker-compose.autonomy.yml` | TypeScript | Node health aggregator |
| `node-inventory-service` | — | `docker-compose.autonomy.yml` | TypeScript | Node inventory tracker |
| `peer-graph-service` | — | `docker-compose.autonomy.yml` | TypeScript | P2P peer graph mapper |
| `snapshot-service` | — | `docker-compose.autonomy.yml` | TypeScript | Chain snapshot manager |
| `preconfirm-service` | — | `docker-compose.autonomy.yml` | TypeScript | Pre-confirmation service |
| `proxy-inspector-service` | — | `docker-compose.autonomy.yml` | TypeScript | Proxy health inspector |
| `command-palette-service` | — | `docker-compose.autonomy.yml` | TypeScript | Unified command dispatcher |
| `transfer-lifecycle-service` | — | `docker-compose.autonomy.yml` | TypeScript | Transfer state machine |
| `theme-service` | — | `docker-compose.autonomy.yml` | TypeScript | UI theme + branding service |
| `ghost-consensus` | — | `docker-compose.ai-consensus.yml` | TypeScript | Consensus management adapter |
| `ghostdns-attestor` | — | `docker-compose.autonomy.yml` | TypeScript | DNS record attestation |
| `dtn-relay` | — | `docker-compose.autonomy.yml` | TypeScript | Delay-tolerant networking relay |
| **Data Stores (own containers)** | | | | |
| `gns-postgres` | 5432@10.50.99.32 | `docker-compose.ghostx.yml` | PostgreSQL | GNS zone records |
| `pil-postgres` | — | `docker-compose.phase3.yml` | PostgreSQL | PIL data store |
| `pil-migrate` | — | `docker-compose.phase3.yml` | Node.js | PIL DB migration runner |
| `ghostbrain-nats` | 4222 | `docker-compose.ghostbrain.yml` | NATS | JetStream message bus |

> **Total: 150+ named services.** The `ghostbrain-nats` JetStream instance (port 4222) is the shared message backbone.

---

## 3. AI Orchestration — Deep Wiring

### 3.1 Environment Variable Wiring Map

Every service connection is expressed as environment variables defined in `services/stack.env`.  
Key variables and which services they link:

```
CONTROL_PLANE_HMAC_SECRET        → ghostbrain-core, ghostbrain-gsa,
                                    governance-event-bridge, host-orchestrator-ai,
                                    hyper-ghost-supervisor, all agent-node instances
                                    (HMAC-SHA256 auth on every BrainMessage)

NATS_URL=nats://ghostbrain-nats:4222
                                 → ghostbrain-core, ghostbrain-gsa, ghost-registry,
                                    ai-monitor, ai-clock-sync, anomaly-detection-service,
                                    ghost-sync-sentinel, upgrade-orchestrator-service,
                                    agent-node (N instances)

GHOSTBRAIN_URL=http://ghostbrain-core:7900
                                 → governance-event-bridge, hyper-ghost-ai,
                                    hyper-ghost-supervisor, host-orchestrator-ai,
                                    agent-node (all callers of /api/v1/signal
                                    and /api/v1/think)

HYPER_GHOST_AI_URL=http://hyper-ghost-ai:7741 (localhost-bound in prod)
                                 → ghostbrain-core (escalation target)
                                    hg-risk-oracle, hg-treasury-agent

HG_RISK_ORACLE_URL               → treasury-engine, liquidity-router,
                                    hyper-ghost-governor

GHOST_REGISTRY_URL=http://ghost-registry:8088
                                 → ghostbrain-core, apps/api, network-context-service

GOVERNOR_ADDRESS_L1              → governance-event-bridge, governance-service
GOVERNOR_ADDRESS_L2              → governance-event-bridge

L1_RPC_URL=http://ghostchain-node1:18545
L2_RPC_URL=http://l2-geth:29545
L3_RPC_URL=http://l3-geth:39545   → ghost-relayer, ghostchain-bridge-hub,
                                    governance-event-bridge, treasury-engine,
                                    liquidity-router, chain-status-service,
                                    consensus-telemetry-service, ghostscout-l1/l2/l3
```

### 3.2 NATS JetStream Subject Taxonomy

NATS is the backbone for all asynchronous AI events. Subjects follow a `domain.noun.verb` convention:

```
Brain & Swarm
  brain.plan.created          → ghostbrain-core publishes, ghostbrain-gsa subscribes
  brain.plan.completed        → ghostbrain-gsa publishes, ghostbrain-core subscribes
  brain.incident.detected     → ai-monitor/anomaly-detection publishes
  brain.incident.resolved     → ghostbrain-core publishes

Infrastructure
  infra.vm.health             → hyper-ghost-supervisor publishes
  infra.vm.action             → host-orchestrator-ai subscribes
  infra.container.action      → host-orchestrator-ai subscribes
  infra.upgrade.requested     → upgrade-orchestrator-service subscribes

Network
  network.anomaly.detected    → anomaly-detection-service publishes
  network.sync.drift          → ghost-sync-sentinel publishes
  network.peer.connected      → peer-graph-service publishes
  network.peer.dropped        → peer-graph-service publishes

Chain Events (via governance-event-bridge)
  governance.proposal.created → governance-event-bridge publishes → ghostbrain-core
  governance.vote.cast        → governance-event-bridge publishes
  governance.queued           → governance-event-bridge publishes
  governance.executed         → governance-event-bridge publishes

Observability
  metrics.chain.head          → chain-status-service publishes
  metrics.finality.lag        → consensus-telemetry-service publishes
  alert.triggered             → alerts-service publishes → notifications-service
```

### 3.3 ghostbrain-core Route Map

`ghostbrain-core` (port 7900) exposes these routes, consumed by all AI services:

```
POST /api/v1/signal           ← Inbound BrainMessage from any agent/bridge
     Headers: X-HMAC-Timestamp, X-HMAC-Signature, X-Agent-Id
     Body: { subject, payload, timestamp, nonce }
     Auth: HMAC-SHA256(timestamp:rawBody) vs CONTROL_PLANE_HMAC_SECRET

     Recognized subjects:
       governance.proposal.created  → triggers internal analyze_governance_proposal
       governance.vote.cast
       governance.queued
       governance.executed
       brain.*                      → plan/incident lifecycle updates
       infra.*                      → infrastructure events
       network.*                    → network events
       metrics.*                    → observability events

POST /api/v1/think            ← Synchronous AI reasoning request
     Body: { task, context }
     Supported tasks:
       analyze_governance_proposal  → risk classification (high/medium/low)
       analyze_incident             → P0-P3 severity classification
       plan_infra_action            → infrastructure plan generation
       evaluate_economic_policy     → treasury/fee policy evaluation

GET  /api/v1/status           ← Brain health status
GET  /api/v1/plans            ← Active plan list
GET  /api/v1/ledger           ← Signal ledger (ring buffer)
POST /api/v1/execute          ← Execute a named plan step
```

### 3.4 BrainMessage Wire Format

Every inbound signal to ghostbrain-core must conform to:

```typescript
interface BrainMessage {
  subject:   string;       // NATS-style dot-path (e.g. "governance.proposal.created")
  payload:   unknown;      // Arbitrary JSON payload
  timestamp: number;       // Unix epoch milliseconds
  nonce:     string;       // uuid v4 (replay-protection)
}

// HMAC signing (all senders must implement)
const mac = createHmac("sha256", CONTROL_PLANE_HMAC_SECRET)
  .update(`${timestamp}:${rawBody}`)
  .digest("hex");
// Headers on POST /api/v1/signal:
//   X-HMAC-Timestamp: timestamp
//   X-HMAC-Signature: mac
//   X-Agent-Id:       "<service-name>"
```

### 3.5 AI Decision Hierarchy (Full Chain)

```
┌───────────────────────────────────────────────────────────────────┐
│  LEVEL 1: ghost-consciousness  (global strategy, longest horizon)  │
│  package: packages/ghost-consciousness                             │
│  Not yet containerized in Phase 1–3; injected as SDK module       │
└────────────────────────────┬──────────────────────────────────────┘
                             │ escalation (metrics + sentiment)
┌────────────────────────────▼──────────────────────────────────────┐
│  LEVEL 2: hyper-ghost-ai  (port 7741, localhost-bound)            │
│  Tactical decisions: resource allocation, cross-service strategy  │
│  Calls: hg-risk-oracle, hg-treasury-agent, hyper-ghost-governor   │
└────────────────────────────┬──────────────────────────────────────┘
                             │ plans + signals
┌────────────────────────────▼──────────────────────────────────────┐
│  LEVEL 3: ghostbrain-core  (port 7900)                            │
│  Plan execution, incident lifecycle, signal ledger, think API     │
│  Publishes via NATS; triggers ghostbrain-gsa for swarm dispatch   │
└────────────────────────────┬──────────────────────────────────────┘
                             │ sub-task dispatch
┌────────────────────────────▼──────────────────────────────────────┐
│  LEVEL 4: ghostbrain-gsa  (port 7901)                             │
│  Swarm coordinator: routes tasks to specialist AI services        │
│  Aggregates results; escalates failures to Level 3                │
└────────────────────────────┬──────────────────────────────────────┘
                             │ leaf execution
┌────────────────────────────▼──────────────────────────────────────┐
│  LEVEL 5: agent-node (N instances)  + specialist AI services      │
│  ghost-ai-attestor, ghost-ai-consensus, anomaly-detection, etc.   │
│  Each reports back via /api/v1/signal                             │
└────────────────────────────┬──────────────────────────────────────┘
                             │ infra commands
┌────────────────────────────▼──────────────────────────────────────┐
│  LEVEL 6: host-orchestrator-ai  (port 7902)                       │
│  Executes: virsh start/stop/migrate, docker compose up/down       │
│  Reports: infra.vm.health, infra.container.action events          │
└───────────────────────────────────────────────────────────────────┘
```

### 3.6 Governance Event Pipeline (Full Loop)

This is the pipeline built in the `governance-event-bridge` service (the gap closed in Session 1):

```
On-Chain (GhostChain L1 + GhostL2)
  GhostChainGovernor.sol
    emit ProposalCreated(id, proposer, target, constitutional, amendment)
    emit VoteCast(id, voter, support, weight)
    emit Queued(id, queueId, eta, delaySeconds)
    emit Executed(id, queueId)
         │
         │  eth_getLogs (polling every POLL_INTERVAL_MS, cap LOG_BLOCK_RANGE blocks)
         ▼
services/governance-event-bridge/
  src/rpc.ts          ← pure fetch JSON-RPC  (no ethers)
  src/events.ts       ← topic0 keccak256 matching + ABI decode
  src/state.ts        ← persists lastBlock per network to STATE_FILE
  src/brain.ts        ← BrainPoster: HMAC-signs + POSTs to ghostbrain-core
  src/index.ts        ← main polling loop (L1 + L2 in sequence per tick)
         │
         │  POST /api/v1/signal (HMAC-signed BrainMessage)
         ▼
services/ghostbrain-core/src/routes/signals.ts
  GOVERNANCE_SUBJECTS set:
    "governance.proposal.created" → store in ledger → inject /api/v1/think
    "governance.vote.cast"        → store in ledger
    "governance.queued"           → store in ledger
    "governance.executed"         → store in ledger
         │
         │  internal app.inject() → fire-and-forget
         ▼
services/ghostbrain-core/src/routes/think.ts
  task: "analyze_governance_proposal"
    if constitutional  → risk = "high"
    if amendment       → risk = "medium"
    else               → risk = "low"
    if layer = "l1"    → elevate one tier
    assigns: requiresSupermajority, requiresExtendedPeriod, requiresGovernorApproval
```

---

## 4. SDK Architecture

### 4.1 The Dual-SDK Architecture

The repo ships two parallel SDK surfaces. This is a known architecture tension, not a bug:

```
packages/
  ghost-sdk/        ← PRIMARY consumer path (index exports ghost-sdk-core via ethers shims)
  ghost-sdk-core/   ← NATIVE layer (no ethers, pure fetch + HMAC)

Resolution: import ghost from "ghost"
  → resolves via pnpm-workspace.yaml to packages/ghost-sdk
  → ghost-sdk internally re-exports ghost-sdk-core primitives
    wrapped with ethers v6 compatibility shims
```

**When to use which:**

| Use Case | Package |
|----------|---------|
| dApp / browser wallet integration | `ghost-sdk` (ethers-wrapped) |
| Internal TypeScript services | `ghost-sdk-core` (native, no ethers) |
| Server-side scripts / CLI | `ghost-sdk-core` |
| Smart contract tests | `ghost-sdk` via `hardhat-ghost` |
| Cross-chain routing enforcement | `routing-guard` + `routing-law` |

### 4.2 ghost-sdk-core Internal Structure

```
packages/ghost-sdk-core/src/
├── index.ts                 ← barrel export
├── provider/
│   └── GhostProvider.ts     ← fetch-based JSON-RPC provider
├── wallet/
│   ├── GhostWallet.ts       ← key management + signing
│   └── GhostSigner.ts       ← EIP-712 typed data signer
├── contract/
│   └── GhostContract.ts     ← ABI encode/decode + call builder
├── transaction/
│   └── GhostTransaction.ts  ← tx encode + broadcast
├── gas/
│   └── GhostGasEngine.ts    ← gas estimation + fee oracle
├── rpc/
│   └── GhostJsonRpc.ts      ← raw JSON-RPC request wrapper
├── registry/
│   └── GhostNetworkRegistry.ts  ← multi-chain network config registry
└── routing/
    └── GhostCrossChainRouter.ts ← cross-chain route planner (L3→L2→L1 law)
```

### 4.3 Package Dependency Graph

```
@ghost/types (no deps)
     │
     ├── @ghost/contract-schemas
     ├── @ghost/routing-law          (Zod-validated routing invariants)
     ├── @ghost/ghostdns-types
     └── @ghost/ghostload-policy

@ghost/pq-crypto (no external deps)

@ghost/ghost-sdk-core
     ├── @ghost/types
     ├── @ghost/routing-law
     └── @ghost/pq-crypto

@ghost/ghost-sdk
     ├── @ghost/ghost-sdk-core
     ├── @ghost/types
     └── ethers v6                   ← ONLY place ethers is a direct dep

@ghost/routing-guard
     ├── @ghost/routing-law
     └── @ghost/ghost-sdk-core

@ghost/ghostwallet
     └── @ghost/ghost-sdk-core

@ghost/ghostchain-sdk
     ├── @ghost/ghost-sdk
     └── @ghost/hardhat-ghost

@ghost/ghost-ai-sdk
     ├── @ghost/types
     └── @ghost/ghost-sdk-core       (calls HMAC-signed brain endpoints)

@ghost/ghost-swarm
     ├── @ghost/ghost-ai-sdk
     └── nats (JetStream client)

@ghost/ghost-cognitive
     └── @ghost/ghost-ai-sdk

@ghost/ghost-consciousness
     ├── @ghost/ghost-cognitive
     └── @ghost/ghost-swarm

@ghost/ghost-autonomous
     ├── @ghost/ghost-consciousness
     └── @ghost/ghost-infra

@ghost/governance-bundle
     ├── @ghost/contract-schemas
     └── @ghost/ghost-sdk-core

@ghost/ghost-devkit
     ├── @ghost/ghost-sdk
     └── @ghost/hardhat-ghost

@ghost/ui
     └── @ghost/brand-enforcer

@ghost/dtn-cli
     └── @ghost/ghost-sdk-core
```

### 4.4 SDK Migration Path (ethers → native)

For services currently using `ghost-sdk` (ethers-wrapped) that need to migrate to `ghost-sdk-core` (native):

```
Phase 1  Use ghost-sdk-core alongside ghost-sdk in the same service.
         Import specific primitives: GhostProvider, GhostWallet, GhostContract.
         Keep ethers only for ABI encoding if needed.

Phase 2  Replace ethers.providers.JsonRpcProvider → GhostProvider.
         Replace ethers.Wallet → GhostWallet + GhostSigner.
         Replace ethers.Contract → GhostContract.

Phase 3  Remove ethers from service package.json devDependencies.
         Use ghost-sdk as a re-export shim only in browser-facing apps.

Compatibility shim (planned):
  packages/ghost-sdk/src/compat/ethers-bridge.ts
  Provides: formatEther, parseEther, keccak256, etc.
  from ghost-sdk-core primitives without pulling ethers itself.
```

---

## 5. Validator Infrastructure

### 5.1 L1 GhostChain IBFT Validators

GhostChain L1 uses Istanbul BFT (IBFT 2.0) consensus. Each validator is a dedicated KVM VM.

#### Validator VM Topology

| VM | IP | vCPU | RAM | Disk | Role |
|----|-----|------|-----|------|------|
| `ghost-ghostchain-bootnode-1` | 10.50.99.20 | 2 | 4 GB | 50 GB | P2P discovery seed |
| `ghost-ghostchain-node1-1` | 10.50.99.21 | 4 | 8 GB | 200 GB | IBFT validator 1 (active) |
| `ghost-ghostchain-node2-1` | 10.50.99.22 | 4 | 8 GB | 200 GB | IBFT validator 2 (active) |
| `ghost-mainnet-validator` | 10.50.99.72 | 8 | 16 GB | 500 GB | Mainnet IBFT validator |
| `ghost-testnet-validator` | 10.50.99.73 | 4 | 8 GB | 100 GB | Testnet IBFT validator |

#### Key Storage Architecture

```
infra/ghostchain/
  ibft/                         ← Per-node IBFT key storage
    node1/
      nodekey                   ← P2P identity key (secp256k1)
      nodekey.pub               ← P2P public key
    node2/
      nodekey
      nodekey.pub
    bootnode/
      nodekey
      nodekey.pub
  secrets/                      ← Validator signing keys (gitignored)
    validator1.key              ← IBFT validator account private key
    validator2.key              ← IBFT validator account private key

Rule: Validator keys NEVER leave the VM disk. key-rotation-service
      generates new keys inside the VM via SSH, signs a rotation tx,
      and submits it to GhostChainGovernor for on-chain validator set update.
```

#### IBFT Configuration

```
infra/ghostchain/config/
  genesis.json                  ← L1 genesis block
    .config.ibft2               ← IBFT 2.0 consensus params:
      blockperiodseconds: 4     ← ~4s block time
      epochlength: 30000
      requesttimeoutseconds: 8
    .config.chainId: 14000101
    .alloc/                     ← Genesis allocation (see alloc_merged.json)
      GST contract              ← 0x5FbDB2315678afecb367f032d93F642f64180aa3
      validator1 key            ← Initial staking balance
      validator2 key            ← Initial staking balance
      treasury address          ← Initial treasury balance
```

#### L2/L3 OP Stack Validators (Sequencers)

```
L2 Sequencer:   op-node at 10.50.99.76 (mainnet) / 10.50.99.77 (testnet)
L3 Sequencer:   l3-op-node at 10.50.99.78 (mainnet) / 10.50.99.79 (testnet)

Key locations (OP Stack):
  infra/opstack/.env            ← GS_BATCHER_PRIVATE_KEY (op-batcher)
                                   GS_PROPOSER_PRIVATE_KEY (op-proposer)
                                   GS_SEQUENCER_PRIVATE_KEY (op-node JWT)

Block periods:
  L2:  2s (op-node sequencer window)
  L3:  2s (l3-op-node sequencer window)
  Batch submission: every ~2 min (op-batcher)
  Output root posting: every ~1 hr (op-proposer)
```

### 5.2 Validator Services (Off-Chain)

| Service | Port | Role |
|---------|------|------|
| `validator-service` | 7403 | Validator registry; CRUD for validator set |
| `staking-service` | 7402 | GST staking + delegation management |
| `slashing-detection-service` | — | Monitors equivocation / downtime / double-vote |
| `rewards-service` | 7404 | Per-epoch reward computation |
| `reward-distributor` | — | Executes payout on-chain or via treasury |
| `participation-service` | 7405 | Quorum + voting participation tracking |
| `key-rotation-service` | — | Schedules + executes validator key rotation |
| `dispute-service` | — | Arbitrates on-chain fraud proofs (OP Stack) |
| `ghost-rollup-challenger` | — | Submits fraud proofs against invalid outputs |

### 5.3 Slashing Detection Flow

```
slashing-detection-service polls chain data (every block)
  │
  ├─ Equivocation: same validator signed two conflicting blocks at same height
  │     → emits: brain.incident.detected subject "validator.equivocation"
  │
  ├─ Downtime: validator missed >10 consecutive blocks
  │     → emits: brain.incident.detected subject "validator.downtime"
  │
  └─ Double vote: validator cast two votes on same IBFT round
        → emits: brain.incident.detected subject "validator.double-vote"

ghostbrain-core receives incident:
  → classifies P0/P1 (validator security = always P0)
  → dispatches to dispute-service for on-chain slash submission
  → dispatches to key-rotation-service to schedule rotation
  → notifies notifications-service (alert to operator)
```

### 5.4 Validator Key Rotation

```
Trigger:
  - Scheduled (30-day default, config: KEY_ROTATION_INTERVAL_DAYS)
  - Manual: POST /api/v1/rotate-key to key-rotation-service
  - Automatic: after slashing event detected by slashing-detection-service

Process:
  1. key-rotation-service generates new secp256k1 keypair inside target VM
     (via SSH exec or host-orchestrator-ai command)
  2. Signs rotation transaction using old key
  3. Submits tx to GhostChainGovernor.updateValidator(newKey)
  4. Governance proposal if constitutional (validator set changes)
  5. secrets-health-service verifies new key is reachable
  6. Old key archived in infra/ghostchain/secrets/ (encrypted)
  7. audit-log-service records rotation evidence
```

### 5.5 IBFT Validator Set Management

```
Contract: GhostChainGovernor.sol
  - addValidator(address)       ← requires governance supermajority
  - removeValidator(address)    ← requires governance supermajority
  - updateValidator(address, newKey)  ← requires current validator signature

Minimum validators:  4 (IBFT requires f+1 = 3f+1 ≥ 4 for 1 faulty)
Current mainnet:     2 (devnet/testnet bootstrap — expand before mainnet launch)
Recommended mainnet: 7 or 13 validators (optimal BFT fault-tolerance)

Validator eligibility (validator-service):
  - Minimum stake:  10,000 GST
  - Uptime SLA:     >98.5% (participation-service enforces)
  - KYC/AML:        ghost-compliance must return "approved" for operator
```

---

## 6. Deployment Automation

All deployment is driven by scripts in `infra/scripts/` and contract scripts in `contracts/scripts/`.  
Every script in this section is real and present in the workspace.

### 6.1 Full Stack Startup Order

```
STEP 1 — Infrastructure prerequisites
  bash infrastructure/scripts/genesis-install.sh
    Installs: pnpm, Docker, libvirt, KVM, Ansible, Terraform
    Creates: KVM network "gs-mgmt" (10.50.99.0/24, bridge virbr-ghoststack)
    Generates: IBFT genesis, validator keys (infra/ghostchain/ibft/, secrets/)
    Creates: all .env files from stack.env.example

STEP 2 — VM fleet boot (KVM)
  bash infra/hypervisor/up.sh (or virsh for manual control)
  Boot order: ghost-web → ghost-dns-slave → ghostchain-bootnode →
              node1 → node2 → gns-bind9 → gns-kea → gns-postgres →
              gns-indexer → gns-api → devnet/testnet/mainnet VMs

STEP 3 — L1 GhostChain
  cd infra/ghostchain && bash scripts/up.sh
  Starts: docker-compose.l1.yml (ghostchain-bootnode, node1, node2, rpc-proxy)
  Starts: docker-compose.ibft.yml (IBFT consensus cluster)
  Verify: bash scripts/health.sh

STEP 4 — Deploy L1 contracts
  cd contracts && pnpm run deploy:l1
  → scripts/deploy_l1.ts (Hardhat, network "ghostchain")
  Deploys: GhostSettlementToken, GhostChainGovernor, bridge contracts,
           staking contracts, AICommandCenter, GhostBrainIntegration
  Also: pnpm run deploy:ai      → scripts/deploy_ai_layers.ts
  Also: pnpm run deploy:lge     → scripts/deploy_liquidity_gravity.ts

STEP 5 — OP Stack L2
  cd infra/opstack && docker compose -f docker-compose.yml up -d
  Starts: l2-geth, op-node, op-batcher, op-proposer
  Verify: curl http://localhost:29545/health

STEP 6 — Deploy L2 contracts (if any)
  cd contracts && pnpm run deploy:l2

STEP 7 — OP Stack L3 (optional)
  cd infra/opstack && docker compose -f docker-compose.l3.yml up -d
  Starts: l3-geth, l3-op-node, l3-op-batcher, l3-op-proposer

STEP 8 — GhostBrain AI stack
  docker compose -f docker-compose.ghostbrain.yml up -d
  Starts: ghostbrain-nats, ghostbrain-core, ghostbrain-gsa,
          host-orchestrator-ai, hyper-ghost-supervisor,
          governance-event-bridge ✨

STEP 9 — Compliance + governance services
  docker compose -f docker-compose.phase3.yml up -d
  Starts: auth-service, ghost-guard, ghost-jwks-guard, rbac-service,
          session-service, ghost-compliance, ghost-pil,
          governance-service, staking-service, validator-service, ...

STEP 10 — Autonomy AI services
  docker compose -f docker-compose.autonomy.yml up -d
  Starts: ghost-registry, network-context-service, anomaly-detection,
          ai-monitor, ai-clock-sync, ai-policy, ai-vault,
          ghost-sync-sentinel, upgrade-orchestrator-service, ...

STEP 11 — Agent swarm
  docker compose -f docker-compose.agents.yml up -d
  Starts: agent-node (multiple replicas), agent-registry-service

STEP 12 — AI consensus layer
  docker compose -f docker-compose.ai-consensus.yml up -d
  Starts: ghost-ai-consensus, ghost-ai-attestor

STEP 13 — Economics services
  docker compose -f docker-compose.econ.mainnet.yml up -d
  Starts: treasury-service, treasury-engine, treasury-ai, treasury-evidence,
          l3-fee-collector, l2-revenue-aggregator, reward-distributor,
          liquidity-router, liquidity-prover, ...

STEP 14 — GhostX, GNS, Gas engine, Explorer
  docker compose -f docker-compose.ghostx.yml up -d
  Starts: ghostx-api, gns-api, ghost-gas-engine, ghostscout-l1/l2/l3,
          ghostscout-frontend-l1/l2/l3, ghostdns-resolver, ghostload-controller

STEP 15 — Control plane (API + Web)
  docker compose -f apps/docker-compose.yml up -d
  Starts: apps/api, apps/web, apps/worker

STEP 16 — Observability
  docker compose -f docker-compose.yml up -d prometheus grafana loki alertmanager

STEP 17 — Health check
  bash infra/scripts/doctor.sh
  bash infra/scripts/doctor-l1.sh
  bash infra/scripts/doctor-l2.sh
  bash infra/scripts/doctor-l3.sh
```

### 6.2 One-Command Shortcuts

```bash
# Full stack (all steps 3–16 in order):
bash infra/scripts/up-full.sh

# Full health check:
bash infra/scripts/doctor.sh

# One-click testnet (contracts + all stacks on testnet):
cd contracts && npx hardhat run scripts/one_click_testnet.ts --network ghostchain-testnet

# Graceful shutdown:
bash infra/scripts/down.sh

# Full reset (wipe state, regenesis):
bash infra/scripts/reset.sh
```

### 6.3 Contract Deployment Scripts Reference

```
contracts/scripts/
  deploy_all.ts           ← Deploy everything to a target network in order
  deploy_l1.ts            ← L1-only: GST, Governor, staking, bridge, AI contracts
  deploy_l2.ts            ← L2-only: OP bridges, L2 governance
  deploy_l3.ts            ← L3-only: L3 bridges, L3 settlement
  deploy_ai_layers.ts     ← AI contracts: AICommandCenter, GhostBrainIntegration,
                             AILayerGuardian, GhostRiskOracle
  deploy_liquidity_gravity.ts ← LGE: LoadBalancerVault, AdapterRegistry,
                             SettlementOracle, RewardRouter, CircuitBreaker,
                             OperatorBondVault
  one_click_testnet.ts    ← All of the above for testnet
  run_slither.ts          ← Static analysis (Slither)
  run_echidna.ts          ← Fuzzing (Echidna)
  run_foundry_tests.ts    ← Foundry test suite runner
```

### 6.4 Deployment Per Environment

| Environment | Chain RPC | Contract Script | Compose Suffix |
|-------------|-----------|----------------|----------------|
| Devnet | http://ghostchain-devnet:18545 | `--network ghostchain-devnet` | `.econ.devnet.yml` |
| Testnet | http://10.50.99.71:18545 | `--network ghostchain-testnet` | `.econ.testnet.yml` / `compose.testnet.yml` |
| Mainnet | http://10.50.99.70:18545 | `--network ghostchain` | `.econ.mainnet.yml` / `docker-compose.sovereign.yml` |

### 6.5 Kubernetes / Helm Deployment (Cloud)

For cloud / K8s environments (EKS or GKE):

```bash
# Provision cluster
cd infra/terraform/eks && terraform init && bash terraform-plan.sh && terraform apply
# or GKE:
cd infra/terraform/gke && terraform init && terraform apply

# Deploy Helm charts
cd infra/helm

# Core chain nodes
helm install ghostchain-core ./ghostchain-core \
  --namespace ghostchain --create-namespace \
  -f environments/mainnet/values-core.yaml

# Observability
helm install ghostchain-observability ./ghostchain-observability \
  --namespace monitoring \
  -f environments/mainnet/values-observability.yaml

# Microservices
helm install ghostchain-services ./ghostchain-services \
  --namespace ghostchain \
  -f environments/mainnet/values-services.yaml

# UI
helm install ghostchain-ui ./ghostchain-ui \
  --namespace ghostchain \
  -f environments/mainnet/values-ui.yaml

# Kubernetes manifest overlay (Kustomize)
kubectl apply -k infra/k8s/prod/
```

### 6.6 Rollback Procedures

```bash
# Per-chain rollback to previous container image tag:
bash infra/scripts/rollback-l1.sh [IMAGE_TAG]
bash infra/scripts/rollback-l2.sh [IMAGE_TAG]
bash infra/scripts/rollback-l3.sh [IMAGE_TAG]

# Helm rollback:
helm rollback ghostchain-services [REVISION] -n ghostchain

# Database rollback (if schema migration):
docker compose run --rm migrate pnpm run db:rollback

# Chain state rollback (DANGER — loses finalized blocks):
# Only use in devnet/testnet:
bash infra/scripts/reset.sh  # wipes ALL chain state and re-geneses
```

### 6.7 Security Scanning Pipeline

```bash
# Run all security checks:
bash infra/scripts/security/scan-all.sh

# Static analysis:
cd contracts && npx hardhat run scripts/run_slither.ts

# Fuzzing:
cd contracts && npx hardhat run scripts/run_echidna.ts

# Foundry tests (includes invariant tests):
cd contracts && npx hardhat run scripts/run_foundry_tests.ts

# Container vulnerability scan:
trivy image --secret-config trivy-secret.yaml ghcr.io/ghostchain1/ghostbrain-core:latest

# Evidence pack collection (for audit):
bash infra/scripts/evidence-pack-l1.sh
bash infra/scripts/evidence-pack-l2.sh
bash infra/scripts/evidence-pack-l3.sh
bash infra/scripts/evidence-pack-ai-governance.sh
```

### 6.8 Environment Sync

When chain state is deployed (new contracts, new genesis), sync env vars across all services:

```bash
bash infra/scripts/env-sync-l1.sh      # writes L1 contract addrs to stack.env
bash infra/scripts/env-sync-l2.sh      # writes L2 addresses
bash infra/scripts/env-sync-l3.sh      # writes L3 addresses
bash infra/scripts/env-sync-stack.sh   # syncs entire stack.env to all services
```

---

## Appendix A: Port Allocation Reference

```
3000  Grafana
3001  ghostscout-frontend-l1
3002  ghostscout-frontend-l2
3003  ghostscout-frontend-l3
3100  Loki
3200  apps/web (Next.js)
4000  apps/api (Express) / ghostscout-l1 backend
4001  ghostscout-l2 backend
4002  ghostscout-l3 backend
4222  ghostbrain-nats (NATS JetStream)
5353  ghostdns-resolver
5432  postgres (main) / gns-postgres
6379  redis (main)
7300  block-index-service
7301  tx-index-service
7302  mempool-service
7303  global-search-service
7400  governance-service
7401  hyper-ghost-governor
7402  staking-service
7403  validator-service
7404  rewards-service
7405  participation-service
7500  treasury-service
7501  treasury-engine
7502  treasury-ai
7503  treasury-evidence
7600  alerts-service
7601  notifications-service
7602  consensus-telemetry-service
7603  chain-status-service
7633  network-context-service (host: 17633)
7700  auth-service
7701  ghost-guard
7702  ghost-jwks-guard
7703  rbac-service
7704  session-service
7705  audit-log-service
7741  hyper-ghost-ai (localhost-bound)
7800  ghost-compliance
7850  ghostbrain-gsa (localhost: 7901)
7900  ghostbrain-core
7901  ghostbrain-gsa
7902  host-orchestrator-ai
7903  hyper-ghost-supervisor
8080  ghost-relayer
8088  ghost-registry (host: 28088)
8090  ghostchain-bridge-hub
8100  ghostx-api
8200  gns-api
8300  ghostload-controller
8400  ghost-gas-engine
9090  Prometheus
9093  Alertmanager
18545 L1 JSON-RPC (ghost-rpc-proxy)
18546 L1 WebSocket
18551 L1 AuthRPC (Engine API)
29545 L2 JSON-RPC (l2-geth)
29546 L2 WebSocket
29547 L2 AuthRPC (op-node ↔ l2-geth)
39545 L3 JSON-RPC (l3-geth)
39546 L3 WebSocket
39547 L3 AuthRPC (l3-op-node ↔ l3-geth)
30303 L1 P2P (devp2p)
30304 L2 P2P
30305 L3 P2P
```

## Appendix B: Critical Invariants

These are hard constraints enforced at multiple layers. Do not violate:

1. **Routing Law:** `L3 → L2 → L1` only. Direct `L3 → L1` is BLOCKED by `routing-guard`, `AILayerGuardian.sol`, and the `routing-law` Zod schema.
2. **HMAC Auth:** Every inbound call to `ghostbrain-core /api/v1/signal` must carry `X-HMAC-Timestamp` + `X-HMAC-Signature` headers. Unsigned signals are rejected with 401.
3. **Container Hardening:** All production containers must use the `x-hardening` Compose extension: `user: 10001:10001`, `cap_drop: ALL`, `no_new_privileges: true`, `read_only: true`, `tmpfs: [/tmp]`.
4. **Validator Key Isolation:** Validator private keys live only on validator VM disks. They are never mounted into the hypervisor host or any other container.
5. **GST Split Invariant:** Treasury allocation is exactly 33%/33%/33% (validators / POL / burn). `RewardRouter.sol` enforces this on-chain. Off-chain `treasury-engine` must not bypass.
6. **L1 Finality Primacy:** GST on L1 is canonical. L2/L3 balances are derived. The bridge flow is always L3 → L2 → L1 for settlement; never reversed.
7. **Constitutional Proposals:** Proposals marked `constitutional=true` in `GhostChainGovernor` require supermajority (>66% approval) and extended voting window. `analyze_governance_proposal` in `ghostbrain-core` enforces this classification.
