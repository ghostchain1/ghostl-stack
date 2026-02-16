# Services Inventory

## Refresh (2026-02-16, Phase 0 rerun)

Scan scope:
- Compose manifests: root `docker-compose*.yml`, `apps/`, `infra/ghostchain/`, `infra/opstack/`, `infra/docker/compose/`, `observability/infra/`, `services/*/docker-compose.yml`, `tools/ghostcontrol/infra/compose/`
- Source trees: `services/**`, `apps/**`, `packages/**`, `contracts/**`, `tools/**`, `infra/**`
- Excluded: `rollback/`, `backups/`, `_backup/`, `releases/`, `node_modules/`, `dist/`, vendor upstream OP repos

Canonical per-service runtime matrix (ports/env/volumes/healthcheck/metrics/DB/RPC deps):
- `docs/gst-migration/SERVICES-INVENTORY.tsv`
- Rows: `144` first-party/active service IDs
- Columns:
  - `service`
  - `compose_files`
  - `ports`
  - `volumes`
  - `healthcheck`
  - `chain_dependencies`
  - `db_env`
  - `metrics_env`

Compose parse exceptions observed (needs layered compose invocation or missing build metadata):
- `docker-compose.phase3.secrets.yml`
- `infra/opstack/docker-compose.challengers.yml`
- `infra/opstack/docker-compose.l3.yml` (valid when overlaid with `infra/opstack/docker-compose.yml`)
- `infra/docker/compose/docker-compose.core.yml`
- `infra/docker/compose/docker-compose.ui.yml`

Domain grouping (for GST migration sequencing):

### Chain Core
`ghost-rpc-proxy`, `ghost-rpc-proxy-l1`, `ghost-rpc-proxy-l2`, `ghost-rpc-proxy-l3`, `ghostchain-bootnode`, `ghostchain-l1`, `ghostchain-node1`, `ghostchain-node2`, `ghostchain-node3`, `ghostchain-node4`, `ghostchain-rpc-proxy`, `l1-rpc-proxy`, `l2-geth`, `op-batcher`, `op-gate`, `op-gate-l1`, `op-node`, `op-proposer`, `op-sequencer`, `rpc-forward-l1-29545`, `rpc-forward-l2-18547`

### Governance
`ghostcontrol-planner`, `ghostcontrol-policy`, `governance-service`, `hyper-ghost-supervisor`, `network-manager`, `network-manager-service`, `upgrade-orchestrator-service`

### Bridge/Relayer
`bridge-service`, `ghost-relayer`, `ghost-rollup-challenger`, `ghost-rollup-challenger-l2`, `ghost-rollup-proposer`, `ghost-rollup-proposer-l2`, `liquidity-router`, `liquidity-service`, `preconfirm-l2-service`, `preconfirm-l3-service`, `preconfirm-service`

### Wallet/UI
`command-palette-service`, `ghost-ui`, `ghostcontrol-ui`, `ghostl-web`, `proxy-inspector-service`, `theme-service`

### Indexing/Explorer
`block-index-service`, `ghost-mapper`, `ghostscout-db`, `ghostscout-frontend-l1`, `ghostscout-frontend-l2`, `ghostscout-frontend-l3`, `ghostscout-l1`, `ghostscout-l2`, `ghostscout-l3`, `global-search-service`, `network-context-service`, `node-inventory-service`, `tx-index-service`

### Compliance/KYC
`auth-service`, `compliance-export-service`, `contract-registry-service`, `contract-risk-service`, `dispute-service`, `entity-tagging-service`, `ghost-compliance`, `ghost-compliance-worker`, `rbac-service`, `secrets-health-service`, `session-service`, `verification-service`

### Treasury/Tokenomics
`fee-model-service`, `mempool-service`, `participation-service`, `payout-service`, `rewards-service`, `snapshot-service`, `staking-service`, `supply-service`, `treasury-ai`, `treasury-evidence`, `treasury-service`

### Observability
`alertmanager`, `alerts-service`, `consensus-telemetry-service`, `grafana`, `loki`, `node-health-service`, `notifications-service`, `prometheus`, `vector`

### AI Agents
`agent-registry`, `ai-clock-sync`, `ai-monitor`, `ai-monitor-l1`, `ai-monitor-l3`, `ai-vault`, `ai-vault-dev`, `anomaly-detection-service`, `auditor-agent`, `coder-agent`, `docs-agent`, `explainability-service`, `forecasting-service`, `ghost-ai-attestor`, `ghost-guard`, `ops-agent`, `planner-agent`, `router-agent`, `watchdog-agent`

### Unclassified (needs Phase 3 domain finalization)
`audit-log-service`, `chain-status-service`, `core-service`, `docker-socket-proxy`, `evidence-service`, `external-evm`, `feature-flags-service`, `gas-engine-migrate`, `gas-engine-postgres`, `gas-engine-redis`, `ghost-gas-engine`, `ghost-gas-engine-worker`, `ghost-pil`, `ghost-pil-worker`, `ghost-registry`, `ghostcontrol-api`, `ghostcontrol-db`, `ghostcontrol-ingest`, `ghostcontrol-redis`, `ghostcontrol-runner`, `ghostl-api`, `ghostl-worker`, `ghostl-worker-redis`, `key-rotation-service`, `l1-mainnet-geth`, `migrate`, `peer-graph-service`, `pil-migrate`, `pil-postgres`, `postgres`, `redis`, `slashing-detection-service`, `transfer-lifecycle-service`, `validator-service`, `vault`

Generated: 2026-02-15T21:37:37.000136Z

Notes:
- Excludes backups/, releases/, ops/, node_modules/, dist/, .tmp/ for signal-to-noise.
- Service details are derived from docker compose config (JSON).

## apps/docker-compose.dev.yml
- ghostl-api | ports=4000->4000/tcp | env_files=none | volumes=2 | healthcheck=no | networks=default,ghost_net,ghostchain-compliance_default
- ghostl-web | ports=3200->3200/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default,ghost_net,ghostchain-compliance_default
- ghostl-worker | ports=7310->7310/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default,ghost_net,ghostchain-compliance_default
- ghostl-worker-redis | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default

## apps/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## core-service/docker-compose.yml
- core-service | ports=8080->8080/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default

