# GhostStack

**Sovereign AI-Managed Blockchain Infrastructure**

GhostStack is a fully autonomous, AI-orchestrated blockchain ecosystem combining:

- **GhostChain L1** — sovereign PoS settlement layer (IBFT consensus, EVM-compatible)
- **GhostL2** — Optimistic rollup execution layer
- **GhostL3** — Application-specific zk-rollup layer
- **GhostBrain** — 21-module AI control plane (port 9500) orchestrating the entire stack
- **Global Data Mesh** — unified telemetry, blockchain indexing, and AI memory backbone
- **Validator Network** — AI-managed validator fleet with autonomous repair and balancing

---

## Directory Layout

```
ghostl-stack/
├ apps/
│   ├ web/          Next.js unified command dashboard
│   └ api/          Backend REST API gateway
├ chains/           L1 / L2 / L3 chain configs
├ contracts/        GRC smart contracts (Hardhat)
├ data-mesh/        Data Mesh persistent storage
├ infrastructure/
│   ├ docker/       Docker Compose orchestration
│   ├ kubernetes/   K8s manifests (optional)
│   ├ terraform/    IaC for cloud resources
│   └ monitoring/   Prometheus + Grafana + Loki
├ scripts/
│   ├ deploy/       Deployment scripts
│   ├ maintenance/  Health, rotation, cleanup
│   └ migrations/   Schema / config migrations
├ services/
│   └ ghostbrain/   GhostBrain AI service stubs
│       ├ control-plane    port 9500 (SCP — master)
│       ├ kernel           port 9300
│       ├ swarm            port 9000
│       ├ data-mesh        port 9900
│       ├ economy-engine   port 9800
│       ├ validator-fabric port 9700
│       ├ multichain       port 9350
│       ├ interchain       port 9450
│       ├ governance       port 9550
│       ├ research         port 9600
│       ├ devops           port 9400
│       ├ simulation-lab   port 9200
│       ├ digital-twin     port 9100
│       ├ conscious-core   port 9150
│       ├ evolution-engine port 9250
│       ├ economic         port 9050
│       └ hub
├ system/
│   ├ systemd/      systemd unit files
│   └ configs/      system-level configs
└ validators/       Validator configs + scripts
```

---

## Quick Start

```bash
# Full stack bootstrap (first time)
./scripts/deploy/bootstrap.sh

# Start GhostBrain AI only
make ghostbrain-up

# Start all services
make up

# Check health
make health

# View logs
make logs
```

---

## GhostBrain AI Architecture

```
SCP (9500)           ← unified command interface
  │
  ├ Kernel (9300)    ← hypervisor + infra control
  ├ Swarm (9000)     ← inter-agent bus
  ├ Data Mesh (9900) ← telemetry + indexing + memory
  ├ Economy (9800)   ← tokenomics AI (AEE)
  ├ Validators (9700)← validator fleet AI (GVF)
  ├ Multichain (9350)← cross-chain AI
  ├ Interchain (9450)← bridge AI
  ├ Governance (9550)← on-chain governance AI
  ├ Research (9600)  ← autonomous R&D
  ├ DevOps (9400)    ← CI/CD AI
  ├ SimLab (9200)    ← simulation engine
  ├ Twin (9100)      ← digital twin
  ├ Conscious (9150) ← meta-reasoning
  ├ Evolution (9250) ← self-evolution
  ├ Economic (9050)  ← economic modeling
  └ Hub              ← shared context
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure before running:

```bash
cp .env.example .env
$EDITOR .env
```

---

## Monitoring

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/ghoststack)
- Loki: http://localhost:3100

---

## Source

GhostBrain TypeScript packages: `~/hyperghost-tooling/hyper-ghost-ai/services/`
