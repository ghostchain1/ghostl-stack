# 👻 GhostStack Full Deployment Blueprint

> **Production-grade implementation plan to bring the entire GhostStack ecosystem
> online from scratch on Ubuntu 24.04 / KVM / Docker.**
>
> Repo root: `/home/ghost/ghostl-stack`  
> Generated: 2026-03-06  
> Status: **CANONICAL REFERENCE**

---

## Table of Contents

1. [Exact Folder Structure](#1-exact-folder-structure)
2. [VM Infrastructure Layout](#2-vm-infrastructure-layout)
3. [Docker-Compose Architecture](#3-docker-compose-architecture)
4. [Service Startup Order](#4-service-startup-order)
5. [Infrastructure Automation Scripts](#5-infrastructure-automation-scripts)
6. [Network Configuration & Port Map](#6-network-configuration--port-map)
7. [Environment & Secrets Bootstrap](#7-environment--secrets-bootstrap)
8. [AI System Boot Order](#8-ai-system-boot-order)
9. [Monitoring Stack](#9-monitoring-stack)
10. [One-Command Deployment](#10-one-command-deployment)

---

## 1. Exact Folder Structure

```
/home/ghost/ghostl-stack/
│
├── apps/                           ← User-facing applications
│   ├── api/                        ← Express 5.2 REST API  (port 4000)
│   ├── web/                        ← Next.js 14 App Router (port 3200)
│   ├── ghostx/                     ← GhostX exchange frontend
│   └── worker/                     ← Background job workers
│
├── chains/                         ← Chain genesis & node config
│   ├── l2/                         ← OP Stack L2 config
│   └── l3/                         ← OP Stack L3 config
│
├── config/                         ← Shared runtime config
│   ├── network/                    ← Network bridge definitions
│   ├── dns/                        ← GNS / Bind9 zone files
│   ├── gst-allowlist.txt           ← GST token allowlist
│   └── governance/                 ← Federation policy JSON
│
├── contracts/                      ← Solidity smart contracts (Hardhat + Foundry)
│   ├── src/                        ← Contract source
│   ├── script/                     ← Deployment scripts
│   ├── deployments/                ← On-chain deployment receipts
│   └── foundry.toml
│
├── docs/                           ← Architecture & operational docs
│   ├── GHOSTSTACK_DEPLOYMENT_BLUEPRINT.md  ← THIS FILE
│   ├── MASTER_ARCHITECTURE_BLUEPRINT.md
│   ├── ghostchain-architecture.md
│   ├── service-catalog.md
│   └── ...
│
├── infra/                          ← Infrastructure automation
│   ├── hypervisor/
│   │   ├── provision/              ← VM creation & provisioning scripts
│   │   │   ├── inventory.sh        ← Canonical IP/VM inventory
│   │   │   ├── create-vms.sh       ← Provision all KVM VMs
│   │   │   ├── reprovision-all.sh  ← Update/recreate fleet
│   │   │   ├── ghostchain-l1-provision.sh
│   │   │   ├── ghostl2-provision.sh
│   │   │   ├── ghostl3-provision.sh
│   │   │   └── ...
│   │   └── supervisor/             ← Systemd unit templates
│   ├── docker/                     ← Per-service Dockerfiles
│   ├── ghostchain/                 ← L1 genesis & geth config
│   ├── opstack/                    ← OP Stack deployment configs
│   │   ├── .env.sample
│   │   ├── keys/
│   │   └── ...
│   ├── scripts/                    ← Operational scripts
│   │   ├── up.sh                   ← Start L2+L3 devnet
│   │   ├── up-full.sh              ← Start full stack (L1+L2+L3+services+apps)
│   │   ├── down.sh                 ← Tear everything down
│   │   ├── doctor.sh               ← Health check all endpoints
│   │   ├── doctor-l1.sh / doctor-l2.sh / doctor-l3.sh
│   │   ├── env-sync-l1.sh / env-sync-l2.sh / env-sync-stack.sh
│   │   ├── opstack/
│   │   │   ├── up-l2.sh
│   │   │   ├── up-l3.sh
│   │   │   ├── deploy.sh
│   │   │   └── deploy-l3.sh
│   │   └── ...
│   ├── grafana/                    ← Grafana dashboard JSON
│   ├── prometheus/                 ← Prometheus scrape configs
│   ├── observability/              ← Loki / tracing configs
│   ├── terraform/                  ← IaC (cloud fallback)
│   └── k8s/                        ← Helm charts (optional)
│
├── packages/                       ← TypeScript SDK packages (npm workspace)
│   ├── ghost-consciousness/        ← GCL-Ω global coordination AI
│   ├── ghost-cognitive/            ← Strategic AI / economic engine
│   ├── ghost-swarm/                ← Multi-region swarm agents
│   ├── ghost-autonomous/           ← Autonomous DevOps / self-healing
│   ├── ghost-infra/                ← Infrastructure controller
│   ├── ghost-devkit/               ← Developer tooling
│   ├── ghost-sdk/                  ← Public-facing SDK
│   ├── ghost-sdk-core/             ← Core SDK primitives
│   ├── ghost-ai/                   ← AI model integrations
│   ├── ghost-ai-sdk/               ← AI SDK public surface
│   ├── ghostchain-sdk/             ← Chain interaction SDK
│   ├── ghostwallet/                ← Wallet SDK
│   ├── types/                      ← Shared TypeScript types
│   ├── config/                     ← Shared config schemas
│   ├── contract-schemas/           ← ABI/schema definitions
│   ├── governance-bundle/          ← Governance policy bundle
│   ├── routing-law/                ← Routing policy rules
│   ├── pq-crypto/                  ← Post-quantum crypto primitives
│   └── ...
│
├── services/                       ← 100+ microservices
│   ├── docker-compose.yml          ← Services compose bundle
│   ├── stack.env                   ← Runtime env (gitignored)
│   ├── ghostbrain-core/            ← GhostBrain AI core
│   ├── ghostbrain-gsa/             ← GhostBrain sovereign agent
│   ├── hyper-ghost-ai/             ← Top-level AI orchestrator
│   ├── ghost-ai-consensus/         ← AI consensus engine
│   ├── treasury-engine/            ← Treasury AI engine
│   ├── ghost-relayer/              ← Cross-chain message relay
│   ├── ghostchain-bridge-hub/      ← Bridge hub
│   ├── ghostdns-resolver/          ← DNS resolver
│   └── ...  (100+ services — see docs/service-catalog.md)
│
├── scripts/                        ← Dev & CI utility scripts
│   ├── bootstrap-ubuntu.sh         ← One-shot host bootstrap
│   ├── preflight.sh                ← Pre-deployment validation
│   ├── start-stack-prod.sh         ← Production start helper
│   └── ...
│
├── docker-compose.yml              ← Root compliance stack compose
├── docker-compose.dev.yml          ← Dev API+web compose
├── docker-compose.phase3.yml       ← Phase 3 service compose
├── stack.env.example               ← Environment variable template
└── pnpm-workspace.yaml             ← Monorepo workspace definition
```

---

## 2. VM Infrastructure Layout

All VMs live on network `gs-mgmt` (CIDR `10.50.99.0/24`, gateway `10.50.99.1`).  
Source of truth: [`infra/hypervisor/provision/inventory.sh`](../infra/hypervisor/provision/inventory.sh)

### Hypervisor Host

| Field    | Value                            |
|----------|----------------------------------|
| Hostname | `Ghoststack-baremetal`           |
| OS       | Ubuntu 24.04 LTS                 |
| CPU      | 32+ cores (recommended)          |
| RAM      | 128 GB (recommended)             |
| Storage  | NVMe, 4+ TB                      |
| Virt     | KVM / libvirt                    |

### VM Fleet

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ BOOT ORDER  VM NAME                    IP            vCPU  RAM      DISK  ROLE  │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 1  INFRA                                                                        │
│    ghost-web                      10.50.99.10     2     4 GB     100 GB  web   │
│    ghost-dns-slave                10.50.99.66     1     512 MB    20 GB  dns   │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 2  GHOSTCHAIN L1 NODE CLUSTER                                                   │
│    ghost-ghostchain-bootnode-1    10.50.99.20     1     512 MB    20 GB  boot  │
│    ghost-ghostchain-node1-1       10.50.99.21     2     4 GB     300 GB  node  │
│    ghost-ghostchain-node2-1       10.50.99.22     2     4 GB     300 GB  node  │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 3  GNS (GHOST NAME SERVICE) FLEET                                               │
│    gns-bind9                      10.50.99.30     1     512 MB    20 GB  dns   │
│    gns-kea                        10.50.99.31     1     1 GB      20 GB  dhcp  │
│    gns-postgres                   10.50.99.32     2     2 GB     100 GB  db    │
│    gns-indexer                    10.50.99.33     2     2 GB      50 GB  idx   │
│    gns-api                        10.50.99.34     2     1 GB      30 GB  api   │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 4  DEVNET / TEST                                                                │
│    ghostchain-devnet              38.247.149.219  4     8 GB     300 GB  dev   │
│    ghostchain-testnet-l1          10.50.99.71     2     2 GB     200 GB  l1    │
│    ghost-testnet-validator        10.50.99.73     2     2 GB     100 GB  val   │
│    ghostl2-testnet                10.50.99.77     2     4 GB     120 GB  l2    │
│    ghostl3-testnet                10.50.99.79     2     4 GB     120 GB  l3    │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 5  MAINNET                                                                      │
│    ghostchain-mainnet-l1          10.50.99.70     2     6 GB     500 GB  l1    │
│    ghost-mainnet-validator        10.50.99.72     2     4 GB     200 GB  val   │
│    ghostl2-mainnet                10.50.99.76     2     4 GB     300 GB  l2    │
│    ghostl3-mainnet                10.50.99.78     2     4 GB     300 GB  l3    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### VM Provisioning

```bash
# Provision ALL VMs (run as root on hypervisor)
sudo bash infra/hypervisor/provision/create-vms.sh

# Reprovision/update existing fleet
sudo bash infra/hypervisor/provision/reprovision-all.sh

# Individual VM reprovision
sudo bash infra/hypervisor/provision/ghostchain-l1-provision.sh
sudo bash infra/hypervisor/provision/ghostl2-provision.sh
sudo bash infra/hypervisor/provision/ghostl3-provision.sh
```

---

## 3. Docker-Compose Architecture

GhostStack is composed of **five layered compose bundles**. Each layer depends on
the layer below it being healthy before starting.

```
Layer 5 ── apps compose     (docker-compose.dev.yml)     → API + Web
Layer 4 ── services compose (services/docker-compose.yml) → 100+ microservices
Layer 3 ── compliance       (docker-compose.yml)          → ghost-compliance + postgres + redis
Layer 2 ── OP Stack / L2+L3 (infra/opstack/)              → op-node, op-geth, batcher, proposer
Layer 1 ── GhostChain L1    (infra/ghostchain/)           → geth PoA nodes + bootnode
```

### Layer 1 — GhostChain L1 (chainId 14000101, GST)

```yaml
# infra/ghostchain/docker-compose.yml (excerpt)
services:
  ghostchain-bootnode:
    image: ethereum/client-go:v1.14.8
    command: >
      geth --datadir /data --networkid 14000101
           --nodekey /keys/bootnode.key --nodiscover --v5disc
    ports:  ["30303:30303/udp"]
    volumes: ["./data/bootnode:/data", "./keys:/keys"]

  ghostchain-node1:
    image: ethereum/client-go:v1.14.8
    command: >
      geth --datadir /data --networkid 14000101
           --http --http.addr 0.0.0.0 --http.port 8545
           --ws  --ws.addr  0.0.0.0 --ws.port  8546
           --bootnodes enode://<bootnode-pubkey>@ghostchain-bootnode:30303
           --mine --miner.etherbase <validator-address>
    ports:
      - "18545:8545"   # L1 RPC (HTTP)
      - "18546:8546"   # L1 RPC (WS)
    volumes: ["./data/node1:/data", "./genesis:/genesis", "./keys:/keys"]

  ghostchain-node2:
    image: ethereum/client-go:v1.14.8
    # same flags as node1, different datadir
    ports:
      - "18547:8545"
      - "18548:8546"
```

### Layer 2 — OP Stack L2 (settles to L1)

```yaml
# infra/opstack/docker-compose.l2.yml (excerpt)
services:
  op-geth-l2:
    image: us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth:v1.101408.0
    ports:
      - "29545:8545"   # L2 RPC (HTTP)
      - "29546:8546"   # L2 RPC (WS)
      - "29547:8547"   # L2 authrpc (engine API)
    volumes: ["op-geth-l2-data:/data", "./config/l2:/config"]

  op-node-l2:
    image: us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:v1.10.0
    command: --l1=http://ghostchain-node1:8545 ...
    ports: ["9545:9545", "9546:9546"]
    depends_on: [op-geth-l2]

  op-batcher-l2:
    image: us-docker.pkg.dev/oplabs-tools-artifacts/images/op-batcher:v1.10.0
    depends_on: [op-node-l2, op-geth-l2]

  op-proposer-l2:
    image: us-docker.pkg.dev/oplabs-tools-artifacts/images/op-proposer:v1.10.0
    depends_on: [op-node-l2]
```

### Layer 3 — OP Stack L3 (settles to L2)

```yaml
# infra/opstack/docker-compose.l3.yml (excerpt)
services:
  l3-geth:
    image: us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth:v1.101408.0
    ports:
      - "39545:8545"   # L3 RPC (HTTP)
      - "39546:8546"   # L3 RPC (WS)
      - "39547:8547"   # L3 authrpc

  l3-op-node:
    image: us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:v1.10.0
    command: --l1=http://op-geth-l2:8545 ...
    depends_on: [l3-geth]

  l3-op-batcher:
    image: us-docker.pkg.dev/oplabs-tools-artifacts/images/op-batcher:v1.10.0

  l3-op-proposer:
    image: us-docker.pkg.dev/oplabs-tools-artifacts/images/op-proposer:v1.10.0
```

### Layer 4 — Core Services (100+ microservices)

Key dependency topology for `services/docker-compose.yml`:

```
postgres / redis / rabbitmq        ← shared data-plane dependencies
    │
    ├── ghost-guard                ← JWT / JWKS auth gate      (port 7070)
    ├── ghost-relayer              ← Cross-chain relay          (port 7171)
    ├── ghost-rollup-proposer      ← L2 output proposer         (port 7272)
    ├── ghost-rollup-proposer-l2   ← L3 output proposer         (port 7273)
    ├── ghost-rollup-challenger    ← Fault challenger            (port 7282)
    ├── bridge-service             ← Bridge coordinator         (port 7300)
    ├── ghostchain-bridge-hub      ← Bridge hub                 (port 7310)
    ├── liquidity-service          ← Liquidity management       (port 7320)
    ├── liquidity-router           ← Route optimizer            (port 7321)
    ├── transfer-lifecycle-service ← TX lifecycle tracking      (port 7330)
    │
    ├── ghostbrain-core            ← GhostBrain AI core         (port 7900)
    ├── ghostbrain-gsa             ← Ghost Sovereign Agent      (port 7901)
    ├── hyper-ghost-ai             ← Top-level AI orchestrator  (port 7902)
    ├── ghost-ai-consensus         ← AI consensus engine        (port 7903)
    ├── ai-monitor                 ← AI anomaly monitor         (port 7910)
    ├── ai-vault                   ← AI secret vault            (port 7920)
    ├── ghost-ai-attestor          ← AI attestation service     (port 7930)
    ├── ghost-ai-contract-engine   ← AI contract analysis       (port 7940)
    ├── anomaly-detection-service  ← Anomaly detection          (port 7950)
    │
    ├── treasury-engine            ← Treasury engine            (port 7683)
    ├── treasury-ai                ← Treasury AI agent          (port 7684)
    ├── treasury-service           ← Treasury management        (port 7685)
    ├── reward-distributor         ← Reward distribution        (port 7684)
    ├── l3-fee-collector           ← L3 fee aggregation         (port 7681)
    ├── l2-revenue-aggregator      ← L2 revenue rollup          (port 7682)
    ├── hg-treasury-agent          ← HyperGhost treasury AI     (port 7690)
    ├── hg-risk-oracle             ← Risk scoring oracle        (port 7691)
    │
    ├── auth-service               ← Authentication             (port 4001)
    ├── rbac-service               ← Role-based access          (port 4002)
    ├── session-service            ← Session management         (port 4003)
    ├── ghost-compliance           ← Compliance engine          (port 8090)
    ├── audit-log-service          ← Immutable audit log        (port 4010)
    ├── ghost-secure-logger        ← Secure event logger        (port 4011)
    │
    ├── ghostdns-resolver          ← GNS DNS resolver           (port 53)
    ├── ghostdns-indexer           ← DNS record indexer         (port 9200)
    ├── ghostdns-attestor          ← DNS attestation            (port 9210)
    ├── ghostdns-ai                ← AI DNS optimization        (port 9220)
    ├── ghostload-controller       ← Load balancer control      (port 9300)
    ├── ghostload-ai               ← AI traffic shaping         (port 9310)
    │
    ├── ghostscout-l1              ← L1 block explorer          (port 4000→4501)
    ├── ghostscout-l2              ← L2 block explorer          (port 4502)
    ├── ghostscout-l3              ← L3 block explorer          (port 4503)
    ├── block-index-service        ← Block indexer              (port 4100)
    ├── tx-index-service           ← Transaction indexer        (port 4101)
    ├── mempool-service            ← Mempool tracker            (port 4102)
    │
    ├── governance-service         ← On-chain governance        (port 5000)
    ├── hyper-ghost-governor       ← HyperGhost governor        (port 5001)
    ├── hyper-ghost-supervisor     ← Supervisor                 (port 5002)
    ├── staking-service            ← Validator staking          (port 5100)
    ├── validator-service          ← Validator management       (port 5110)
    ├── rewards-service            ← Staking rewards            (port 5120)
    ├── slashing-detection-service ← Slashing detection         (port 5130)
    │
    ├── gns-api                    ← GNS REST API               (port 6000)
    ├── gns-indexer                ← GNS indexer                (port 6001)
    ├── ghostx-api                 ← GhostX exchange API        (port 6100)
    │
    ├── node-health-service        ← Node health monitor        (port 6200)
    ├── node-inventory-service     ← Node inventory             (port 6201)
    ├── upgrade-orchestrator-service ← Upgrade orchestrator     (port 6202)
    ├── snapshot-service           ← Chain snapshots            (port 6203)
    └── alerts-service             ← Alert dispatcher           (port 6300)
```

### Layer 5 — Control Plane (API + Web)

```yaml
# docker-compose.dev.yml (excerpt)
services:
  api:
    build: ./apps/api
    ports: ["4000:4000"]
    environment:
      NODE_ENV: production
      PORT: 4000
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
    depends_on: [postgres, redis]

  web:
    build: ./apps/web
    ports: ["3200:3000"]
    environment:
      NEXT_PUBLIC_API_URL: http://api:4000
    depends_on: [api]
```

---

## 4. Service Startup Order

This is the canonical startup sequence. Each stage must be healthy before the next
begins. The `infra/scripts/up-full.sh` script enforces this automatically.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 0 — HOST INFRASTRUCTURE                                               │
│  ● KVM network (gs-mgmt, 10.50.99.0/24) online                             │
│  ● NVMe storage volumes mounted                                             │
│  ● Docker daemon running                                                    │
│  ● GNS DNS VMs: gns-bind9, gns-kea, gns-postgres, gns-indexer, gns-api    │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 1 — GHOSTCHAIN L1 (PoA Geth, chainId 14000101)                       │
│  ● ghostchain-bootnode (enode discovery)                                   │
│  ● ghostchain-node1    (http rpc :18545, ws :18546)                        │
│  ● ghostchain-node2    (backup node)                                       │
│  ↓ WAIT: eth_chainId on http://localhost:18545                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 2 — OP STACK L2 (settles to L1)                                      │
│  ● op-geth-l2          (http :29545, ws :29546, authrpc :29547)            │
│  ● op-node-l2          (rpc :9545, p2p :9546)                              │
│  ● op-batcher-l2       (batch submission to L1)                            │
│  ● op-proposer-l2      (state root proposal to L1)                         │
│  ↓ WAIT: eth_chainId on http://localhost:29547                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 3 — CONTRACT DEPLOYMENT                                               │
│  ● Deploy L2 OP Stack contracts to L1 (SystemConfig, OptimismPortal, etc.) │
│  ● Deploy L3 parent contracts onto L2 (DisputeGameFactory, etc.)           │
│  ● Sync contract addresses to service env files (env-sync-*.sh)            │
│  ● Deploy GST token + LGE contracts (LoadBalancerVault, RewardRouter, ...) │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 4 — OP STACK L3 (settles to L2)                                      │
│  ● l3-geth             (http :39545, ws :39546, authrpc :39547)            │
│  ● l3-op-node          (p2p)                                               │
│  ● l3-op-batcher       (batch submission to L2)                            │
│  ● l3-op-proposer      (state root proposal to L2)                         │
│  ↓ WAIT: eth_chainId on http://localhost:39545                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 5 — DATA PLANE INFRASTRUCTURE                                        │
│  ● postgres (shared DB for services)                                       │
│  ● redis    (cache + queue)                                                │
│  ● rabbitmq (message bus)                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 6 — IDENTITY & SECURITY LAYER                                        │
│  ● auth-service                                                             │
│  ● rbac-service                                                             │
│  ● session-service                                                          │
│  ● ghost-guard (JWT gate)          :7070                                   │
│  ● ghost-jwks-guard (JWKS)                                                 │
│  ● key-rotation-service                                                     │
│  ● secrets-health-service                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 7 — BRIDGE & INTEROP LAYER                                           │
│  ● ghost-relayer              :7171                                         │
│  ● ghost-rollup-proposer      :7272                                         │
│  ● ghost-rollup-proposer-l2   :7273                                         │
│  ● ghost-rollup-challenger    :7282                                         │
│  ● bridge-service             :7300                                         │
│  ● ghostchain-bridge-hub      :7310                                         │
│  ● liquidity-service          :7320                                         │
│  ● liquidity-router           :7321                                         │
│  ● transfer-lifecycle-service :7330                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 8 — AI & INTELLIGENCE LAYER                                          │
│  ● ghostbrain-core            :7900  ← Start first (all AI depends on it) │
│  ● ghostbrain-gsa             :7901                                         │
│  ● ghost-ai-consensus         :7903                                         │
│  ● ghost-ai-attestor          :7930                                         │
│  ● ghost-ai-contract-engine   :7940                                         │
│  ● ai-monitor                 :7910                                         │
│  ● ai-vault                   :7920                                         │
│  ● anomaly-detection-service  :7950                                         │
│  ● hyper-ghost-ai             :7902  ← Orchestrates all AI agents          │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 9 — TREASURY & ECONOMIC LAYER                                        │
│  ● l3-fee-collector           :7681                                         │
│  ● l2-revenue-aggregator      :7682                                         │
│  ● treasury-engine            :7683                                         │
│  ● treasury-ai                :7684                                         │
│  ● treasury-service           :7685                                         │
│  ● reward-distributor         :7684                                         │
│  ● hg-treasury-agent          :7690                                         │
│  ● hg-risk-oracle             :7691                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 10 — GOVERNANCE LAYER                                                │
│  ● governance-service         :5000                                         │
│  ● hyper-ghost-governor       :5001                                         │
│  ● hyper-ghost-supervisor     :5002                                         │
│  ● staking-service            :5100                                         │
│  ● validator-service          :5110                                         │
│  ● rewards-service            :5120                                         │
│  ● slashing-detection-service :5130                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 11 — EXPLORER & INDEXING                                             │
│  ● block-index-service        :4100                                         │
│  ● tx-index-service           :4101                                         │
│  ● mempool-service            :4102                                         │
│  ● ghostscout-l1              :4501                                         │
│  ● ghostscout-l2              :4502                                         │
│  ● ghostscout-l3              :4503                                         │
│  ● gns-api                    :6000                                         │
│  ● gns-indexer                :6001                                         │
│  ● ghostx-api                 :6100                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ STAGE 12 — CONTROL PLANE (API + WEB)                                       │
│  ● ghost-compliance           :8090  (postgres + redis healthy first)      │
│  ● apps/api                   :4000  (Express 5, all services resolved)    │
│  ● apps/web                   :3200  (Next.js 14, api healthy)             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Infrastructure Automation Scripts

### 5.1 Primary Deployment Scripts

| Script | Purpose |
|--------|---------|
| `scripts/bootstrap-ubuntu.sh` | Install base packages (Node, Foundry, Docker, pnpm) on a fresh Ubuntu host |
| `infra/scripts/up-full.sh` | **Full stack start**: L1 → L2 → L3 → contracts → services → apps |
| `infra/scripts/up.sh` | Start L2+L3 devnet only (no L1) |
| `infra/scripts/down.sh` | Gracefully stop the entire stack |
| `infra/scripts/doctor.sh` | Health-check all RPC endpoints and service health routes |
| `infra/scripts/doctor-l1.sh` | L1-specific diagnostics |
| `infra/scripts/doctor-l2.sh` | L2-specific diagnostics |
| `infra/scripts/doctor-l3.sh` | L3-specific diagnostics |
| `infra/scripts/reset.sh` | Wipe state and re-initialize devnet |

### 5.2 Environment Sync Scripts

```bash
# Sync deployed contract addresses into service env files after each deployment
infra/scripts/env-sync-l1.sh    # L1 address exports
infra/scripts/env-sync-l2.sh    # L2 address exports
infra/scripts/env-sync-l3.sh    # L3 address exports
infra/scripts/env-sync-stack.sh # Merge all into services/stack.env
```

### 5.3 VM Management Scripts

```bash
# Run as root on the KVM hypervisor
sudo bash infra/hypervisor/provision/create-vms.sh           # Create all KVM VMs
sudo bash infra/hypervisor/provision/reprovision-all.sh      # Update entire fleet
sudo bash infra/hypervisor/provision/push-to-vm.sh <vm>      # Push repo to a VM
sudo bash infra/hypervisor/provision/inject-devnet-key.sh    # Inject devnet keys
sudo bash infra/hypervisor/provision/inventory.sh            # Print VM inventory
```

### 5.4 Release & Rollback Scripts

```bash
scripts/release/
infra/scripts/release-l1.sh    # Tag and release L1 chain config
infra/scripts/release-l2.sh    # Tag and release L2 chain config
infra/scripts/release-l3.sh    # Tag and release L3 chain config
infra/scripts/rollback-l1.sh   # Rollback L1 to previous version
infra/scripts/rollback-l2.sh   # Rollback L2 to previous version
infra/scripts/rollback-l3.sh   # Rollback L3 to previous version
scripts/rollback/              # Service-level rollback helpers
```

### 5.5 Genesis Installer (one-command full deploy)

```bash
# From repo root:
cd /home/ghost/ghostl-stack
bash infrastructure/scripts/bootstrap/ghoststack-genesis-installer.sh
```

See [`infrastructure/scripts/bootstrap/ghoststack-genesis-installer.sh`](../infrastructure/scripts/bootstrap/ghoststack-genesis-installer.sh) for the ~1500-line complete installer.

---

## 6. Network Configuration & Port Map

### KVM Network

```
Network:  gs-mgmt
CIDR:     10.50.99.0/24
Gateway:  10.50.99.1
Bridge:   virbr-ghoststack (or gs-mgmt libvirt network)
```

### External Port Map

```
┌──────────────────────────────────────────────────────────────────────────┐
│ SERVICE                       PROTOCOL  HOST PORT  CONTAINER PORT        │
├──────────────────────────────────────────────────────────────────────────┤
│ GhostChain L1 RPC (HTTP)      HTTP      18545      8545                  │
│ GhostChain L1 RPC (WS)        WS        18546      8546                  │
│ GhostChain L1 node2 RPC       HTTP      18547      8545                  │
│ OP-Geth L2 RPC (HTTP)         HTTP      29545      8545                  │
│ OP-Geth L2 RPC (WS)           WS        29546      8546                  │
│ OP-Geth L2 authrpc            HTTP      29547      8547                  │
│ OP-Node L2                    HTTP      9545       9545                  │
│ OP-Geth L3 RPC (HTTP)         HTTP      39545      8545                  │
│ OP-Geth L3 RPC (WS)           WS        39546      8546                  │
│ OP-Geth L3 authrpc            HTTP      39547      8547                  │
├──────────────────────────────────────────────────────────────────────────┤
│ ghost-guard                   HTTP      7070       7070                  │
│ ghost-relayer                 HTTP      7171       7171                  │
│ ghost-rollup-proposer (L2)    HTTP      7272       7272                  │
│ ghost-rollup-proposer (L3)    HTTP      7273       7273                  │
│ ghost-rollup-challenger       HTTP      7282       7282                  │
│ bridge-service                HTTP      7300       7300                  │
│ ghostchain-bridge-hub         HTTP      7310       7310                  │
│ liquidity-service             HTTP      7320       7320                  │
│ liquidity-router              HTTP      7321       7321                  │
├──────────────────────────────────────────────────────────────────────────┤
│ ghostbrain-core               HTTP      7900       7900                  │
│ ghostbrain-gsa                HTTP      7901       7901                  │
│ hyper-ghost-ai                HTTP      7902       7902                  │
│ ghost-ai-consensus            HTTP      7903       7903                  │
├──────────────────────────────────────────────────────────────────────────┤
│ l3-fee-collector              HTTP      7681       7681                  │
│ l2-revenue-aggregator         HTTP      7682       7682                  │
│ treasury-engine               HTTP      7683       7683                  │
│ reward-distributor            HTTP      7684       7684                  │
│ hyper-ghost-governor          HTTP      7685       7685 (admin)          │
├──────────────────────────────────────────────────────────────────────────┤
│ apps/api (Express 5)          HTTP      4000       4000                  │
│ apps/web (Next.js 14)         HTTP      3200       3000                  │
│ ghost-compliance              HTTP      8090       8090                  │
│ ghostscout-l1                 HTTP      4501       4000                  │
│ ghostscout-l2                 HTTP      4502       4000                  │
│ ghostscout-l3                 HTTP      4503       4000                  │
│ ghostx-api                    HTTP      6100       6100                  │
│ gns-api                       HTTP      6000       6000                  │
├──────────────────────────────────────────────────────────────────────────┤
│ governance-service            HTTP      5000       5000                  │
│ hyper-ghost-governor          HTTP      5001       5001                  │
│ hyper-ghost-supervisor        HTTP      5002       5002                  │
│ staking-service               HTTP      5100       5100                  │
│ validator-service             HTTP      5110       5110                  │
├──────────────────────────────────────────────────────────────────────────┤
│ GNS DNS resolver              UDP       53         53                    │
│ postgres                      TCP       5432       5432 (loopback only)  │
│ redis                         TCP       6379       6379 (loopback only)  │
│ Prometheus                    HTTP      9090       9090                  │
│ Grafana                       HTTP      3100       3000                  │
│ Loki                          HTTP      3101       3100                  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Environment & Secrets Bootstrap

### Required Files (must exist before `up-full.sh`)

```bash
# 1. OP Stack environment (chain IDs, sequencer key, deployer key)
cp infra/opstack/.env.sample infra/opstack/.env
# Edit: L1_CHAIN_ID, L2_CHAIN_ID, L3_CHAIN_ID, SEQUENCER_PRIVATE_KEY, etc.

# 2. OP Stack secrets (sensitive keys, never commit)
cp infra/opstack/.env.sample infra/opstack/.env.secrets
# Edit: DEPLOYER_PRIVATE_KEY, BATCHER_PRIVATE_KEY, PROPOSER_PRIVATE_KEY

# 3. Services stack env
cp stack.env.example services/stack.env
# Edit: POSTGRES_PASSWORD, JWT_SECRET, COMPLIANCE_JWT_SECRET, etc.

# 4. Devnet key injection (for local testnet validators)
bash infra/hypervisor/provision/inject-devnet-key.sh
```

### Key Environment Variables

```bash
# Chain RPCs
HOST_L1_RPC=http://localhost:18545   # GhostChain L1
HOST_L2_RPC=http://localhost:29547   # OP Stack L2
HOST_L3_RPC=http://localhost:39545   # OP Stack L3

# Contract addresses (populated by env-sync scripts after deployment)
L2L3_BRIDGE_ADDRESS=0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2
L1_ROLLUP_L2_ADDRESS=0xad32D5C2Da9f4159C4cc98686C005852b3905355
L1_ROLLUP_PARENT_ORACLE=0x2C001131e99c79e6dDF9f099F2101e9535172Db1

# GST Token (GhostChain L1 native token)
GST_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
CHAIN_ID=14000101

# Economy pipeline
L3_FEE_COLLECTOR_URL=http://localhost:7681
L2_REVENUE_AGGREGATOR_URL=http://localhost:7682
TREASURY_ENGINE_URL=http://localhost:7683
REWARD_DISTRIBUTOR_URL=http://localhost:7684
GHOSTBRAIN_CORE_URL=http://localhost:7900

# AI RPC pools
GHOST_L1_RPC_URLS=http://localhost:18545
GHOST_L2_RPC_URLS=http://localhost:29547
GHOST_L3_RPC_URLS=http://localhost:39545
```

---

## 8. AI System Boot Order

The AI intelligence layers MUST boot in this order (each depends on the layer below):

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 — GhostBrain Core (base AI runtime)                   │
│    ghostbrain-core  :7900                                       │
│    ghostbrain-gsa   :7901                                       │
│    ↓ WAIT: GET /health                                          │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2 — AI Specialist Services                               │
│    ghost-ai-consensus      :7903  (consensus validation)        │
│    ghost-ai-attestor       :7930  (on-chain attestation)        │
│    ghost-ai-contract-engine:7940  (contract analysis)           │
│    ai-monitor              :7910  (anomaly detection)           │
│    ai-vault                :7920  (secret AI management)        │
│    anomaly-detection-service:7950                               │
│    forecasting-service                                          │
│    explainability-service                                       │
│    ↓ WAIT: all /health endpoints green                          │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3 — HyperGhost AI Orchestration                         │
│    hyper-ghost-ai          :7902  (top-level orchestrator)      │
│    hg-treasury-agent       :7690                                │
│    hg-risk-oracle          :7691                                │
│    hg-proof-snapshotter                                         │
│    hg-reporting-indexer                                         │
│    ↓ WAIT: hyper-ghost-ai /health green                         │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 4 — Ghost Cognitive SDK (in-process, loaded by API)      │
│    @ghostchain/cognitive   (GhostCognitiveEngine)               │
│    @ghostchain/swarm       (GhostSwarmController)               │
│    @ghostchain/autonomous  (autonomous DevOps)                  │
│    ↓ initialized by apps/api startup                            │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 5 — Ghost Consciousness (GCL-Ω, apex layer)             │
│    @ghostchain/consciousness (GhostConsciousnessCore)           │
│    GhostGlobalCoordinator                                       │
│    GhostDecisionSynthesizer                                     │
│    GhostSwarmCouncil                                            │
│    GhostCrossChainDiplomat                                      │
│    GhostEcosystemExpander                                       │
│    ↓ continuously running, feeds directives to all layers       │
└─────────────────────────────────────────────────────────────────┘
```

### AI Think Loop

```typescript
// Runs every 30 seconds after full stack is online
ConsciousnessCore.think() →
  SystemPerception.observe() →
    AwarenessEngine.analyze() →
      GlobalCoordinator.coordinate() →
        [SwarmCouncil | Expander | Diplomat | TreasuryStrategy | SwarmRepair] →
          CivilizationMemory.record() →
            Telemetry.record()
```

---

## 9. Monitoring Stack

### Services Deployed

```yaml
# infra/observability/docker-compose.yml
services:
  prometheus:
    image: prom/prometheus:v2.51.0
    ports: ["9090:9090"]
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:10.4.1
    ports: ["3100:3000"]
    volumes:
      - ./infra/grafana:/etc/grafana/provisioning

  loki:
    image: grafana/loki:3.0.0
    ports: ["3101:3100"]

  promtail:
    image: grafana/promtail:3.0.0
    volumes:
      - /var/log:/var/log
      - /var/lib/docker/containers:/var/lib/docker/containers
```

### Metrics Monitored

| Metric | Source |
|--------|--------|
| L1/L2/L3 block height | ghostchain-node, op-geth |
| Validator peer count | ghost-ai-consensus |
| RPC latency (p50/p95/p99) | ghost-guard, ghost-relayer |
| Batcher transaction lag | op-batcher |
| Treasury balance | treasury-engine |
| AI decision throughput | hyper-ghost-ai |
| Bridge pending withdrawals | ghostchain-bridge-hub |
| CPU / RAM / disk I/O | node-exporter (per VM) |
| Governance proposal state | governance-service |
| Anomaly detection alerts | anomaly-detection-service |

### Grafana Dashboards

Pre-built dashboards (in `infra/grafana/`):
- **GhostStack Overview** — block heights, validator health, service uptime
- **Chain Performance** — TPS, gas, latency per L1/L2/L3
- **AI Orchestration** — decision rate, anomaly alerts, swarm status
- **Treasury & Economy** — fee flow, treasury balance, reward distribution
- **Bridge Health** — pending withdrawals, relay latency, challenge window

---

## 10. One-Command Deployment

### Prerequisites

```bash
# On Ubuntu 24.04:
sudo apt-get install -y git curl
git clone https://github.com/ghostchain1/ghostl-stack.git /home/ghost/ghostl-stack
cd /home/ghost/ghostl-stack
```

### Full Stack (devnet / local)

```bash
# 1. Bootstrap the host (installs Node, Docker, Foundry, pnpm)
bash scripts/bootstrap-ubuntu.sh

# 2. Set up environment files
cp infra/opstack/.env.sample infra/opstack/.env
cp stack.env.example services/stack.env
# ↑ Edit both files with your keys and chain IDs

# 3. Launch the entire stack
bash infra/scripts/up-full.sh
```

### One-Shot Genesis Installer (hypervisor mode)

```bash
# Provisions VMs, installs everything, starts all services in the correct order
cd /home/ghost/ghostl-stack
sudo bash infrastructure/scripts/bootstrap/ghoststack-genesis-installer.sh
```

### Verify Deployment

```bash
# Run the health doctor on all endpoints
bash infra/scripts/doctor.sh

# Manual endpoint checks
curl http://localhost:18545   # L1 RPC
curl http://localhost:29547   # L2 RPC
curl http://localhost:39545   # L3 RPC
curl http://localhost:7070/health   # ghost-guard
curl http://localhost:7900/health   # ghostbrain-core
curl http://localhost:4000/health   # apps/api
curl http://localhost:8090/health   # ghost-compliance
```

### Quick-Reference Start Commands

```bash
# Devnet only (L2+L3, no L1)
bash infra/scripts/up.sh

# Full stack (L1+L2+L3+contracts+services+apps)
bash infra/scripts/up-full.sh

# Stop everything
bash infra/scripts/down.sh

# Reset state (wipe and re-init devnet)
bash infra/scripts/reset.sh

# Health check
bash infra/scripts/doctor.sh

# VM fleet operations (hypervisor root)
sudo bash infra/hypervisor/provision/create-vms.sh
sudo bash infra/hypervisor/provision/reprovision-all.sh
```

---

## Final Deployment Map

```
Ghoststack-baremetal (Ubuntu 24.04, KVM, 10.50.99.0/24)
│
├── ghost-web (10.50.99.10)
│   └── 🐳 apps/web (Next.js 14)   :3200
│   └── 🐳 apps/api (Express 5)    :4000
│
├── ghost-dns-slave (10.50.99.66)
│   └── 🐳 gns-bind9 (Bind9 secondary)
│
├── ghost-ghostchain-bootnode-1 (10.50.99.20)
│   └── 🐳 ghostchain-bootnode (geth PoA p2p)
│
├── ghost-ghostchain-node1-1 (10.50.99.21)
│   └── 🐳 ghostchain-node1 (geth PoA)    L1 RPC :18545
│
├── ghost-ghostchain-node2-1 (10.50.99.22)
│   └── 🐳 ghostchain-node2 (geth PoA)    L1 RPC :18547
│
├── GNS fleet (10.50.99.30-34)
│   ├── gns-bind9   :53 (authoritative DNS)
│   ├── gns-kea     (DHCP + DDNS)
│   ├── gns-postgres (GNS database)
│   ├── gns-indexer (GNS record indexer)
│   └── gns-api     :6000 (GNS REST API)
│
├── ghostchain-devnet (38.247.149.219)
│   └── 🐳 Full L1+L2+L3+services (development/CI)
│
├── ghostchain-mainnet-l1 (10.50.99.70)
│   └── 🐳 op-geth-l2 + op-node-l2 + batcher + proposer   L2 RPC :29545
│
├── ghost-mainnet-validator (10.50.99.72)
│   └── 🐳 ghostchain-node (PoA validator)
│   └── 🐳 validator-service + staking-service
│
├── ghostl2-mainnet (10.50.99.76)
│   └── 🐳 op-geth-l2 + op-node-l2                         L2 RPC :29545
│   └── 🐳 op-batcher-l2 + op-proposer-l2
│   └── 🐳 ghost-relayer + ghost-rollup-proposer
│
└── ghostl3-mainnet (10.50.99.78)
    └── 🐳 l3-geth + l3-op-node                             L3 RPC :39545
    └── 🐳 l3-op-batcher + l3-op-proposer
    └── 🐳 ghostbrain-core + hyper-ghost-ai (AI services)
    └── 🐳 treasury-engine + reward-distributor (Economy)
    └── 🐳 governance-service + hyper-ghost-governor
```

> With this blueprint, GhostStack becomes a fully autonomous sovereign blockchain
> infrastructure that can be deployed reproducibly from a single command.
> See `infrastructure/scripts/bootstrap/ghoststack-genesis-installer.sh` for the
> complete genesis installer that provisions the entire ecosystem automatically.