## docker-compose.agents.yml
- agent-registry | ports=7701->7701/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- auditor-agent | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- coder-agent | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- docs-agent | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- evidence-service | ports=17641->7641/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- governance-service | ports=17645->7645/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- ops-agent | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- planner-agent | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- router-agent | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- watchdog-agent | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default

## docker-compose.autonomy.yml
- consensus-telemetry-service | ports=17635->7635/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- ghost-mapper | ports=17780->7780/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default,ghost_net,ghostchain,opstack_default
- ghost-registry | ports=28088->8088/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- network-context-service | ports=17633->7633/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- network-manager-service | ports=17766->7766/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default

## docker-compose.dev.yml
- ghostl-api | ports=4000->4000/tcp | env_files=none | volumes=2 | healthcheck=no | networks=default
- ghostl-web | ports=3200->3200/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default

## docker-compose.phase3.secrets.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/docker-compose.phase3.secrets.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## docker-compose.phase3.yml
- ai-monitor | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_internal
- bridge-service | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_internal
- ghost-guard | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_internal
- ghost-mapper | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_interchain,ghost_internal
- ghost-registry | ports=none | env_files=none | volumes=0 | healthcheck=yes | networks=ghost_internal
- liquidity-service | ports=none | env_files=none | volumes=0 | healthcheck=yes | networks=ghost_internal

## docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/docker/_backup/20260121-1909/core-service/docker-compose.yml
- core-service | ports=8080->8080/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default

## infra/docker/_backup/20260121-1909/docker-compose.dev.yml
- ghostl-api | ports=4000->4000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- ghostl-web | ports=3200->3200/tcp | env_files=none | volumes=2 | healthcheck=no | networks=default

## infra/docker/_backup/20260121-1909/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- ghost-ui | ports=3200->3200/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/docker/_backup/20260121-1909/infra/ghostchain/docker-compose.eth.yml
- ghostchain-bootnode | ports=30301->30301/udp | env_files=none | volumes=1 | healthcheck=no | networks=ghostchain
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18552->8551/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=ghostchain
- ghostscout | ports=18644->4000/tcp | env_files=none | volumes=0 | healthcheck=no | networks=ghostchain
- ghostscout-db | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=ghostchain

## infra/docker/_backup/20260121-1909/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.mainnet-geth.yml
- l1-mainnet-geth | ports=38545->8545/tcp,38546->8546/tcp,38551->8551/tcp,38660->6060/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default

## infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.network-manager.yml
- network-manager | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default

## infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l2-geth | ports=29547->8545/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- prometheus | ports=9090->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/docker/_backup/20260121-1909/infra/opstack/optimism-upstream/interop-devnet/docker-compose.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/docker/_backup/20260121-1909/infra/opstack/optimism-upstream/interop-devnet/docker-compose.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/docker/_backup/20260121-1909/infra/opstack/optimism-upstream/ops-bedrock/docker-compose.yml
- artifact-server | ports=8080->80/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- da-server | ports=3100->3100/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- l1 | ports=8545->8545/tcp,8546->8546/tcp,7060->6060/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-bn | ports=9000->9000/tcp,5052->5052/tcp | env_files=none | volumes=5 | healthcheck=no | networks=default
- l1-vc | ports=none | env_files=none | volumes=6 | healthcheck=no | networks=default
- l2 | ports=9545->8545/tcp,8060->6060/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- op-batcher | ports=6061->6060/tcp,7301->7300/tcp,6545->8545/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- op-challenger | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=default
- op-node | ports=7545->8545/tcp,9003->9003/tcp,7300->7300/tcp,6060->6060/tcp | env_files=none | volumes=6 | healthcheck=no | networks=default
- op-proposer | ports=6062->6060/tcp,7302->7300/tcp,6546->8545/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- sentinel | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default

## infra/docker/_backup/20260121-1909/observability/infra/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=no | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=no | networks=default
- prometheus | ports=9090->9090/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/docker/_backup/20260121-1909/services/docker-compose.yml
- ai-clock-sync | ports=7690->7690/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- ai-monitor | ports=7575->7575/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- alerts-service | ports=7644->7644/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- anomaly-detection-service | ports=7616->7616/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- audit-log-service | ports=7641->7641/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- auth-service | ports=7639->7639/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- block-index-service | ports=7626->7626/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- bridge-service | ports=7604->7604/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- chain-status-service | ports=7612->7612/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- command-palette-service | ports=7642->7642/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- compliance-export-service | ports=7621->7621/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- consensus-telemetry-service | ports=7635->7635/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- contract-registry-service | ports=7608->7608/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- contract-risk-service | ports=7609->7609/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- dispute-service | ports=7607->7607/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- entity-tagging-service | ports=7627->7627/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- explainability-service | ports=7632->7632/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- feature-flags-service | ports=7611->7611/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- fee-model-service | ports=7615->7615/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- forecasting-service | ports=7617->7617/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- ghost-registry | ports=18088->8088/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- ghost-relayer | ports=7171->7171/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- ghost-rollup-challenger | ports=7282->7282/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- ghost-rollup-proposer | ports=7272->7272/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- ghost-rpc-proxy | ports=8546->8546/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- global-search-service | ports=7637->7637/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- governance-service | ports=7645->7645/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- key-rotation-service | ports=7619->7619/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- liquidity-service | ports=7606->7606/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- mempool-service | ports=7610->7610/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- network-context-service | ports=7633->7633/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- network-manager-service | ports=7766->7766/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- node-health-service | ports=7613->7613/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- node-inventory-service | ports=7622->7622/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- notifications-service | ports=7638->7638/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- participation-service | ports=7603->7603/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- payout-service | ports=7629->7629/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- peer-graph-service | ports=7636->7636/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- proxy-inspector-service | ports=7631->7631/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- rbac-service | ports=7640->7640/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- rewards-service | ports=7602->7602/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- rpc-forward-l1-29545 | ports=29545->29545/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- secrets-health-service | ports=7618->7618/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- session-service | ports=7643->7643/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- slashing-detection-service | ports=7620->7620/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- snapshot-service | ports=7624->7624/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- staking-service | ports=7601->7601/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- supply-service | ports=7614->7614/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- theme-service | ports=7634->7634/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- transfer-lifecycle-service | ports=7605->7605/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- treasury-service | ports=7628->7628/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- tx-index-service | ports=7625->7625/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- upgrade-orchestrator-service | ports=7623->7623/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- validator-service | ports=7600->7600/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- verification-service | ports=7630->7630/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default

