# autonomous-vault-hypervisor

An autonomous AI orchestration service that provides unified, policy-enforced management of:

- **Virtual Machines** (libvirt/virsh — local or via SSH to hypervisor)
- **Docker Containers** (via Docker socket or DOCKER_HOST)
- **Secrets** (via HashiCorp Vault / ai-vault proxy — auto-rotation on schedule)
- **Policy enforcement** — routing law (AGENTS.md §1: L3→L2→L1) + allow/deny rules
- **Auto-remediation** — automatically restarts crashed VMs and exited containers
- **GhostBrain integration** — NATS + HTTP registration, health signals, anomaly events
- **Prometheus metrics** — full observability at `/metrics`

Port: **7720** | Service name: `autonomous-vault-hypervisor`

---

## Architecture

```
                     ┌──────────────────────────────────────────┐
                     │       autonomous-vault-hypervisor        │
                     │                  :7720                    │
                     │                                           │
                     │  ┌─────────────┐  ┌────────────────────┐ │
                     │  │ Reconciler  │  │   HTTP API (REST)  │ │
                     │  │ (60s loop)  │  │  /v1/vms           │ │
                     │  └──────┬──────┘  │  /v1/containers    │ │
                     │         │         │  /v1/secrets        │ │
                     │  ┌──────┴──────┐  │  /v1/policy        │ │
                     │  │  Discover   │  │  /v1/reconcile     │ │
                     │  │  Remediate  │  │  /metrics          │ │
                     │  │  Rotate     │  └────────────────────┘ │
                     │  └─────────────┘                         │
                     └────────────┬─────────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────────┐
              ▼                   ▼                        ▼
     ┌─────────────────┐  ┌─────────────┐  ┌─────────────────────┐
     │  libvirt/virsh  │  │   Docker    │  │   Vault / ai-vault  │
     │   (SSH or local)│  │   socket    │  │   (secret rotation) │
     └─────────────────┘  └─────────────┘  └─────────────────────┘
              │                   │
     ┌────────▼───────────────────▼────────┐
     │          GhostBrain Core            │
     │       (NATS :4222 + HTTP :7900)     │
     └─────────────────────────────────────┘
```

---

## Quick Start (dev)

```bash
# 1. Copy and edit env
cp services/autonomous-vault-hypervisor/.env.example services/autonomous-vault-hypervisor/.env

# 2. Bootstrap (builds image, creates network, starts, waits for health)
bash infra/scripts/autonomous-vault-hypervisor/bootstrap.sh dev

# 3. Check status
curl http://localhost:7720/status | jq

# 4. View VMs (discovered from hypervisor)
curl http://localhost:7720/v1/vms | jq

# 5. View containers
curl http://localhost:7720/v1/containers | jq
```

## Production (as part of autonomy stack)

```bash
# Start alongside the full autonomy stack
docker compose -f docker-compose.autonomy.yml up -d autonomous-vault-hypervisor
```

---

## Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `7720` | HTTP listen port |
| `NATS_URL` | `nats://nats:4222` | GhostBrain NATS URL |
| `GHOSTBRAIN_URL` | `http://ghostbrain-core:7900` | GhostBrain HTTP URL |
| `AI_VAULT_ADDR` | `http://ai-vault:7710` | ai-vault proxy (preferred) |
| `VAULT_ADDR` | `http://vault:8200` | Direct Vault address (fallback) |
| `VAULT_TOKEN` | `` | Vault root/service token |
| `VAULT_ROLE_ID` | `` | AppRole role ID |
| `VAULT_SECRET_ID` | `` | AppRole secret ID |
| `HYPERVISOR_HOST` | `` | SSH host for virsh (blank = local) |
| `HYPERVISOR_USER` | `ghost` | SSH user |
| `HYPERVISOR_SSH_KEY_PATH` | `` | Path to SSH private key (mounted at `/home/nonroot/.ssh` in the container) |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path |
| `DOCKER_HOST` | `` | Remote Docker host (TCP) |
| `RECONCILE_INTERVAL_MS` | `60000` | Reconcile loop interval |
| `REMEDIATE_ENABLED` | `1` | Enable auto-remediation |
| `MAX_REMEDIATIONS_PER_RUN` | `3` | Max remediations per cycle |
| `ROTATE_ENABLED` | `1` | Enable secret rotation |
| `EXECUTE_ACTIONS` | `1` | Allow execution of actions |
| `EMERGENCY_LOCK` | `0` | Emergency lock (1 = deny all) |
| `VM_LAYER_MAP` | `{}` | JSON: `{"vmName":"L1"}` map |
| `HMAC_SECRET` | `change-me` | HMAC signing secret |

---

## API Reference

### Health & Status
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service liveness |
| GET | `/status` | Full status (vault, docker, VMs, containers) |
| GET | `/metrics` | Prometheus metrics |

