# GhostStack Master Deployment Blueprint (MDB)

> **Version:** 1.0  
> **Single command to deploy the entire GhostStack ecosystem.**

---

## Quick Start

```bash
cd /home/ghost/ghostl-stack/deployment

# 1. Configure secrets (edit as needed)
cp configs/ghoststack.env configs/ghoststack.local.env
nano configs/ghoststack.local.env

# 2. Deploy everything
./deploy.sh
```

That's it. The deployment script handles networks, health-waits, and startup ordering automatically.

---

## Deployment Layers

| # | Layer | Services | Ports |
|---|-------|----------|-------|
| 0 | Docker Networks | `ghostbrain-net`, `ghoststack-ai-net` | — |
| 1 | Data Mesh | Redis · Postgres · Elasticsearch | 6379 · 5432 · 9200 |
| 2 | GhostBrain Core | Swarm · Kernel · Control Plane · Validator Fabric · Economy Engine · Data Mesh | 9000–9900 |
| 3 | Chain Validators | geth bootnode + 4 validators | 8545 · 8546 · 30303 |
| 4 | Monitoring | Prometheus · Grafana · Loki | 9090 · 3001 · 3100 |
| 5 | AI Engine Cluster | AIMS · VGE · AAE · GEE · AEE · AIE · ASE · GIE · AGE · GIEX · GAAN · ADE · SEE · PNE · INE | 9970–9985 |
| 6 | Control Center | GhostStack Web (Next.js) | 3000 |

---

## Command Reference

```bash
# Deploy full stack
./deploy.sh

# Deploy only one layer
./deploy.sh --only data-mesh
./deploy.sh --only ghostbrain
./deploy.sh --only validators
./deploy.sh --only monitoring
./deploy.sh --only ai-engines
./deploy.sh --only web

# Skip preflight checks (faster re-deploys)
./deploy.sh --skip-preflight

# Skip Docker image builds (use cached images)
./deploy.sh --skip-build

# Check health of all services
./deploy.sh --status
# or
./scripts/status.sh

# Stop everything
./deploy.sh --down
# or
./scripts/stop-all.sh

# Stop everything AND remove volumes (DESTRUCTIVE — erases all data)
./scripts/stop-all.sh --volumes

# Tail logs
./scripts/logs.sh             # all stacks
./scripts/logs.sh ghostbrain  # GhostBrain only
./scripts/logs.sh ai          # AI engines only
./scripts/logs.sh monitoring  # Prometheus/Grafana only
./scripts/logs.sh validators  # Chain validators only
./scripts/logs.sh data-mesh   # Redis/Postgres/ES only
```

---

## Configuration

| File | Purpose |
|------|---------|
| `configs/ghoststack.env` | Master config (committed defaults) |
| `configs/ghoststack.local.env` | Local overrides (add to `.gitignore`) |

**Key variables to set before production:**

```bash
POSTGRES_PASSWORD=<strong-password>
GRAFANA_ADMIN_PASSWORD=<strong-password>
OPENAI_API_KEY=sk-...
TWITTER_API_KEY=...
DISCORD_BOT_TOKEN=...
```

---

## Makefile Shortcuts

After extending the root Makefile with MDB targets:

```bash
# From /home/ghost/ghostl-stack/
make deploy          # full deployment
make stop            # stop all
make status          # health check table
make logs            # tail all logs
```

---

## Troubleshooting

### A layer fails to start
Run with just that layer to isolate the problem:
```bash
./deploy.sh --only ghostbrain
```
Then check logs:
```bash
./scripts/logs.sh ghostbrain
```

### Port already in use
The preflight script will warn you. Stop the conflicting process or change the port in `configs/ghoststack.local.env`.

### Data Mesh not ready before GhostBrain
Increase the wait timeout:
```bash
WAIT_DATA_MESH=60 ./deploy.sh --only ghostbrain
```

### Docker network conflicts
```bash
docker network prune   # remove unused networks
./deploy.sh --only ghostbrain  # re-creates networks automatically
```

---

## Architecture

```
GhostStack Ecosystem
├── Data Mesh          (Redis · Postgres · Elasticsearch)
├── GhostBrain         (AI hypervisor kernel — 6 core services)
│   └── controls → Validators, AI Engines, Monitoring
├── Chain Validators   (geth IBFT/PoA — L1 blockchain)
├── Monitoring         (Prometheus → Grafana · Loki)
├── AI Engines         (15 specialised AI services — 9970–9985)
│   ├── AIMS  Marketing    9970
│   ├── VGE   Growth       9971
│   ├── AAE   Adoption     9972
│   ├── GEE   Expansion    9973
│   ├── AEE   Economy      9974
│   ├── AIE   Infra        9975
│   ├── ASE   Security     9976
│   ├── GIE   Intelligence 9977
│   ├── AGE   Governance   9978
│   ├── GIEX  Interchain   9979
│   ├── GAAN  Agents       9980
│   ├── ADE   Development  9982
│   ├── SEE   Evolution    9983
│   ├── PNE   Planetary    9984
│   └── INE   Interplanetary 9985
└── Control Center     (Next.js dashboard — port 3000)
```