## infra/docker/compose/docker-compose.ai.yml
- ai-clock-sync | ports=7690->7690/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- ai-monitor | ports=7575->7575/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- anomaly-detection-service | ports=7616->7616/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- explainability-service | ports=7632->7632/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- forecasting-service | ports=7617->7617/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- ghost-ai-attestor | ports=3310->3310/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default

## infra/docker/compose/docker-compose.core.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/docker/compose/docker-compose.core.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/docker/compose/docker-compose.obs.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=no | networks=default,opstack_default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=no | networks=default
- prometheus | ports=9090->9090/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/docker/compose/docker-compose.services.yml
- ai-clock-sync | ports=7690->7690/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- ai-monitor | ports=7575->7575/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- alerts-service | ports=7644->7644/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- anomaly-detection-service | ports=7616->7616/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- audit-log-service | ports=7641->7641/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- auth-service | ports=7639->7639/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- block-index-service | ports=7626->7626/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- bridge-service | ports=7604->7604/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- chain-status-service | ports=7612->7612/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- command-palette-service | ports=7642->7642/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- compliance-export-service | ports=7621->7621/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- consensus-telemetry-service | ports=7635->7635/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- contract-registry-service | ports=7608->7608/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- contract-risk-service | ports=7609->7609/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- core-service | ports=8080->8080/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- dispute-service | ports=7607->7607/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- entity-tagging-service | ports=7627->7627/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- explainability-service | ports=7632->7632/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- feature-flags-service | ports=7611->7611/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- fee-model-service | ports=7615->7615/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- forecasting-service | ports=7617->7617/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- ghost-registry | ports=18088->8088/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- ghost-relayer | ports=7171->7171/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- ghost-rollup-challenger | ports=7282->7282/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- ghost-rollup-proposer | ports=7272->7272/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- ghost-rpc-proxy | ports=8546->8546/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- ghost-ui | ports=3200->3200/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- global-search-service | ports=7637->7637/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- governance-service | ports=7645->7645/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- key-rotation-service | ports=7619->7619/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- liquidity-service | ports=7606->7606/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- mempool-service | ports=7610->7610/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- network-context-service | ports=7633->7633/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- network-manager-service | ports=7766->7766/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- node-health-service | ports=7613->7613/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- node-inventory-service | ports=7622->7622/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- notifications-service | ports=7638->7638/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- participation-service | ports=7603->7603/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- payout-service | ports=7629->7629/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- peer-graph-service | ports=7636->7636/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- proxy-inspector-service | ports=7631->7631/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- rbac-service | ports=7640->7640/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- rewards-service | ports=7602->7602/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- rpc-forward-l1-29545 | ports=29545->29545/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- secrets-health-service | ports=7618->7618/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- session-service | ports=7643->7643/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- slashing-detection-service | ports=7620->7620/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- snapshot-service | ports=7624->7624/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- staking-service | ports=7601->7601/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- supply-service | ports=7614->7614/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- theme-service | ports=7634->7634/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- transfer-lifecycle-service | ports=7605->7605/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- treasury-service | ports=7628->7628/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- tx-index-service | ports=7625->7625/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- upgrade-orchestrator-service | ports=7623->7623/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- validator-service | ports=7600->7600/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- verification-service | ports=7630->7630/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default

## infra/docker/compose/docker-compose.ui.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/docker/compose/docker-compose.ui.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/docker/liquidity-gravity/docker-compose.yml
- external-evm | ports=38545->8545/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=lge_net
- ghostchain-l1 | ports=18545->8545/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=lge_net
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=obs_net
- liquidity-router | ports=7607->7607/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=lge_net,obs_net
- prometheus | ports=9090->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=obs_net
- vault | ports=8200->8200/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=lge_net

## infra/evidence/out/evidence-pack-l1-20260202T132538Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260202T132538Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260202T132538Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260202T132538Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260202T133818Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260202T133818Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260202T133818Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260202T133818Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260202T134135Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260202T134135Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260202T134135Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260202T134135Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260202T134249Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260202T134249Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260202T134249Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260202T134249Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260202T141647Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260202T141647Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260202T141647Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260202T141647Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260202T141757Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260202T141757Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260202T141757Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260202T141757Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260202T142035Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260202T142035Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260202T142035Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260202T142035Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260202T142718Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260202T142718Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260202T142718Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260202T142718Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260202T151403Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260202T151403Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260202T151403Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260202T151403Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260202T152510Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260202T152510Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260202T152510Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260202T152510Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260202T154229Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260202T154229Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260202T154229Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260202T154229Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260202T154243Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260202T154243Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260202T154243Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260202T154243Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260203T123104Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260203T123104Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260203T123104Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260203T123104Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260203T123126Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260203T123126Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260203T123126Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260203T123126Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260203T124507Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260203T124507Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260203T124507Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260203T124507Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260203T124932Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260203T124932Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260203T124932Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260203T124932Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260204T120111Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260204T120111Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260204T120111Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260204T120111Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260204T144822Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260204T144822Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260204T144822Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260204T144822Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260205T032500Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260205T032500Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260205T032500Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260205T032500Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260205T032808Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260205T032808Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260205T032808Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260205T032808Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260205T202132Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260205T202132Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260205T202132Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260205T202132Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260205T202235Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260205T202235Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260205T202235Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260205T202235Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260206T034922Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260206T034922Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260206T034922Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260206T034922Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260206T042556Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260206T042556Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260206T042556Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260206T042556Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260206T101044Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260206T101044Z/snapshots/infra/ghostchain/docker-compose.eth.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260206T101044Z/snapshots/infra/ghostchain/docker-compose.eth.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260206T101044Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260215T031416Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260215T031416Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260215T031416Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260215T031416Z/snapshots/infra/ghostchain/docker-compose.l1.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260215T032332Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260215T032332Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260215T032332Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260215T032332Z/snapshots/infra/ghostchain/docker-compose.l1.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260215T032811Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260215T032811Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260215T032811Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260215T032811Z/snapshots/infra/ghostchain/docker-compose.l1.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260215T034050Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260215T034050Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260215T034050Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260215T034050Z/snapshots/infra/ghostchain/docker-compose.l1.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260215T035311Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260215T035311Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260215T035311Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260215T035311Z/snapshots/infra/ghostchain/docker-compose.l1.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260215T123335Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260215T123335Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260215T123335Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260215T123335Z/snapshots/infra/ghostchain/docker-compose.l1.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260215T125902Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260215T125902Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260215T125902Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260215T125902Z/snapshots/infra/ghostchain/docker-compose.l1.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l1-20260215T162807Z/snapshots/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-compliance-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- postgres | ports=5432->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- redis | ports=6379->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default