### VMs
| Method | Path | Description |
|---|---|---|
| GET | `/v1/vms` | List all known VMs (from state) |
| GET | `/v1/vms/discover` | Live discovery via virsh |
| GET | `/v1/vms/:name/info` | Domain info |
| GET | `/v1/vms/:name/snapshots` | List snapshots |
| POST | `/v1/vms/:name/start` | Start VM |
| POST | `/v1/vms/:name/stop` | Graceful shutdown |
| POST | `/v1/vms/:name/destroy` | Force stop |
| POST | `/v1/vms/:name/restart` | Reboot |
| POST | `/v1/vms/:name/snapshot` | Create snapshot (body: `{"name":"snap-name"}`) |

### Containers
| Method | Path | Description |
|---|---|---|
| GET | `/v1/containers` | List all known containers (from state) |
| GET | `/v1/containers/discover` | Live discovery via docker ps |
| GET | `/v1/containers/:id/inspect` | Full container inspect |
| GET | `/v1/containers/:id/logs?tail=50` | Container logs |
| GET | `/v1/containers/:id/stats` | Container stats |
| POST | `/v1/containers/:id/start` | Start container |
| POST | `/v1/containers/:id/stop` | Stop container |
| POST | `/v1/containers/:id/restart` | Restart container |
| POST | `/v1/containers/prune` | Prune stopped containers |

### Secrets
| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/v1/secrets/rotate` | `{"mount":"...","path":"...","keys":[...],"encoding":"base64"}` | Rotate secret |
| GET | `/v1/secrets/vault-health` | — | Vault/ai-vault health |

### Policy
| Method | Path | Description |
|---|---|---|
| GET | `/v1/policy` | Get current policy |
| PUT | `/v1/policy` | Update policy (JSON body) |

### Reconciler
| Method | Path | Description |
|---|---|---|
| POST | `/v1/reconcile/trigger` | Force immediate reconcile |
| GET | `/v1/reconcile/state` | Reconcile state summary |
| GET | `/v1/reconcile/remediations` | Remediation history |

---

## Policy File (`policy.json`)

```json
{
  "allowActions": [
    { "type": "vm", "action": "vm.start", "target": "*", "allow": true }
  ],
  "denyActions": [
    { "type": "vm", "action": "vm.destroy", "target": "ghost-l1*", "allow": false, "reason": "protect_l1" }
  ],
  "emergencyLock": false,
  "maxAutoRestarts": { "vms": 3, "containers": 5 },
  "rotations": [
    { "mount": "ghostchain", "path": "l1/jwtsecret", "kvVersion": 2, "keys": ["jwtsecret"], "encoding": "base64", "intervalMinutes": 1440 }
  ]
}
```

---

## Emergency Procedures

Per [AGENTS.md §8](../../AGENTS.md#8-emergency--break-glass):

```bash
# Activate emergency lock (all autonomous actions suspended)
bash infra/scripts/autonomous-vault-hypervisor/emergency-lock.sh lock "reason"

# Release emergency lock
bash infra/scripts/autonomous-vault-hypervisor/emergency-lock.sh unlock "resolved"
```

---

## Observability

- **Prometheus scrape:** `GET http://autonomous-vault-hypervisor:7720/metrics`
- **Config:** `observability/prometheus/autonomous-vault-hypervisor.yml`
- **Alert rules:** `infra/prometheus/alerts/autonomous-vault-hypervisor.rules.yml`
- **Grafana dashboard:** `observability/grafana/dashboards/autonomous-vault-hypervisor.json`

---

## Routing Law

This service enforces AGENTS.md §1:
- L3 → L2 only ✓
- L2 → L1 only ✓
- L3 → L1 direct → **BLOCKED** (ROUTE_LAW_VIOLATION)

All cross-layer actions are validated via `policy-gate.ts:assertRoutingLaw()`.

---

## Security

- All secrets (tokens, keys, passwords) are automatically redacted in logs (`logger.ts`)
- HMAC-signed requests supported (`REQUIRE_SIGNATURE=1`, `HMAC_SECRET`)
- Emergency lock available via API or env (`EMERGENCY_LOCK=1`)
- Docker socket mounted read-write (required for container lifecycle management)
- libvirt socket mounted read-write when local VM management is needed
- SSH key mounted read-only for hypervisor access

---

## File Structure

```
services/autonomous-vault-hypervisor/
├── src/
│   ├── index.ts           — Entry point
│   ├── config.ts          — Environment-driven config
│   ├── logger.ts          — Structured logger with secret redaction
│   ├── types.ts           — Shared TypeScript types
│   ├── metrics.ts         — Prometheus metrics
│   ├── ghostbrain.ts      — NATS + GhostBrain Core integration
│   ├── vault-client.ts    — HashiCorp Vault / ai-vault HTTP client
│   ├── vm-manager.ts      — VM lifecycle (libvirt/virsh, local + SSH)
│   ├── docker-manager.ts  — Docker container lifecycle
│   ├── policy-gate.ts     — Policy enforcement + routing law
│   ├── remediation.ts     — Auto-remediation engine
│   ├── reconciler.ts      — Main autonomous reconciliation loop
│   └── server.ts          — Express HTTP API
├── policy.json            — Default policy (production-safe defaults)
├── .env.example           — Environment template
├── Dockerfile             — Multi-stage production image
├── docker-compose.yml     — Standalone compose
├── package.json
└── tsconfig.json
```
