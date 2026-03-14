# Service Catalog (Phase 0 Baseline)

Generated from repository inventory and runtime snapshot in `evidence/phase0`.

## Scope
- Repo root: `/home/ghost/ghostl-stack`
- Total first-level service directories under `services/`: `94`
- Runtime snapshot source: `evidence/phase0/docker-ps.txt`

## Chain Components
- **L1 (GhostChain):** `ghostchain-node1`, `ghostchain-node2`, `ghostchain-bootnode`, `ghostchain-rpc-proxy`
- **L2 (OP Stack):** `op-node`, `op-sequencer`, `op-batcher`, `op-proposer`, `l2-geth`, `op-gate`
- **L3 (OP Stack):** `l3-op-node`, `l3-op-batcher`, `l3-geth`
- **Interlayer:** `ghost-relayer`, `bridge-service`, `rpc-forward-l1-29545`

## Command Hub + Control Plane
- **UI:** `apps/web` (container observed: `compose-ghostcontrol-ui-1`)
- **API:** `apps/api` (container observed: `compose-ghostcontrol-api-1`)
- **Worker:** `apps/worker`
- **Registry / topology:** `ghost-registry`, `node-inventory-service`, `network-context-service`, `chain-status-service`

## Governance, Treasury, Protocol
- `governance-service`
- `treasury-service`
- `treasury-ai`
- `treasury-evidence`
- `contract-registry-service`
- `contract-risk-service`
- `verification-service`

## Compliance and Security Services
- `auth-service`
- `rbac-service`
- `audit-log-service`
- `session-service`
- `ghost-compliance`
- `ghost-compliance-worker`
- `compliance-export-service`
- `secrets-health-service`
- `key-rotation-service`

## AI and Intelligence Services
- `ghostbrain-core` (port 7900) — GBA-OS kernel + predictive AI hub; 30-second brain tick with 10-step orchestration pipeline
  - **GBA-OS Kernel:** event loop, cluster gossip, cluster sync, leader election
  - **Predictive AI:** EWMA load forecaster, z-score anomaly detector, pattern recognizer (autocorr/TOD/Pearson), predictive balancer, failure predictor
  - **Routes:** `/api/v1/kernel`, `/api/v1/orchestrator`, `/api/v1/protection`, `/api/v1/observability`, `/api/v1/predictive`, `/metrics`
- `ai-monitor`
- `ai-vault`
- `ai-clock-sync`
- `anomaly-detection-service`
- `explainability-service`
- `forecasting-service`
- `feature-flags-service`
- `ghost-ai-attestor`
- `ghost-ai-consensus`

## Explorer, Data, and Indexing
- `ghostscout-l1`, `ghostscout-l2`, `ghostscout-l3`
- `ghostscout-frontend-l1`, `ghostscout-frontend-l2`, `ghostscout-frontend-l3`
- `ghostscout-db`
- `block-index-service`
- `tx-index-service`
- `mempool-service`
- `global-search-service`
- `proxy-inspector-service`

## Core Runtime Endpoints (observed)
- L1 RPC: `http://127.0.0.1:18545`
- L2 RPC: `http://127.0.0.1:29547`
- L3 RPC: `http://127.0.0.1:39545`
- Grafana: `http://127.0.0.1:3000`
- Prometheus: `http://127.0.0.1:9090`

## Compose Entry Points (high-signal set)
- Root: `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.autonomy.yml`, `docker-compose.phase3.yml`
- Apps: `apps/docker-compose.yml`, `apps/docker-compose.dev.yml`
- L1: `infra/ghostchain/docker-compose.l1.yml`, `infra/ghostchain/docker-compose.ibft.yml`
- L2/L3: `infra/opstack/docker-compose.yml`, `infra/opstack/docker-compose.l3.yml`, `infra/opstack/docker-compose.challengers.yml`

## Evidence References
- Inventory: `evidence/phase0/inventory.txt`
- Compose inventory: `evidence/phase0/compose-files.txt`
- Env/secrets inventory: `evidence/phase0/env-and-secrets-files.txt`
- Runtime health snapshot: `evidence/phase0/docker-ps.txt`