## infra/evidence/out/evidence-pack-l1-20260215T162807Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/evidence/out/evidence-pack-l1-20260215T162807Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l1-20260215T162807Z/snapshots/infra/ghostchain/docker-compose.l1.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260204T120157Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260204T120157Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260204T120157Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260204T120157Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260204T120157Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260204T144910Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260204T144910Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260204T144910Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260204T144910Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260204T144910Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260205T032739Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260205T032739Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260205T032739Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260205T032739Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260205T032739Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260205T083126Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260205T083126Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260205T083126Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260205T083126Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260205T083126Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260205T202334Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260205T202334Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260205T202334Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260205T202334Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260205T202334Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260206T035002Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T035002Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T035002Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T035002Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T035002Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260206T042637Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T042637Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T042637Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T042637Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T042637Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260206T084616Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T084616Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T084616Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T084616Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T084616Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260206T110243Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T110243Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T110243Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T110243Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T110243Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260206T113048Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T113048Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T113048Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T113048Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T113048Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260206T113831Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T113831Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T113831Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T113831Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T113831Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260206T132035Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T132035Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T132035Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260206T132035Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260206T132035Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260215T035902Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260215T035902Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260215T035902Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260215T035902Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260215T035902Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260215T122448Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260215T122448Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260215T122448Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260215T122448Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260215T122448Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260215T163250Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260215T163250Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260215T163250Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260215T163250Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260215T163250Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l2-20260215T171542Z/snapshots/infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260215T171542Z/snapshots/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260215T171542Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l2-20260215T171542Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l2-20260215T171542Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260203T190609Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260203T190609Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260203T190609Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260203T191530Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260203T191530Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260203T191530Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260203T191630Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260203T191630Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260203T191630Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260203T191811Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260203T191811Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260203T191811Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260203T192351Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260203T192351Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260203T192351Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260204T120216Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260204T120216Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260204T120216Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260204T144930Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260204T144930Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260204T144930Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260205T032758Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260205T032758Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260205T032758Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260205T082205Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260205T082205Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260205T082205Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260205T082621Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260205T082621Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260205T082621Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260205T092216Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260205T092216Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260205T092216Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260205T202400Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260205T202400Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260205T202400Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260206T035019Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260206T035019Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260206T035019Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260206T042653Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260206T042653Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260206T042653Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260206T084638Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260206T084638Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260206T084638Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260206T110305Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260206T110305Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260206T110305Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260206T113106Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260206T113106Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260206T113106Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260206T113849Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260206T113849Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260206T113849Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260206T132053Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260206T132053Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260206T132053Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260215T040314Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260215T040314Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260215T040314Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260215T122908Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260215T122908Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260215T122908Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260215T163649Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260215T163649Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260215T163649Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/evidence/out/evidence-pack-l3-20260215T171933Z/snapshots/infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/evidence/out/evidence-pack-l3-20260215T171933Z/snapshots/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/evidence/out/evidence-pack-l3-20260215T171933Z/snapshots/infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1 | ports=18545->8545/tcp,18546->8546/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node3 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain
- ghostchain-node4 | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostchain

## infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode | ports=30301->30301/udp | env_files=none | volumes=1 | healthcheck=no | networks=ghostchain
- ghostchain-node1 | ports=18546->8546/tcp,18552->8551/tcp,18551->30303/tcp,18660->6060/tcp | env_files=none | volumes=4 | healthcheck=yes | networks=ghostchain
- ghostchain-node2 | ports=none | env_files=none | volumes=4 | healthcheck=no | networks=ghostchain
- ghostchain-rpc-proxy | ports=18545->8545/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=ghostchain

## infra/opstack/docker-compose.challengers.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/opstack/docker-compose.challengers.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/opstack/docker-compose.l3.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/opstack/docker-compose.l3.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/opstack/docker-compose.mainnet-geth.yml
- l1-mainnet-geth | ports=38545->8545/tcp,38546->8546/tcp,38551->8551/tcp,38660->6060/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default

## infra/opstack/docker-compose.network-manager.yml
- network-manager | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default

## infra/opstack/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- ghost-guard | ports=7070->7070/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- ghost-rpc-proxy-l1 | ports=none | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-rpc-proxy-l2 | ports=none | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-rpc-proxy-l3 | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- hyper-ghost-supervisor | ports=7077->7077/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l1-rpc-proxy | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- l2-geth | ports=29547->8545/tcp,29548->8546/tcp,29606->6060/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-batcher | ports=8551->8551/tcp,7301->7301/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate | ports=28546->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-gate-l1 | ports=28547->8545/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-node | ports=9546->9546/tcp,7300->7300/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- op-proposer | ports=8560->8560/tcp,7302->7302/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- op-sequencer | ports=9646->9646/tcp,7303->7303/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=default
- prometheus | ports=9091->9090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=default
- rpc-forward-l2-18547 | ports=18547->18547/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- vector | ports=none | env_files=none | volumes=3 | healthcheck=no | networks=default

## infra/opstack/optimism-upstream/interop-devnet/docker-compose.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/infra/opstack/optimism-upstream/interop-devnet/docker-compose.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## infra/opstack/optimism-upstream/ops-bedrock/docker-compose.yml
- artifact-server | ports=8080->80/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- da-server | ports=3100->3100/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- l1 | ports=8545->8545/tcp,8546->8546/tcp,7060->6060/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- l1-bn | ports=9000->9000/tcp,5052->5052/tcp | env_files=none | volumes=5 | healthcheck=no | networks=default
- l1-vc | ports=none | env_files=none | volumes=6 | healthcheck=no | networks=default
- l2 | ports=9545->8545/tcp,8060->6060/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- op-batcher | ports=6061->6060/tcp,7301->7300/tcp,6545->8545/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- op-challenger | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=default
- op-node | ports=7545->8545/tcp,9003->9003/tcp,7300->7300/tcp,6060->6060/tcp | env_files=none | volumes=6 | healthcheck=no | networks=default
- op-proposer | ports=6062->6060/tcp,7302->7300/tcp,6546->8545/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- sentinel | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default

## observability/infra/docker-compose.yml
- alertmanager | ports=9093->9093/tcp | env_files=none | volumes=2 | healthcheck=no | networks=default
- grafana | ports=3000->3000/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default
- loki | ports=3100->3100/tcp | env_files=none | volumes=2 | healthcheck=no | networks=default
- prometheus | ports=9090->9090/tcp | env_files=none | volumes=3 | healthcheck=no | networks=default,opstack_default

## services/ai-clock-sync/docker-compose.yml
- ai-clock-sync | ports=7690->7690/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net,opstack_default

## services/ai-clock-sync/rollback/20260125-131922/docker-compose.yml
- error: failed to render compose config (Command '['docker', 'compose', '-f', '/home/ghost/ghostl-stack/services/ai-clock-sync/rollback/20260125-131922/docker-compose.yml', 'config', '--format', 'json']' returned non-zero exit status 1.)

## services/ai-clock-sync/rollback/20260125-132116/docker-compose.yml
- ai-clock-sync | ports=7690->7690/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ai-clock-sync/rollback/20260125-132244/docker-compose.yml
- ai-clock-sync | ports=7690->7690/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ai-clock-sync/rollback/20260125-132411/docker-compose.yml
- ai-clock-sync | ports=7690->7690/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ai-monitor/docker-compose.yml
- ai-monitor-l1 | ports=7576->7576/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net,opstack_default
- ai-monitor-l3 | ports=7577->7577/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net,opstack_default

## services/ai-monitor/rollback/20260125-132116/docker-compose.yml
- ai-monitor | ports=7575->7575/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ai-monitor/rollback/20260125-132244/docker-compose.yml
- ai-monitor | ports=7575->7575/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ai-monitor/rollback/20260125-132411/docker-compose.yml
- ai-monitor | ports=7575->7575/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ai-vault/docker-compose.yml
- ai-vault | ports=7710->7710/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default

## services/alerts-service/docker-compose.yml
- alerts-service | ports=7644->7644/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/alerts-service/rollback/20260125-132116/docker-compose.yml
- alerts-service | ports=7644->7644/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/alerts-service/rollback/20260125-132244/docker-compose.yml
- alerts-service | ports=7644->7644/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/alerts-service/rollback/20260125-132411/docker-compose.yml
- alerts-service | ports=7644->7644/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/anomaly-detection-service/docker-compose.yml
- anomaly-detection-service | ports=7616->7616/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/anomaly-detection-service/rollback/20260125-132116/docker-compose.yml
- anomaly-detection-service | ports=7616->7616/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/anomaly-detection-service/rollback/20260125-132244/docker-compose.yml
- anomaly-detection-service | ports=7616->7616/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/anomaly-detection-service/rollback/20260125-132411/docker-compose.yml
- anomaly-detection-service | ports=7616->7616/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/audit-log-service/docker-compose.yml
- audit-log-service | ports=7641->7641/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/audit-log-service/rollback/20260125-132116/docker-compose.yml
- audit-log-service | ports=7641->7641/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/audit-log-service/rollback/20260125-132244/docker-compose.yml
- audit-log-service | ports=7641->7641/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/audit-log-service/rollback/20260125-132411/docker-compose.yml
- audit-log-service | ports=7641->7641/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/auth-service/docker-compose.yml
- auth-service | ports=7639->7639/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/auth-service/rollback/20260125-132116/docker-compose.yml
- auth-service | ports=7639->7639/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/auth-service/rollback/20260125-132244/docker-compose.yml
- auth-service | ports=7639->7639/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/auth-service/rollback/20260125-132411/docker-compose.yml
- auth-service | ports=7639->7639/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/block-index-service/docker-compose.yml
- block-index-service | ports=7626->7626/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/block-index-service/rollback/20260125-132116/docker-compose.yml
- block-index-service | ports=7626->7626/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/block-index-service/rollback/20260125-132244/docker-compose.yml
- block-index-service | ports=7626->7626/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/block-index-service/rollback/20260125-132411/docker-compose.yml
- block-index-service | ports=7626->7626/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/bridge-service/docker-compose.yml
- bridge-service | ports=7604->7604/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/bridge-service/rollback/20260125-132116/docker-compose.yml
- bridge-service | ports=7604->7604/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/bridge-service/rollback/20260125-132244/docker-compose.yml
- bridge-service | ports=7604->7604/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/bridge-service/rollback/20260125-132411/docker-compose.yml
- bridge-service | ports=7604->7604/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/chain-status-service/docker-compose.yml
- chain-status-service | ports=7612->7612/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/chain-status-service/rollback/20260125-132116/docker-compose.yml
- chain-status-service | ports=7612->7612/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/chain-status-service/rollback/20260125-132244/docker-compose.yml
- chain-status-service | ports=7612->7612/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/chain-status-service/rollback/20260125-132411/docker-compose.yml
- chain-status-service | ports=7612->7612/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/command-palette-service/docker-compose.yml
- command-palette-service | ports=7642->7642/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/command-palette-service/rollback/20260125-132116/docker-compose.yml
- command-palette-service | ports=7642->7642/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/command-palette-service/rollback/20260125-132244/docker-compose.yml
- command-palette-service | ports=7642->7642/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/command-palette-service/rollback/20260125-132411/docker-compose.yml
- command-palette-service | ports=7642->7642/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/compliance-export-service/docker-compose.yml
- compliance-export-service | ports=7621->7621/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/compliance-export-service/rollback/20260125-132116/docker-compose.yml
- compliance-export-service | ports=7621->7621/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/compliance-export-service/rollback/20260125-132244/docker-compose.yml
- compliance-export-service | ports=7621->7621/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/compliance-export-service/rollback/20260125-132411/docker-compose.yml
- compliance-export-service | ports=7621->7621/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/consensus-telemetry-service/docker-compose.yml
- consensus-telemetry-service | ports=7635->7635/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/consensus-telemetry-service/rollback/20260125-132116/docker-compose.yml
- consensus-telemetry-service | ports=7635->7635/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/consensus-telemetry-service/rollback/20260125-132244/docker-compose.yml
- consensus-telemetry-service | ports=7635->7635/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/consensus-telemetry-service/rollback/20260125-132411/docker-compose.yml
- consensus-telemetry-service | ports=7635->7635/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/contract-registry-service/docker-compose.yml
- contract-registry-service | ports=7608->7608/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/contract-registry-service/rollback/20260125-132116/docker-compose.yml
- contract-registry-service | ports=7608->7608/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/contract-registry-service/rollback/20260125-132244/docker-compose.yml
- contract-registry-service | ports=7608->7608/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/contract-registry-service/rollback/20260125-132411/docker-compose.yml
- contract-registry-service | ports=7608->7608/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/contract-risk-service/docker-compose.yml
- contract-risk-service | ports=7609->7609/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/contract-risk-service/rollback/20260125-132116/docker-compose.yml
- contract-risk-service | ports=7609->7609/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/contract-risk-service/rollback/20260125-132244/docker-compose.yml
- contract-risk-service | ports=7609->7609/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/contract-risk-service/rollback/20260125-132411/docker-compose.yml
- contract-risk-service | ports=7609->7609/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/dispute-service/docker-compose.yml
- dispute-service | ports=7607->7607/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/dispute-service/rollback/20260125-132116/docker-compose.yml
- dispute-service | ports=7607->7607/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/dispute-service/rollback/20260125-132244/docker-compose.yml
- dispute-service | ports=7607->7607/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/dispute-service/rollback/20260125-132411/docker-compose.yml
- dispute-service | ports=7607->7607/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/docker-compose.legacy.yml
- ai-clock-sync | ports=7690->7690/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- ai-vault | ports=7710->7710/tcp | env_files=none | volumes=1 | healthcheck=no | networks=default
- ai-vault-dev | ports=8200->8200/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- alerts-service | ports=7644->7644/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- anomaly-detection-service | ports=7616->7616/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- audit-log-service | ports=7641->7641/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- auth-service | ports=7639->7639/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- block-index-service | ports=7626->7626/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- bridge-service | ports=7604->7604/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- chain-status-service | ports=7612->7612/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- command-palette-service | ports=7642->7642/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- compliance-export-service | ports=7621->7621/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- consensus-telemetry-service | ports=7635->7635/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- contract-registry-service | ports=7608->7608/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- contract-risk-service | ports=7609->7609/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- dispute-service | ports=7607->7607/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- entity-tagging-service | ports=7627->7627/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- explainability-service | ports=7632->7632/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- feature-flags-service | ports=7611->7611/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- fee-model-service | ports=7615->7615/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- forecasting-service | ports=7617->7617/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- gas-engine-migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- gas-engine-postgres | ports=5433->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- gas-engine-redis | ports=6381->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- ghost-gas-engine | ports=3210->3210/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- ghost-gas-engine-worker | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=default
- ghost-pil | ports=3220->3220/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-pil-worker | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=default
- ghost-registry | ports=18088->8088/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- ghost-relayer | ports=7171->7171/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default,opstack_default
- ghost-rollup-challenger | ports=7282->7282/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- ghost-rollup-challenger-l2 | ports=7283->7283/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- ghost-rollup-proposer | ports=7272->7272/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- ghost-rollup-proposer-l2 | ports=7273->7273/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- ghost-rpc-proxy | ports=8546->8546/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- global-search-service | ports=7637->7637/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- governance-service | ports=7645->7645/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- key-rotation-service | ports=7619->7619/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- liquidity-service | ports=7606->7606/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- mempool-service | ports=7610->7610/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- network-context-service | ports=7633->7633/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- network-manager-service | ports=7766->7766/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- node-health-service | ports=7613->7613/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- node-inventory-service | ports=7622->7622/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- notifications-service | ports=7638->7638/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- participation-service | ports=7603->7603/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- payout-service | ports=7629->7629/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- peer-graph-service | ports=7636->7636/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- pil-migrate | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=default
- pil-postgres | ports=5434->5432/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- preconfirm-l2-service | ports=7691->7691/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- preconfirm-l3-service | ports=7692->7692/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- proxy-inspector-service | ports=7631->7631/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- rbac-service | ports=7640->7640/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- rewards-service | ports=7602->7602/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- rpc-forward-l1-29545 | ports=29545->29545/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- secrets-health-service | ports=7618->7618/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- session-service | ports=7643->7643/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- slashing-detection-service | ports=7620->7620/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- snapshot-service | ports=7624->7624/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- staking-service | ports=7601->7601/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- supply-service | ports=7614->7614/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- theme-service | ports=7634->7634/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- transfer-lifecycle-service | ports=7605->7605/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- treasury-service | ports=7628->7628/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=default
- tx-index-service | ports=7625->7625/tcp | env_files=none | volumes=0 | healthcheck=no | networks=default
- upgrade-orchestrator-service | ports=7623->7623/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- validator-service | ports=7600->7600/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default
- verification-service | ports=7630->7630/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=default

## services/entity-tagging-service/docker-compose.yml
- entity-tagging-service | ports=7627->7627/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/entity-tagging-service/rollback/20260125-132116/docker-compose.yml
- entity-tagging-service | ports=7627->7627/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/entity-tagging-service/rollback/20260125-132244/docker-compose.yml
- entity-tagging-service | ports=7627->7627/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/entity-tagging-service/rollback/20260125-132411/docker-compose.yml
- entity-tagging-service | ports=7627->7627/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/explainability-service/docker-compose.yml
- explainability-service | ports=7632->7632/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/explainability-service/rollback/20260125-132116/docker-compose.yml
- explainability-service | ports=7632->7632/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/explainability-service/rollback/20260125-132244/docker-compose.yml
- explainability-service | ports=7632->7632/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/explainability-service/rollback/20260125-132411/docker-compose.yml
- explainability-service | ports=7632->7632/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/feature-flags-service/docker-compose.yml
- feature-flags-service | ports=7611->7611/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/feature-flags-service/rollback/20260125-132116/docker-compose.yml
- feature-flags-service | ports=7611->7611/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/feature-flags-service/rollback/20260125-132244/docker-compose.yml
- feature-flags-service | ports=7611->7611/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/feature-flags-service/rollback/20260125-132411/docker-compose.yml
- feature-flags-service | ports=7611->7611/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/fee-model-service/docker-compose.yml
- fee-model-service | ports=7615->7615/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/fee-model-service/rollback/20260125-132116/docker-compose.yml
- fee-model-service | ports=7615->7615/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/fee-model-service/rollback/20260125-132244/docker-compose.yml
- fee-model-service | ports=7615->7615/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/fee-model-service/rollback/20260125-132411/docker-compose.yml
- fee-model-service | ports=7615->7615/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/forecasting-service/docker-compose.yml
- forecasting-service | ports=7617->7617/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/forecasting-service/rollback/20260125-132116/docker-compose.yml
- forecasting-service | ports=7617->7617/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/forecasting-service/rollback/20260125-132244/docker-compose.yml
- forecasting-service | ports=7617->7617/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/forecasting-service/rollback/20260125-132411/docker-compose.yml
- forecasting-service | ports=7617->7617/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/gas-engine-migrate/docker-compose.yml
- gas-engine-migrate | ports=none | env_files=none | volumes=4 | healthcheck=yes | networks=ghost_net

## services/gas-engine-migrate/rollback/20260125-132116/docker-compose.yml
- gas-engine-migrate | ports=none | env_files=none | volumes=2 | healthcheck=yes | networks=ghost_net

## services/gas-engine-migrate/rollback/20260125-132244/docker-compose.yml
- gas-engine-migrate | ports=none | env_files=none | volumes=2 | healthcheck=yes | networks=ghost_net

## services/gas-engine-migrate/rollback/20260125-132411/docker-compose.yml
- gas-engine-migrate | ports=none | env_files=none | volumes=2 | healthcheck=yes | networks=ghost_net

## services/gas-engine-postgres/docker-compose.yml
- gas-engine-postgres | ports=5433->5432/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/gas-engine-postgres/rollback/20260125-132116/docker-compose.yml
- gas-engine-postgres | ports=5433->5432/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=ghost_net

## services/gas-engine-postgres/rollback/20260125-132244/docker-compose.yml
- gas-engine-postgres | ports=5433->5432/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=ghost_net

## services/gas-engine-postgres/rollback/20260125-132411/docker-compose.yml
- gas-engine-postgres | ports=5433->5432/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=ghost_net

## services/gas-engine-redis/docker-compose.yml
- gas-engine-redis | ports=6381->6379/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/gas-engine-redis/rollback/20260125-132116/docker-compose.yml
- gas-engine-redis | ports=6381->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/gas-engine-redis/rollback/20260125-132244/docker-compose.yml
- gas-engine-redis | ports=6381->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/gas-engine-redis/rollback/20260125-132411/docker-compose.yml
- gas-engine-redis | ports=6381->6379/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-ai-attestor/docker-compose.yml
- ghost-ai-attestor | ports=3310->3310/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/ghost-compliance/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghostchain-compliance_default

## services/ghost-compliance/rollback/20260125-132116/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-compliance/rollback/20260125-132244/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-compliance/rollback/20260125-132411/docker-compose.yml
- ghost-compliance | ports=8090->8090/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-compliance-worker/docker-compose.yml
- ghost-compliance-worker | ports=none | env_files=none | volumes=3 | healthcheck=yes | networks=ghostchain-compliance_default

## services/ghost-compliance-worker/rollback/20260125-132116/docker-compose.yml
- ghost-compliance-worker | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-compliance-worker/rollback/20260125-132244/docker-compose.yml
- ghost-compliance-worker | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-compliance-worker/rollback/20260125-132411/docker-compose.yml
- ghost-compliance-worker | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-gas-engine/docker-compose.yml
- ghost-gas-engine | ports=3210->3210/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/ghost-gas-engine/rollback/20260125-132116/docker-compose.yml
- ghost-gas-engine | ports=3210->3210/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-gas-engine/rollback/20260125-132244/docker-compose.yml
- ghost-gas-engine | ports=3210->3210/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-gas-engine/rollback/20260125-132411/docker-compose.yml
- ghost-gas-engine | ports=3210->3210/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-gas-engine-worker/docker-compose.yml
- ghost-gas-engine-worker | ports=none | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/ghost-gas-engine-worker/rollback/20260125-132244/docker-compose.yml
- ghost-gas-engine-worker | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-gas-engine-worker/rollback/20260125-132411/docker-compose.yml
- ghost-gas-engine-worker | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-mapper/docker-compose.yml
- ghost-mapper | ports=7780->7780/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net,opstack_default

## services/ghost-pil/docker-compose.yml
- ghost-pil | ports=3220->3220/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/ghost-pil/rollback/20260125-132411/docker-compose.yml
- ghost-pil | ports=3220->3220/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-pil-worker/docker-compose.yml
- ghost-pil-worker | ports=none | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/ghost-pil-worker/rollback/20260125-132411/docker-compose.yml
- ghost-pil-worker | ports=none | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-registry/docker-compose.yml
- ghost-registry | ports=18088->8088/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/ghost-registry/rollback/20260125-132411/docker-compose.yml
- ghost-registry | ports=18088->8088/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghost-relayer/docker-compose.yml
- ghost-relayer | ports=7171->7171/tcp | env_files=none | volumes=4 | healthcheck=yes | networks=ghost_net,opstack_default

## services/ghost-relayer/rollback/20260125-132411/docker-compose.yml
- ghost-relayer | ports=7171->7171/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=ghost_net

## services/ghost-rollup-challenger/docker-compose.yml
- ghost-rollup-challenger | ports=7282->7282/tcp | env_files=none | volumes=4 | healthcheck=yes | networks=ghost_net,opstack_default

## services/ghost-rollup-challenger/rollback/20260125-132411/docker-compose.yml
- ghost-rollup-challenger | ports=7282->7282/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=ghost_net

## services/ghost-rollup-proposer/docker-compose.yml
- ghost-rollup-proposer | ports=7272->7272/tcp | env_files=none | volumes=4 | healthcheck=yes | networks=ghost_net,opstack_default

## services/ghost-rollup-proposer/rollback/20260125-132411/docker-compose.yml
- ghost-rollup-proposer | ports=7272->7272/tcp | env_files=none | volumes=2 | healthcheck=yes | networks=ghost_net

## services/ghost-rpc-proxy/docker-compose.yml
- ghost-rpc-proxy | ports=8546->8546/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net,opstack_default

## services/ghost-rpc-proxy/rollback/20260125-132411/docker-compose.yml
- ghost-rpc-proxy | ports=8546->8546/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/ghostscout-db/docker-compose.yml
- ghostscout-db | ports=none | env_files=none | volumes=5 | healthcheck=yes | networks=ghostchain_ghostchain,opstack_default

## services/ghostscout-db/rollback/20260125-132411/docker-compose.yml
- ghostscout-db | ports=none | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/ghostscout-frontend-l1/docker-compose.yml
- ghostscout-frontend-l1 | ports=18651->3000/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghostchain_ghostchain,opstack_default

## services/ghostscout-frontend-l2/docker-compose.yml
- ghostscout-frontend-l2 | ports=18652->3000/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghostchain_ghostchain,opstack_default

## services/ghostscout-frontend-l3/docker-compose.yml
- ghostscout-frontend-l3 | ports=18653->3000/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghostchain_ghostchain,opstack_default

## services/ghostscout-l1/docker-compose.yml
- ghostscout-l1 | ports=18641->4000/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghostchain_ghostchain,opstack_default

## services/ghostscout-l2/docker-compose.yml
- ghostscout-l2 | ports=18642->4000/tcp | env_files=none | volumes=5 | healthcheck=yes | networks=ghostchain_ghostchain,opstack_default

## services/ghostscout-l3/docker-compose.yml
- ghostscout-l3 | ports=18643->4000/tcp | env_files=none | volumes=5 | healthcheck=yes | networks=ghostchain_ghostchain,opstack_default

## services/global-search-service/docker-compose.yml
- global-search-service | ports=7637->7637/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/governance-service/docker-compose.yml
- governance-service | ports=7645->7645/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/key-rotation-service/docker-compose.yml
- key-rotation-service | ports=7619->7619/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/liquidity-service/docker-compose.yml
- liquidity-service | ports=7606->7606/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/mempool-service/docker-compose.yml
- mempool-service | ports=7610->7610/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/network-context-service/docker-compose.yml
- network-context-service | ports=7633->7633/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/network-manager-service/docker-compose.yml
- network-manager-service | ports=7766->7766/tcp | env_files=none | volumes=4 | healthcheck=yes | networks=ghost_net,opstack_default

## services/node-health-service/docker-compose.yml
- node-health-service | ports=7613->7613/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/node-inventory-service/docker-compose.yml
- node-inventory-service | ports=7622->7622/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/notifications-service/docker-compose.yml
- notifications-service | ports=7638->7638/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/participation-service/docker-compose.yml
- participation-service | ports=7603->7603/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/payout-service/docker-compose.yml
- payout-service | ports=7629->7629/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/peer-graph-service/docker-compose.yml
- peer-graph-service | ports=7636->7636/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/pil-migrate/docker-compose.yml
- pil-migrate | ports=none | env_files=none | volumes=4 | healthcheck=yes | networks=ghost_net

## services/pil-postgres/docker-compose.yml
- pil-postgres | ports=5434->5432/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/preconfirm-service/docker-compose.yml
- preconfirm-service | ports=7691->7691/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=ghost_net

## services/proxy-inspector-service/docker-compose.yml
- proxy-inspector-service | ports=7631->7631/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/rbac-service/docker-compose.yml
- rbac-service | ports=7640->7640/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/rewards-service/docker-compose.yml
- rewards-service | ports=7602->7602/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/rpc-forward-l1-29545/docker-compose.yml
- rpc-forward-l1-29545 | ports=29545->29545/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/secrets-health-service/docker-compose.yml
- secrets-health-service | ports=7618->7618/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/session-service/docker-compose.yml
- session-service | ports=7643->7643/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/slashing-detection-service/docker-compose.yml
- slashing-detection-service | ports=7620->7620/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/snapshot-service/docker-compose.yml
- snapshot-service | ports=7624->7624/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/staking-service/docker-compose.yml
- staking-service | ports=7601->7601/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/supply-service/docker-compose.yml
- supply-service | ports=7614->7614/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/theme-service/docker-compose.yml
- theme-service | ports=7634->7634/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/transfer-lifecycle-service/docker-compose.yml
- transfer-lifecycle-service | ports=7605->7605/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/treasury-ai/docker-compose.yml
- treasury-ai | ports=7630->7630/tcp | env_files=none | volumes=1 | healthcheck=yes | networks=ghost_net

## services/treasury-evidence/docker-compose.yml
- treasury-evidence | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=ghost_net

## services/treasury-service/docker-compose.yml
- treasury-service | ports=7628->7628/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/tx-index-service/docker-compose.yml
- tx-index-service | ports=7625->7625/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/upgrade-orchestrator-service/docker-compose.yml
- upgrade-orchestrator-service | ports=7623->7623/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/validator-service/docker-compose.yml
- validator-service | ports=7600->7600/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## services/verification-service/docker-compose.yml
- verification-service | ports=7630->7630/tcp | env_files=none | volumes=3 | healthcheck=yes | networks=ghost_net

## tools/ghostcontrol/infra/compose/docker-compose.yml
- docker-socket-proxy | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=ghostcontrol_net
- ghostcontrol-api | ports=7401->8080/tcp | env_files=none | volumes=0 | healthcheck=yes | networks=ghostcontrol_net
- ghostcontrol-db | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=ghostcontrol_net
- ghostcontrol-ingest | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=ghostcontrol_net
- ghostcontrol-planner | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=ghostcontrol_net
- ghostcontrol-policy | ports=none | env_files=none | volumes=0 | healthcheck=no | networks=ghostcontrol_net
- ghostcontrol-redis | ports=none | env_files=none | volumes=1 | healthcheck=no | networks=ghostcontrol_net
- ghostcontrol-runner | ports=none | env_files=none | volumes=2 | healthcheck=no | networks=ghostcontrol_net
- ghostcontrol-ui | ports=7400->3000/tcp | env_files=none | volumes=0 | healthcheck=no | networks=ghostcontrol_net
