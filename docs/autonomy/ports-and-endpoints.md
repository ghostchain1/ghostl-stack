# Ports and Endpoints

Generated: 2026-02-04T02:23:32Z

## apps/docker-compose.dev.yml
- ghostl-api
  - ports: 4000:4000
- ghostl-web
  - ports: 3200:3200
- ghostl-worker
  - ports: 7310:7310

## apps/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## core-service/docker-compose.yml
- core-service
  - ports: 8080:8080
  - healthcheck URLs: http://localhost:8080/healthz

## docker-compose.agents.yml
- agent-registry
  - ports: 7701:7701
- governance-service
  - ports: 17645:7645
- evidence-service
  - ports: 17641:7641

## docker-compose.dev.yml
- ghostl-api
  - ports: 4000:4000
- ghostl-web
  - ports: 3200:3200

## docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/docker/_backup/20260121-1909/core-service/docker-compose.yml
- core-service
  - ports: 8080:8080
  - healthcheck URLs: http://localhost:8080/healthz

## infra/docker/_backup/20260121-1909/docker-compose.dev.yml
- ghostl-api
  - ports: 4000:4000
- ghostl-web
  - ports: 3200:3200

## infra/docker/_backup/20260121-1909/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health
- ghost-ui
  - ports: 3200:3200

## infra/docker/_backup/20260121-1909/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: 30301:30301/udp
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18552:8551, 18551:30303, 18660:6060
  - healthcheck URLs: http://localhost:8545
- ghostscout
  - ports: 18644:4000

## infra/docker/_backup/20260121-1909/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.challengers.yml
- op-challenger
  - ports: ${L2_CHALLENGER_METRICS_HOST_PORT:-7303}:${L2_CHALLENGER_METRICS_PORT:-7303}
- l3-op-challenger
  - ports: ${L3_CHALLENGER_METRICS_HOST_PORT:-8303}:${L3_CHALLENGER_METRICS_PORT:-8303}

## infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.mainnet-geth.yml
- l1-mainnet-geth
  - ports: 38545:8545, 38546:8546, 38551:8551, 38660:6060

## infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.network-manager.yml

## infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- l2-geth
  - ports: 29547:8545
  - healthcheck URLs: http://localhost:8545
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:8551
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9090:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/docker/_backup/20260121-1909/infra/opstack/optimism-upstream/interop-devnet/docker-compose.yml
- l1
  - ports: 8545:8545, 8546:8546, 7060:6060
- l1-bn
  - ports: 9000:9000, 5052:5052
- op-supervisor
  - ports: 9045:8545
- l2-a
  - ports: 9145:8545, 8160:6060
- l2-b
  - ports: 9245:8545, 8260:6060
- op-node-a
  - ports: 7145:8545, 9103:9003, 7100:7300, 6160:6060
- op-node-b
  - ports: 7245:8545, 9203:9003, 7200:7300, 6260:6060
- op-proposer-a
  - ports: 6162:6060, 7102:7300, 6146:8545
- op-proposer-b
  - ports: 6262:6060, 7202:7300, 6246:8545
- op-batcher-a
  - ports: 6161:6060, 7101:7300, 6145:8545
- op-batcher-b
  - ports: 6261:6060, 7201:7300, 6245:8545
- grafana
  - ports: 3300:3000
- prometheus
  - ports: 3090:9090
- loki
  - ports: 3200:3200

## infra/docker/_backup/20260121-1909/infra/opstack/optimism-upstream/ops-bedrock/docker-compose.yml
- l1
  - ports: 8545:8545, 8546:8546, 7060:6060
- l1-bn
  - ports: 9000:9000, 5052:5052
- l2
  - ports: 9545:8545, 8060:6060
- op-node
  - ports: 7545:8545, 9003:9003, 7300:7300, 6060:6060
- op-proposer
  - ports: 6062:6060, 7302:7300, 6546:8545
- op-batcher
  - ports: 6061:6060, 7301:7300, 6545:8545
- da-server
  - ports: 3100:3100
- artifact-server
  - ports: 8080:80

## infra/docker/_backup/20260121-1909/observability/infra/docker-compose.yml
- loki
  - ports: 3100:3100
- prometheus
  - ports: 9090:9090
- alertmanager
  - ports: 9093:9093
- grafana
  - ports: 3000:3000

## infra/docker/_backup/20260121-1909/services/docker-compose.yml
- rpc-forward-l1-29545
  - ports: 29545:29545
- ghost-registry
  - ports: 18088:8088
- alerts-service
  - ports: 7644:7644
- ai-clock-sync
  - ports: 7690:7690
- contract-registry-service
  - ports: 7608:7608
- contract-risk-service
  - ports: 7609:7609
- dispute-service
  - ports: 7607:7607
- transfer-lifecycle-service
  - ports: 7605:7605
- tx-index-service
  - ports: 7625:7625
- entity-tagging-service
  - ports: 7627:7627
- key-rotation-service
  - ports: 7619:7619
- bridge-service
  - ports: 7604:7604
- ghost-relayer
  - ports: 7171:7171
  - healthcheck URLs: http://127.0.0.1:7171/health
- network-manager-service
  - ports: 7766:7766
  - healthcheck URLs: http://127.0.0.1:
- validator-service
  - ports: 7600:7600
- node-health-service
  - ports: 7613:7613
- mempool-service
  - ports: 7610:7610
- node-inventory-service
  - ports: 7622:7622
- notifications-service
  - ports: 7638:7638
- global-search-service
  - ports: 7637:7637
- feature-flags-service
  - ports: 7611:7611
- theme-service
  - ports: 7634:7634
- governance-service
  - ports: 7645:7645
- compliance-export-service
  - ports: 7621:7621
- chain-status-service
  - ports: 7612:7612
- network-context-service
  - ports: 7633:7633
- consensus-telemetry-service
  - ports: 7635:7635
- peer-graph-service
  - ports: 7636:7636
- ghost-rollup-proposer
  - ports: 7272:7272
- ghost-rollup-challenger
  - ports: 7282:7282
- rewards-service
  - ports: 7602:7602
- staking-service
  - ports: 7601:7601
- fee-model-service
  - ports: 7615:7615
- supply-service
  - ports: 7614:7614
- participation-service
  - ports: 7603:7603
- liquidity-service
  - ports: 7606:7606
- treasury-service
  - ports: 7628:7628
- auth-service
  - ports: 7639:7639
- session-service
  - ports: 7643:7643
- rbac-service
  - ports: 7640:7640
- command-palette-service
  - ports: 7642:7642
- ai-monitor
  - ports: 7575:7575
- anomaly-detection-service
  - ports: 7616:7616
- explainability-service
  - ports: 7632:7632
- forecasting-service
  - ports: 7617:7617
- ghost-rpc-proxy
  - ports: 8546:8546
- payout-service
  - ports: 7629:7629
- proxy-inspector-service
  - ports: 7631:7631
- verification-service
  - ports: 7630:7630
- secrets-health-service
  - ports: 7618:7618
- slashing-detection-service
  - ports: 7620:7620
- snapshot-service
  - ports: 7624:7624
- upgrade-orchestrator-service
  - ports: 7623:7623
- audit-log-service
  - ports: 7641:7641
- block-index-service
  - ports: 7626:7626

## infra/docker/compose/docker-compose.ai.yml
- ai-monitor
  - ports: 7575:7575/tcp
- anomaly-detection-service
  - ports: 7616:7616/tcp
- explainability-service
  - ports: 7632:7632/tcp
- forecasting-service
  - ports: 7617:7617/tcp
- ai-clock-sync
  - ports: 7690:7690/tcp
- ghost-ai-attestor
  - ports: 3310:3310/tcp

## infra/docker/compose/docker-compose.core.yml
- l1-mainnet-geth
  - ports: 38545:8545/tcp, 38546:8546/tcp, 38551:8551/tcp, 38660:6060/tcp
- ai-monitor
  - ports: 7575:7575/tcp
  - healthcheck URLs: http://localhost:7575/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- anomaly-detection-service
  - ports: 7616:7616/tcp
  - healthcheck URLs: http://localhost:7616/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609/tcp
  - healthcheck URLs: http://localhost:7609/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632/tcp
  - healthcheck URLs: http://localhost:7632/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617/tcp
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545
  - healthcheck URLs: http://localhost:8545
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- validator-service
  - ports: 7600:7600/tcp
- verification-service
  - healthcheck URLs: http://localhost:7630/health
- ghostchain-node1
  - ports: 18545:8545/tcp, 18546:8546/tcp, 18551:30303/tcp, 18660:6060/tcp
- ghostchain-bootnode
  - ports: 30301:30301/udp
- ghostscout
  - ports: 18644:4000/tcp
- alertmanager
  - ports: 9093:9093/tcp
  - healthcheck URLs: http://localhost:9093/api/v2/status
- ghost-guard
  - ports: 7070:7070/tcp
  - healthcheck URLs: http://localhost:7070/health
- grafana
  - ports: 3300:3000/tcp
- l2-geth
  - ports: 29547:8545/tcp
  - healthcheck URLs: http://localhost:8545
- loki
  - ports: 3200:3200/tcp
- op-batcher
  - ports: 8551:8551/tcp, 7301:7301/tcp
  - healthcheck URLs: http://localhost:8551
- op-gate
  - ports: 28546:8545/tcp
  - healthcheck URLs: http://localhost:8545/gate/status
- op-node
  - ports: 9546:9546/tcp, 7300:7300/tcp
  - healthcheck URLs: http://localhost:9546
- op-proposer
  - ports: 8560:8560/tcp, 7302:7302/tcp
  - healthcheck URLs: http://localhost:7302/metrics
- op-sequencer
  - ports: 9646:9646/tcp, 7303:7303/tcp
  - healthcheck URLs: http://localhost:9646
- prometheus
  - ports: 3090:9090/tcp
- l3-op-challenger
  - ports: ${L3_CHALLENGER_METRICS_HOST_PORT:-8303}:${L3_CHALLENGER_METRICS_PORT:-8303}
- l1
  - ports: 8545:8545/tcp, 8546:8546/tcp, 7060:6060/tcp
- l1-bn
  - ports: 9000:9000/tcp, 5052:5052/tcp
- l2-a
  - ports: 9145:8545/tcp, 8160:6060/tcp
- l2-b
  - ports: 9245:8545/tcp, 8260:6060/tcp
- op-batcher-a
  - ports: 6161:6060/tcp, 7101:7300/tcp, 6145:8545/tcp
- op-batcher-b
  - ports: 6261:6060/tcp, 7201:7300/tcp, 6245:8545/tcp
- op-node-a
  - ports: 7145:8545/tcp, 9103:9003/tcp, 7100:7300/tcp, 6160:6060/tcp
- op-node-b
  - ports: 7245:8545/tcp, 9203:9003/tcp, 7200:7300/tcp, 6260:6060/tcp
- op-proposer-a
  - ports: 6162:6060/tcp, 7102:7300/tcp, 6146:8545/tcp
- op-proposer-b
  - ports: 6262:6060/tcp, 7202:7300/tcp, 6246:8545/tcp
- op-supervisor
  - ports: 9045:8545/tcp
- artifact-server
  - ports: 8080:80/tcp
- da-server
  - ports: 3100:3100/tcp
- l2
  - ports: 9545:8545/tcp, 8060:6060/tcp
- ghost-rollup-challenger
  - ports: 7282:7282/tcp

## infra/docker/compose/docker-compose.obs.yml
- alertmanager
  - ports: 9093:9093/tcp
- grafana
  - ports: 3000:3000/tcp
- loki
  - ports: 3100:3100/tcp
- prometheus
  - ports: 9090:9090/tcp

## infra/docker/compose/docker-compose.services.yml
- ai-clock-sync
  - ports: 7690:7690/tcp
- ai-monitor
  - ports: 7575:7575/tcp
- alerts-service
  - ports: 7644:7644/tcp
- anomaly-detection-service
  - ports: 7616:7616/tcp
- audit-log-service
  - ports: 7641:7641/tcp
- auth-service
  - ports: 7639:7639/tcp
- block-index-service
  - ports: 7626:7626/tcp
- bridge-service
  - ports: 7604:7604/tcp
- chain-status-service
  - ports: 7612:7612/tcp
- command-palette-service
  - ports: 7642:7642/tcp
- compliance-export-service
  - ports: 7621:7621/tcp
- consensus-telemetry-service
  - ports: 7635:7635/tcp
- contract-registry-service
  - ports: 7608:7608/tcp
- contract-risk-service
  - ports: 7609:7609/tcp
- dispute-service
  - ports: 7607:7607/tcp
- entity-tagging-service
  - ports: 7627:7627/tcp
- explainability-service
  - ports: 7632:7632/tcp
- feature-flags-service
  - ports: 7611:7611/tcp
- fee-model-service
  - ports: 7615:7615/tcp
- forecasting-service
  - ports: 7617:7617/tcp
- ghost-registry
  - ports: 18088:8088/tcp
- ghost-relayer
  - ports: 7171:7171/tcp
  - healthcheck URLs: http://127.0.0.1:7171/health
- ghost-rollup-challenger
  - ports: 7282:7282/tcp
- ghost-rollup-proposer
  - ports: 7272:7272/tcp
- ghost-rpc-proxy
  - ports: 8546:8546/tcp
- global-search-service
  - ports: 7637:7637/tcp
- governance-service
  - ports: 7645:7645/tcp
- key-rotation-service
  - ports: 7619:7619/tcp
- liquidity-service
  - ports: 7606:7606/tcp
- mempool-service
  - ports: 7610:7610/tcp
- network-context-service
  - ports: 7633:7633/tcp
- network-manager-service
  - ports: 7766:7766/tcp
  - healthcheck URLs: http://127.0.0.1:
- node-health-service
  - ports: 7613:7613/tcp
- node-inventory-service
  - ports: 7622:7622/tcp
- notifications-service
  - ports: 7638:7638/tcp
- participation-service
  - ports: 7603:7603/tcp
- payout-service
  - ports: 7629:7629/tcp
- peer-graph-service
  - ports: 7636:7636/tcp
- proxy-inspector-service
  - ports: 7631:7631/tcp
- rbac-service
  - ports: 7640:7640/tcp
- rewards-service
  - ports: 7602:7602/tcp
- rpc-forward-l1-29545
  - ports: 29545:29545/tcp
- secrets-health-service
  - ports: 7618:7618/tcp
- session-service
  - ports: 7643:7643/tcp
- slashing-detection-service
  - ports: 7620:7620/tcp
- snapshot-service
  - ports: 7624:7624/tcp
- staking-service
  - ports: 7601:7601/tcp
- supply-service
  - ports: 7614:7614/tcp
- theme-service
  - ports: 7634:7634/tcp
- transfer-lifecycle-service
  - ports: 7605:7605/tcp
- treasury-service
  - ports: 7628:7628/tcp
- tx-index-service
  - ports: 7625:7625/tcp
- upgrade-orchestrator-service
  - ports: 7623:7623/tcp
- validator-service
  - ports: 7600:7600/tcp
- verification-service
  - ports: 7630:7630/tcp
- ghost-compliance
  - ports: 8090:8090/tcp
  - healthcheck URLs: http://localhost:8090/health
- ghost-ui
  - ports: 3200:3200/tcp
- postgres
  - ports: 5432:5432/tcp
- redis
  - ports: 6379:6379/tcp
- core-service
  - ports: 8080:8080/tcp
  - healthcheck URLs: http://localhost:8080/healthz

## infra/docker/compose/docker-compose.ui.yml
- ghost-ui
  - ports: 3200:3200/tcp
- ghostl-web
  - ports: 3200:3200/tcp

## infra/evidence/out/evidence-pack-l1-20260202T132538Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260202T132538Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://localhost:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260202T132538Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260202T133818Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260202T133818Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260202T133818Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260202T134135Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260202T134135Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260202T134135Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260202T134249Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260202T134249Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260202T134249Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260202T141647Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260202T141647Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260202T141647Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260202T141757Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260202T141757Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260202T141757Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260202T142035Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260202T142035Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260202T142035Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260202T142718Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260202T142718Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260202T142718Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260202T151403Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260202T151403Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260202T151403Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260202T152510Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260202T152510Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260202T152510Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260202T154229Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260202T154229Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260202T154229Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260202T154243Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260202T154243Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260202T154243Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260203T123104Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260203T123104Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260203T123104Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260203T123126Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260203T123126Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260203T123126Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260203T124507Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260203T124507Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260203T124507Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l1-20260203T124932Z/snapshots/docker-compose.yml
- postgres
  - ports: 5432:5432
- redis
  - ports: 6379:6379
- ghost-compliance
  - ports: 8090:8090
  - healthcheck URLs: http://localhost:8090/health

## infra/evidence/out/evidence-pack-l1-20260203T124932Z/snapshots/infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/evidence/out/evidence-pack-l1-20260203T124932Z/snapshots/infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/docker-compose.challengers.yml
- op-challenger
  - ports: ${L2_CHALLENGER_METRICS_HOST_PORT:-7303}:${L2_CHALLENGER_METRICS_PORT:-7303}
- l3-op-challenger
  - ports: ${L3_CHALLENGER_METRICS_HOST_PORT:-8303}:${L3_CHALLENGER_METRICS_PORT:-8303}

## infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/docker-compose.challengers.yml
- op-challenger
  - ports: ${L2_CHALLENGER_METRICS_HOST_PORT:-7303}:${L2_CHALLENGER_METRICS_PORT:-7303}
- l3-op-challenger
  - ports: ${L3_CHALLENGER_METRICS_HOST_PORT:-8303}:${L3_CHALLENGER_METRICS_PORT:-8303}

## infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/docker-compose.challengers.yml
- op-challenger
  - ports: ${L2_CHALLENGER_METRICS_HOST_PORT:-7303}:${L2_CHALLENGER_METRICS_PORT:-7303}
- l3-op-challenger
  - ports: ${L3_CHALLENGER_METRICS_HOST_PORT:-8303}:${L3_CHALLENGER_METRICS_PORT:-8303}

## infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/docker-compose.challengers.yml
- op-challenger
  - ports: ${L2_CHALLENGER_METRICS_HOST_PORT:-7303}:${L2_CHALLENGER_METRICS_PORT:-7303}
- l3-op-challenger
  - ports: ${L3_CHALLENGER_METRICS_HOST_PORT:-8303}:${L3_CHALLENGER_METRICS_PORT:-8303}

## infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/docker-compose.challengers.yml
- op-challenger
  - ports: ${L2_CHALLENGER_METRICS_HOST_PORT:-7303}:${L2_CHALLENGER_METRICS_PORT:-7303}
- l3-op-challenger
  - ports: ${L3_CHALLENGER_METRICS_HOST_PORT:-8303}:${L3_CHALLENGER_METRICS_PORT:-8303}

## infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/docker-compose.challengers.yml
- op-challenger
  - ports: ${L2_CHALLENGER_METRICS_HOST_PORT:-7303}:${L2_CHALLENGER_METRICS_PORT:-7303}
- l3-op-challenger
  - ports: ${L3_CHALLENGER_METRICS_HOST_PORT:-8303}:${L3_CHALLENGER_METRICS_PORT:-8303}

## infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/docker-compose.challengers.yml
- op-challenger
  - ports: ${L2_CHALLENGER_METRICS_HOST_PORT:-7303}:${L2_CHALLENGER_METRICS_PORT:-7303}
- l3-op-challenger
  - ports: ${L3_CHALLENGER_METRICS_HOST_PORT:-8303}:${L3_CHALLENGER_METRICS_PORT:-8303}

## infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/evidence/out/evidence-pack-l3-20260203T190609Z/snapshots/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/evidence/out/evidence-pack-l3-20260203T190609Z/snapshots/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/evidence/out/evidence-pack-l3-20260203T191530Z/snapshots/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/evidence/out/evidence-pack-l3-20260203T191530Z/snapshots/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/evidence/out/evidence-pack-l3-20260203T191630Z/snapshots/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/evidence/out/evidence-pack-l3-20260203T191630Z/snapshots/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/evidence/out/evidence-pack-l3-20260203T191811Z/snapshots/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/evidence/out/evidence-pack-l3-20260203T191811Z/snapshots/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/evidence/out/evidence-pack-l3-20260203T192351Z/snapshots/infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/evidence/out/evidence-pack-l3-20260203T192351Z/snapshots/infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/ghostchain/docker-compose.l1.yml
- ghostchain-bootnode
  - ports: ${L1_BOOTNODE_PORT:-30301}:30301/udp
- ghostchain-node1
  - ports: ${L1_RPC_WS_PORT:-18546}:8546, ${L1_RPC_AUTH_PORT:-18552}:8551, ${L1_P2P_PORT:-18551}:30303, ${L1_METRICS_PORT:-18660}:6060
  - healthcheck URLs: http://localhost:8545
- ghostchain-rpc-proxy
  - ports: ${L1_RPC_HTTP_PORT:-18545}:8545
  - healthcheck URLs: http://127.0.0.1:8545/health
- ghostscout
  - ports: 18644:4000

## infra/ghostchain/docker-compose.ibft.yml
- ghostchain-node1
  - ports: 18545:8545, 18546:8546, 18551:30303, 18660:6060

## infra/opstack/docker-compose.challengers.yml
- op-challenger
  - ports: ${L2_CHALLENGER_METRICS_HOST_PORT:-7303}:${L2_CHALLENGER_METRICS_PORT:-7303}
- l3-op-challenger
  - ports: ${L3_CHALLENGER_METRICS_HOST_PORT:-8303}:${L3_CHALLENGER_METRICS_PORT:-8303}

## infra/opstack/docker-compose.l3.yml
- l3-geth
  - ports: ${L3_HOST_RPC:-39545}:8545, ${L3_HOST_WS:-39548}:8546, ${L3_GETH_METRICS_HOST_PORT:-39606}:${L3_GETH_METRICS_PORT:-6060}
  - healthcheck URLs: http://localhost:8545
- l3-op-node
  - ports: ${L3_ROLLUP_RPC_HOST_PORT:-39546}:${L3_ROLLUP_RPC_PORT:-19546}, ${L3_METRICS_NODE_HOST_PORT:-8300}:${L3_METRICS_NODE_PORT:-8300}
  - healthcheck URLs: http://localhost:${L3_ROLLUP_RPC_PORT:-19546}
- l3-op-batcher
  - ports: ${L3_BATCHER_HOST_PORT:-39551}:${L3_BATCHER_RPC_PORT:-18551}, ${L3_METRICS_BATCHER_HOST_PORT:-8301}:${L3_METRICS_BATCHER_PORT:-8301}
  - healthcheck URLs: http://localhost:${L3_BATCHER_RPC_PORT:-18551}
- l3-op-proposer
  - ports: ${L3_PROPOSER_HOST_PORT:-39560}:${L3_PROPOSER_RPC_PORT:-18560}, ${L3_METRICS_PROPOSER_HOST_PORT:-8302}:${L3_METRICS_PROPOSER_PORT:-8302}
  - healthcheck URLs: http://localhost:${L3_PROPOSER_RPC_PORT:-18560}
- validator-service
  - healthcheck URLs: http://localhost:7600/health
- auth-service
  - healthcheck URLs: http://localhost:7639/health
- rbac-service
  - healthcheck URLs: http://localhost:7640/health
- session-service
  - healthcheck URLs: http://localhost:7643/health
- notifications-service
  - healthcheck URLs: http://localhost:7638/health
- alerts-service
  - healthcheck URLs: http://localhost:7644/health
- node-health-service
  - healthcheck URLs: http://localhost:7613/health
- consensus-telemetry-service
  - healthcheck URLs: http://localhost:7635/health
- slashing-detection-service
  - healthcheck URLs: http://localhost:7620/health
- treasury-service
  - healthcheck URLs: http://localhost:7628/health
- bridge-service
  - healthcheck URLs: http://localhost:7604/health
- liquidity-service
  - healthcheck URLs: http://localhost:7606/health
- anomaly-detection-service
  - ports: 7616:7616
  - healthcheck URLs: http://localhost:7616/health
- feature-flags-service
  - healthcheck URLs: http://localhost:7611/health
- governance-service
  - healthcheck URLs: http://localhost:7645/health
- contract-registry-service
  - healthcheck URLs: http://localhost:7608/health
- contract-risk-service
  - ports: 7609:7609
  - healthcheck URLs: http://localhost:7609/health
- proxy-inspector-service
  - healthcheck URLs: http://localhost:7631/health
- mempool-service
  - healthcheck URLs: http://localhost:7610/health
- tx-index-service
  - healthcheck URLs: http://localhost:7625/health
- peer-graph-service
  - healthcheck URLs: http://localhost:7636/health
- audit-log-service
  - healthcheck URLs: http://localhost:7641/health
- block-index-service
  - healthcheck URLs: http://localhost:7626/health
- chain-status-service
  - healthcheck URLs: http://localhost:7612/health
- compliance-export-service
  - healthcheck URLs: http://localhost:7621/health
- dispute-service
  - healthcheck URLs: http://localhost:7607/health
- entity-tagging-service
  - healthcheck URLs: http://localhost:7627/health
- explainability-service
  - ports: 7632:7632
  - healthcheck URLs: http://localhost:7632/health
- fee-model-service
  - healthcheck URLs: http://localhost:7615/health
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://localhost:7617/health
- global-search-service
  - healthcheck URLs: http://localhost:7637/health
- key-rotation-service
  - healthcheck URLs: http://localhost:7619/health
- network-context-service
  - healthcheck URLs: http://localhost:7633/health
- node-inventory-service
  - healthcheck URLs: http://localhost:7622/health
- participation-service
  - healthcheck URLs: http://localhost:7603/health
- payout-service
  - healthcheck URLs: http://localhost:7629/health
- rewards-service
  - healthcheck URLs: http://localhost:7602/health
- secrets-health-service
  - healthcheck URLs: http://localhost:7618/health
- snapshot-service
  - healthcheck URLs: http://localhost:7624/health
- staking-service
  - healthcheck URLs: http://localhost:7601/health
- supply-service
  - healthcheck URLs: http://localhost:7614/health
- theme-service
  - healthcheck URLs: http://localhost:7634/health
- transfer-lifecycle-service
  - healthcheck URLs: http://localhost:7605/health
- upgrade-orchestrator-service
  - healthcheck URLs: http://localhost:7623/health
- verification-service
  - healthcheck URLs: http://localhost:7630/health

## infra/opstack/docker-compose.mainnet-geth.yml
- l1-mainnet-geth
  - ports: 38545:8545, 38546:8546, 38551:8551, 38660:6060

## infra/opstack/docker-compose.network-manager.yml

## infra/opstack/docker-compose.yml
- op-gate
  - ports: 28546:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- op-gate-l1
  - ports: 28547:8545
  - healthcheck URLs: http://localhost:8545/gate/status
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
- ghost-guard
  - ports: 7070:7070
  - healthcheck URLs: http://localhost:7070/health
- ai-monitor
  - ports: 7575:7575
  - healthcheck URLs: http://localhost:7575/health
- l2-geth
  - ports: 29547:8545, ${L2_HOST_WS:-29548}:8546, 29606:6060
  - healthcheck URLs: http://localhost:8545
- rpc-forward-l2-18547
  - ports: 18547:18547
- l1-rpc-proxy
  - healthcheck URLs: http://127.0.0.1:18546/
- op-node
  - ports: 9546:9546, 7300:7300
  - healthcheck URLs: http://localhost:9546
- op-sequencer
  - ports: 9646:9646, 7303:7303
  - healthcheck URLs: http://localhost:9646
- op-batcher
  - ports: 8551:8551, 7301:7301
  - healthcheck URLs: http://localhost:7301/metrics
- op-proposer
  - ports: 8560:8560, 7302:7302
  - healthcheck URLs: http://localhost:7302/metrics
- prometheus
  - ports: 9091:9090
  - healthcheck URLs: http://localhost:9090/-/healthy
- alertmanager
  - ports: 9093:9093
  - healthcheck URLs: http://localhost:9093/api/v2/status
- loki
  - ports: 3100:3100
  - healthcheck URLs: http://localhost:3100/ready
- grafana
  - ports: 3000:3000

## infra/opstack/optimism-upstream/interop-devnet/docker-compose.yml
- l1
  - ports: 8545:8545, 8546:8546, 7060:6060
- l1-bn
  - ports: 9000:9000, 5052:5052
- op-supervisor
  - ports: 9045:8545
- l2-a
  - ports: 9145:8545, 8160:6060
- l2-b
  - ports: 9245:8545, 8260:6060
- op-node-a
  - ports: 7145:8545, 9103:9003, 7100:7300, 6160:6060
- op-node-b
  - ports: 7245:8545, 9203:9003, 7200:7300, 6260:6060
- op-proposer-a
  - ports: 6162:6060, 7102:7300, 6146:8545
- op-proposer-b
  - ports: 6262:6060, 7202:7300, 6246:8545
- op-batcher-a
  - ports: 6161:6060, 7101:7300, 6145:8545
- op-batcher-b
  - ports: 6261:6060, 7201:7300, 6245:8545
- grafana
  - ports: 3300:3000
- prometheus
  - ports: 3090:9090
- loki
  - ports: 3200:3200

## infra/opstack/optimism-upstream/ops-bedrock/docker-compose.yml
- l1
  - ports: 8545:8545, 8546:8546, 7060:6060
- l1-bn
  - ports: 9000:9000, 5052:5052
- l2
  - ports: 9545:8545, 8060:6060
- op-node
  - ports: 7545:8545, 9003:9003, 7300:7300, 6060:6060
- op-proposer
  - ports: 6062:6060, 7302:7300, 6546:8545
- op-batcher
  - ports: 6061:6060, 7301:7300, 6545:8545
- da-server
  - ports: 3100:3100
- artifact-server
  - ports: 8080:80

## observability/infra/docker-compose.yml
- loki
  - ports: 3100:3100
- prometheus
  - ports: 9090:9090
- alertmanager
  - ports: 9093:9093
- grafana
  - ports: 3000:3000

## services/ai-clock-sync/docker-compose.yml
- ai-clock-sync
  - ports: 7690:7690

## services/ai-clock-sync/rollback/20260125-132116/docker-compose.yml
- ai-clock-sync
  - ports: 7690:7690

## services/ai-clock-sync/rollback/20260125-132244/docker-compose.yml
- ai-clock-sync
  - ports: 7690:7690

## services/ai-clock-sync/rollback/20260125-132411/docker-compose.yml
- ai-clock-sync
  - ports: 7690:7690

## services/ai-monitor/docker-compose.yml
- ai-monitor
  - ports: 7575:7575
- ai-monitor-l1
  - ports: 7576:7576
- ai-monitor-l3
  - ports: 7577:7577

## services/ai-monitor/rollback/20260125-132116/docker-compose.yml
- ai-monitor
  - ports: 7575:7575

## services/ai-monitor/rollback/20260125-132244/docker-compose.yml
- ai-monitor
  - ports: 7575:7575

## services/ai-monitor/rollback/20260125-132411/docker-compose.yml
- ai-monitor
  - ports: 7575:7575

## services/ai-vault/docker-compose.yml
- ai-vault
  - ports: 7710:7710

## services/alerts-service/docker-compose.yml
- alerts-service
  - ports: 7644:7644

## services/alerts-service/rollback/20260125-132116/docker-compose.yml
- alerts-service
  - ports: 7644:7644

## services/alerts-service/rollback/20260125-132244/docker-compose.yml
- alerts-service
  - ports: 7644:7644

## services/alerts-service/rollback/20260125-132411/docker-compose.yml
- alerts-service
  - ports: 7644:7644

## services/anomaly-detection-service/docker-compose.yml
- anomaly-detection-service
  - ports: 7616:7616

## services/anomaly-detection-service/rollback/20260125-132116/docker-compose.yml
- anomaly-detection-service
  - ports: 7616:7616

## services/anomaly-detection-service/rollback/20260125-132244/docker-compose.yml
- anomaly-detection-service
  - ports: 7616:7616

## services/anomaly-detection-service/rollback/20260125-132411/docker-compose.yml
- anomaly-detection-service
  - ports: 7616:7616

## services/audit-log-service/docker-compose.yml
- audit-log-service
  - ports: 7641:7641

## services/audit-log-service/rollback/20260125-132116/docker-compose.yml
- audit-log-service
  - ports: 7641:7641

## services/audit-log-service/rollback/20260125-132244/docker-compose.yml
- audit-log-service
  - ports: 7641:7641

## services/audit-log-service/rollback/20260125-132411/docker-compose.yml
- audit-log-service
  - ports: 7641:7641

## services/auth-service/docker-compose.yml
- auth-service
  - ports: 7639:7639

## services/auth-service/rollback/20260125-132116/docker-compose.yml
- auth-service
  - ports: 7639:7639

## services/auth-service/rollback/20260125-132244/docker-compose.yml
- auth-service
  - ports: 7639:7639

## services/auth-service/rollback/20260125-132411/docker-compose.yml
- auth-service
  - ports: 7639:7639

## services/block-index-service/docker-compose.yml
- block-index-service
  - ports: 7626:7626

## services/block-index-service/rollback/20260125-132116/docker-compose.yml
- block-index-service
  - ports: 7626:7626

## services/block-index-service/rollback/20260125-132244/docker-compose.yml
- block-index-service
  - ports: 7626:7626

## services/block-index-service/rollback/20260125-132411/docker-compose.yml
- block-index-service
  - ports: 7626:7626

## services/bridge-service/docker-compose.yml
- bridge-service
  - ports: 7604:7604

## services/bridge-service/rollback/20260125-132116/docker-compose.yml
- bridge-service
  - ports: 7604:7604

## services/bridge-service/rollback/20260125-132244/docker-compose.yml
- bridge-service
  - ports: 7604:7604

## services/bridge-service/rollback/20260125-132411/docker-compose.yml
- bridge-service
  - ports: 7604:7604

## services/chain-status-service/docker-compose.yml
- chain-status-service
  - ports: 7612:7612

## services/chain-status-service/rollback/20260125-132116/docker-compose.yml
- chain-status-service
  - ports: 7612:7612

## services/chain-status-service/rollback/20260125-132244/docker-compose.yml
- chain-status-service
  - ports: 7612:7612

## services/chain-status-service/rollback/20260125-132411/docker-compose.yml
- chain-status-service
  - ports: 7612:7612

## services/command-palette-service/docker-compose.yml
- command-palette-service
  - ports: 7642:7642

## services/command-palette-service/rollback/20260125-132116/docker-compose.yml
- command-palette-service
  - ports: 7642:7642

## services/command-palette-service/rollback/20260125-132244/docker-compose.yml
- command-palette-service
  - ports: 7642:7642

## services/command-palette-service/rollback/20260125-132411/docker-compose.yml
- command-palette-service
  - ports: 7642:7642

## services/compliance-export-service/docker-compose.yml
- compliance-export-service
  - ports: 7621:7621

## services/compliance-export-service/rollback/20260125-132116/docker-compose.yml
- compliance-export-service
  - ports: 7621:7621

## services/compliance-export-service/rollback/20260125-132244/docker-compose.yml
- compliance-export-service
  - ports: 7621:7621

## services/compliance-export-service/rollback/20260125-132411/docker-compose.yml
- compliance-export-service
  - ports: 7621:7621

## services/consensus-telemetry-service/docker-compose.yml
- consensus-telemetry-service
  - ports: 7635:7635

## services/consensus-telemetry-service/rollback/20260125-132116/docker-compose.yml
- consensus-telemetry-service
  - ports: 7635:7635

## services/consensus-telemetry-service/rollback/20260125-132244/docker-compose.yml
- consensus-telemetry-service
  - ports: 7635:7635

## services/consensus-telemetry-service/rollback/20260125-132411/docker-compose.yml
- consensus-telemetry-service
  - ports: 7635:7635

## services/contract-registry-service/docker-compose.yml
- contract-registry-service
  - ports: 7608:7608

## services/contract-registry-service/rollback/20260125-132116/docker-compose.yml
- contract-registry-service
  - ports: 7608:7608

## services/contract-registry-service/rollback/20260125-132244/docker-compose.yml
- contract-registry-service
  - ports: 7608:7608

## services/contract-registry-service/rollback/20260125-132411/docker-compose.yml
- contract-registry-service
  - ports: 7608:7608

## services/contract-risk-service/docker-compose.yml
- contract-risk-service
  - ports: 7609:7609

## services/contract-risk-service/rollback/20260125-132116/docker-compose.yml
- contract-risk-service
  - ports: 7609:7609

## services/contract-risk-service/rollback/20260125-132244/docker-compose.yml
- contract-risk-service
  - ports: 7609:7609

## services/contract-risk-service/rollback/20260125-132411/docker-compose.yml
- contract-risk-service
  - ports: 7609:7609

## services/dispute-service/docker-compose.yml
- dispute-service
  - ports: 7607:7607

## services/dispute-service/rollback/20260125-132116/docker-compose.yml
- dispute-service
  - ports: 7607:7607

## services/dispute-service/rollback/20260125-132244/docker-compose.yml
- dispute-service
  - ports: 7607:7607

## services/dispute-service/rollback/20260125-132411/docker-compose.yml
- dispute-service
  - ports: 7607:7607

## services/docker-compose.legacy.yml
- rpc-forward-l1-29545
  - ports: 29545:29545
- ghost-registry
  - ports: 18088:8088
  - healthcheck URLs: http://127.0.0.1:${PORT:-8088}/health
- gas-engine-postgres
  - ports: 5433:5432
- gas-engine-redis
  - ports: 6381:6379
- ghost-gas-engine
  - ports: 3210:3210
  - healthcheck URLs: http://127.0.0.1:3210/health
- pil-postgres
  - ports: 5434:5432
- ghost-pil
  - ports: 3220:3220
  - healthcheck URLs: http://127.0.0.1:3220/health
- alerts-service
  - ports: 7644:7644
  - healthcheck URLs: http://127.0.0.1:${PORT:-7644}/health
- ai-clock-sync
  - ports: 7690:7690
- ai-vault-dev
  - ports: 8200:8200
- ai-vault
  - ports: 7710:7710
- contract-registry-service
  - ports: 7608:7608
  - healthcheck URLs: http://127.0.0.1:${PORT:-7608}/health
- contract-risk-service
  - ports: 7609:7609
- dispute-service
  - ports: 7607:7607
- transfer-lifecycle-service
  - ports: 7605:7605
- tx-index-service
  - ports: 7625:7625
- entity-tagging-service
  - ports: 7627:7627
  - healthcheck URLs: http://127.0.0.1:${PORT:-7627}/health
- key-rotation-service
  - ports: 7619:7619
- bridge-service
  - ports: 7604:7604
  - healthcheck URLs: http://127.0.0.1:${PORT:-7604}/health
- ghost-relayer
  - ports: 7171:7171
  - healthcheck URLs: http://127.0.0.1:7171/health
- network-manager-service
  - ports: 7766:7766
  - healthcheck URLs: http://127.0.0.1:
- validator-service
  - ports: 7600:7600
  - healthcheck URLs: http://127.0.0.1:${PORT:-7600}/health
- node-health-service
  - ports: 7613:7613
  - healthcheck URLs: http://127.0.0.1:${PORT:-7613}/health
- mempool-service
  - ports: 7610:7610
  - healthcheck URLs: http://127.0.0.1:${PORT:-7610}/health
- node-inventory-service
  - ports: 7622:7622
  - healthcheck URLs: http://127.0.0.1:${PORT:-7622}/health
- notifications-service
  - ports: 7638:7638
  - healthcheck URLs: http://127.0.0.1:${PORT:-7638}/health
- global-search-service
  - ports: 7637:7637
  - healthcheck URLs: http://127.0.0.1:${PORT:-7637}/health
- feature-flags-service
  - ports: 7611:7611
  - healthcheck URLs: http://127.0.0.1:${PORT:-7611}/health
- theme-service
  - ports: 7634:7634
  - healthcheck URLs: http://127.0.0.1:${PORT:-7634}/health
- governance-service
  - ports: 7645:7645
  - healthcheck URLs: http://127.0.0.1:${PORT:-7645}/health
- compliance-export-service
  - ports: 7621:7621
  - healthcheck URLs: http://127.0.0.1:${PORT:-7621}/health
- chain-status-service
  - ports: 7612:7612
  - healthcheck URLs: http://127.0.0.1:${PORT:-7612}/health
- network-context-service
  - ports: 7633:7633
  - healthcheck URLs: http://127.0.0.1:${PORT:-7633}/health
- consensus-telemetry-service
  - ports: 7635:7635
  - healthcheck URLs: http://127.0.0.1:${PORT:-7635}/health
- peer-graph-service
  - ports: 7636:7636
  - healthcheck URLs: http://127.0.0.1:${PORT:-7636}/health
- ghost-rollup-proposer
  - ports: 7272:7272
  - healthcheck URLs: http://127.0.0.1:${PORT:-7272}/health, http://127.0.0.1:${PORT:-7272}/
- ghost-rollup-challenger
  - ports: 7282:7282
  - healthcheck URLs: http://127.0.0.1:${PORT:-7282}/health, http://127.0.0.1:${PORT:-7282}/
- rewards-service
  - ports: 7602:7602
  - healthcheck URLs: http://127.0.0.1:${PORT:-7602}/health
- staking-service
  - ports: 7601:7601
  - healthcheck URLs: http://127.0.0.1:${PORT:-7601}/health
- fee-model-service
  - ports: 7615:7615
  - healthcheck URLs: http://127.0.0.1:${PORT:-7615}/health
- supply-service
  - ports: 7614:7614
  - healthcheck URLs: http://127.0.0.1:${PORT:-7614}/health
- participation-service
  - ports: 7603:7603
  - healthcheck URLs: http://127.0.0.1:${PORT:-7603}/health
- liquidity-service
  - ports: 7606:7606
  - healthcheck URLs: http://127.0.0.1:${PORT:-7606}/health
- treasury-service
  - ports: 7628:7628
  - healthcheck URLs: http://127.0.0.1:${PORT:-7628}/health
- auth-service
  - ports: 7639:7639
  - healthcheck URLs: http://127.0.0.1:${PORT:-7639}/health
- session-service
  - ports: 7643:7643
  - healthcheck URLs: http://127.0.0.1:${PORT:-7643}/health
- rbac-service
  - ports: 7640:7640
  - healthcheck URLs: http://127.0.0.1:${PORT:-7640}/health
- command-palette-service
  - ports: 7642:7642
  - healthcheck URLs: http://127.0.0.1:${PORT:-7642}/health
- ai-monitor
  - ports: 7575:7575
- anomaly-detection-service
  - ports: 7616:7616
- explainability-service
  - ports: 7632:7632
- forecasting-service
  - ports: 7617:7617
  - healthcheck URLs: http://127.0.0.1:${PORT:-7617}/health
- ghost-rpc-proxy
  - ports: 8546:8546
- payout-service
  - ports: 7629:7629
- proxy-inspector-service
  - ports: 7631:7631
  - healthcheck URLs: http://127.0.0.1:${PORT:-7631}/health
- verification-service
  - ports: 7630:7630
  - healthcheck URLs: http://127.0.0.1:${PORT:-7630}/health
- secrets-health-service
  - ports: 7618:7618
- slashing-detection-service
  - ports: 7620:7620
- snapshot-service
  - ports: 7624:7624
  - healthcheck URLs: http://127.0.0.1:${PORT:-7624}/health
- upgrade-orchestrator-service
  - ports: 7623:7623
  - healthcheck URLs: http://127.0.0.1:${PORT:-7623}/health
- audit-log-service
  - ports: 7641:7641
  - healthcheck URLs: http://127.0.0.1:${PORT:-7641}/health
- block-index-service
  - ports: 7626:7626
  - healthcheck URLs: http://127.0.0.1:${PORT:-7626}/health

## services/entity-tagging-service/docker-compose.yml
- entity-tagging-service
  - ports: 7627:7627

## services/entity-tagging-service/rollback/20260125-132116/docker-compose.yml
- entity-tagging-service
  - ports: 7627:7627

## services/entity-tagging-service/rollback/20260125-132244/docker-compose.yml
- entity-tagging-service
  - ports: 7627:7627

## services/entity-tagging-service/rollback/20260125-132411/docker-compose.yml
- entity-tagging-service
  - ports: 7627:7627

## services/explainability-service/docker-compose.yml
- explainability-service
  - ports: 7632:7632

## services/explainability-service/rollback/20260125-132116/docker-compose.yml
- explainability-service
  - ports: 7632:7632

## services/explainability-service/rollback/20260125-132244/docker-compose.yml
- explainability-service
  - ports: 7632:7632

## services/explainability-service/rollback/20260125-132411/docker-compose.yml
- explainability-service
  - ports: 7632:7632

## services/feature-flags-service/docker-compose.yml
- feature-flags-service
  - ports: 7611:7611

## services/feature-flags-service/rollback/20260125-132116/docker-compose.yml
- feature-flags-service
  - ports: 7611:7611

## services/feature-flags-service/rollback/20260125-132244/docker-compose.yml
- feature-flags-service
  - ports: 7611:7611

## services/feature-flags-service/rollback/20260125-132411/docker-compose.yml
- feature-flags-service
  - ports: 7611:7611

## services/fee-model-service/docker-compose.yml
- fee-model-service
  - ports: 7615:7615

## services/fee-model-service/rollback/20260125-132116/docker-compose.yml
- fee-model-service
  - ports: 7615:7615

## services/fee-model-service/rollback/20260125-132244/docker-compose.yml
- fee-model-service
  - ports: 7615:7615

## services/fee-model-service/rollback/20260125-132411/docker-compose.yml
- fee-model-service
  - ports: 7615:7615

## services/forecasting-service/docker-compose.yml
- forecasting-service
  - ports: 7617:7617

## services/forecasting-service/rollback/20260125-132116/docker-compose.yml
- forecasting-service
  - ports: 7617:7617

## services/forecasting-service/rollback/20260125-132244/docker-compose.yml
- forecasting-service
  - ports: 7617:7617

## services/forecasting-service/rollback/20260125-132411/docker-compose.yml
- forecasting-service
  - ports: 7617:7617

## services/gas-engine-migrate/docker-compose.yml

## services/gas-engine-migrate/rollback/20260125-132116/docker-compose.yml

## services/gas-engine-migrate/rollback/20260125-132244/docker-compose.yml

## services/gas-engine-migrate/rollback/20260125-132411/docker-compose.yml

## services/gas-engine-postgres/docker-compose.yml
- gas-engine-postgres
  - ports: 5433:5432

## services/gas-engine-postgres/rollback/20260125-132116/docker-compose.yml
- gas-engine-postgres
  - ports: 5433:5432

## services/gas-engine-postgres/rollback/20260125-132244/docker-compose.yml
- gas-engine-postgres
  - ports: 5433:5432

## services/gas-engine-postgres/rollback/20260125-132411/docker-compose.yml
- gas-engine-postgres
  - ports: 5433:5432

## services/gas-engine-redis/docker-compose.yml
- gas-engine-redis
  - ports: 6381:6379

## services/gas-engine-redis/rollback/20260125-132116/docker-compose.yml
- gas-engine-redis
  - ports: 6381:6379

## services/gas-engine-redis/rollback/20260125-132244/docker-compose.yml
- gas-engine-redis
  - ports: 6381:6379

## services/gas-engine-redis/rollback/20260125-132411/docker-compose.yml
- gas-engine-redis
  - ports: 6381:6379

## services/ghost-ai-attestor/docker-compose.yml
- ghost-ai-attestor
  - ports: 3310:3310

## services/ghost-compliance-worker/docker-compose.yml

## services/ghost-compliance-worker/rollback/20260125-132116/docker-compose.yml

## services/ghost-compliance-worker/rollback/20260125-132244/docker-compose.yml

## services/ghost-compliance-worker/rollback/20260125-132411/docker-compose.yml

## services/ghost-compliance/docker-compose.yml
- ghost-compliance
  - ports: 8090:8090

## services/ghost-compliance/rollback/20260125-132116/docker-compose.yml
- ghost-compliance
  - ports: 8090:8090

## services/ghost-compliance/rollback/20260125-132244/docker-compose.yml
- ghost-compliance
  - ports: 8090:8090

## services/ghost-compliance/rollback/20260125-132411/docker-compose.yml
- ghost-compliance
  - ports: 8090:8090

## services/ghost-gas-engine-worker/docker-compose.yml

## services/ghost-gas-engine-worker/rollback/20260125-132244/docker-compose.yml

## services/ghost-gas-engine-worker/rollback/20260125-132411/docker-compose.yml

## services/ghost-gas-engine/docker-compose.yml
- ghost-gas-engine
  - ports: 3210:3210

## services/ghost-gas-engine/rollback/20260125-132116/docker-compose.yml
- ghost-gas-engine
  - ports: 3210:3210

## services/ghost-gas-engine/rollback/20260125-132244/docker-compose.yml
- ghost-gas-engine
  - ports: 3210:3210

## services/ghost-gas-engine/rollback/20260125-132411/docker-compose.yml
- ghost-gas-engine
  - ports: 3210:3210

## services/ghost-pil-worker/docker-compose.yml

## services/ghost-pil-worker/rollback/20260125-132411/docker-compose.yml

## services/ghost-pil/docker-compose.yml
- ghost-pil
  - ports: 3220:3220

## services/ghost-pil/rollback/20260125-132411/docker-compose.yml
- ghost-pil
  - ports: 3220:3220

## services/ghost-registry/docker-compose.yml
- ghost-registry
  - ports: 18088:8088

## services/ghost-registry/rollback/20260125-132411/docker-compose.yml
- ghost-registry
  - ports: 18088:8088

## services/ghost-relayer/docker-compose.yml
- ghost-relayer
  - ports: 7171:7171

## services/ghost-relayer/rollback/20260125-132411/docker-compose.yml
- ghost-relayer
  - ports: 7171:7171

## services/ghost-rollup-challenger/docker-compose.yml
- ghost-rollup-challenger
  - ports: 7282:7282

## services/ghost-rollup-challenger/rollback/20260125-132411/docker-compose.yml
- ghost-rollup-challenger
  - ports: 7282:7282

## services/ghost-rollup-proposer/docker-compose.yml
- ghost-rollup-proposer
  - ports: 7272:7272

## services/ghost-rollup-proposer/rollback/20260125-132411/docker-compose.yml
- ghost-rollup-proposer
  - ports: 7272:7272

## services/ghost-rpc-proxy/docker-compose.yml
- ghost-rpc-proxy
  - ports: 8546:8546

## services/ghost-rpc-proxy/rollback/20260125-132411/docker-compose.yml
- ghost-rpc-proxy
  - ports: 8546:8546

## services/ghostscout-db/docker-compose.yml

## services/ghostscout-db/rollback/20260125-132411/docker-compose.yml

## services/ghostscout-frontend-l1/docker-compose.yml
- ghostscout-frontend-l1
  - ports: ${GHOSTSCOUT_L1_UI_PORT:-18651}:3000

## services/ghostscout-frontend-l2/docker-compose.yml
- ghostscout-frontend-l2
  - ports: ${GHOSTSCOUT_L2_UI_PORT:-18652}:3000

## services/ghostscout-frontend-l3/docker-compose.yml
- ghostscout-frontend-l3
  - ports: ${GHOSTSCOUT_L3_UI_PORT:-18653}:3000

## services/ghostscout-l1/docker-compose.yml
- ghostscout-l1
  - ports: ${GHOSTSCOUT_L1_PORT:-18641}:4000

## services/ghostscout-l2/docker-compose.yml
- ghostscout-l2
  - ports: ${GHOSTSCOUT_L2_PORT:-18642}:4000

## services/ghostscout-l3/docker-compose.yml
- ghostscout-l3
  - ports: ${GHOSTSCOUT_L3_PORT:-18643}:4000

## services/global-search-service/docker-compose.yml
- global-search-service
  - ports: 7637:7637

## services/governance-service/docker-compose.yml
- governance-service
  - ports: 7645:7645

## services/key-rotation-service/docker-compose.yml
- key-rotation-service
  - ports: 7619:7619

## services/liquidity-service/docker-compose.yml
- liquidity-service
  - ports: 7606:7606

## services/mempool-service/docker-compose.yml
- mempool-service
  - ports: 7610:7610

## services/network-context-service/docker-compose.yml
- network-context-service
  - ports: 7633:7633

## services/network-manager-service/docker-compose.yml
- network-manager-service
  - ports: 7766:7766

## services/node-health-service/docker-compose.yml
- node-health-service
  - ports: 7613:7613

## services/node-inventory-service/docker-compose.yml
- node-inventory-service
  - ports: 7622:7622

## services/notifications-service/docker-compose.yml
- notifications-service
  - ports: 7638:7638

## services/participation-service/docker-compose.yml
- participation-service
  - ports: 7603:7603

## services/payout-service/docker-compose.yml
- payout-service
  - ports: 7629:7629

## services/peer-graph-service/docker-compose.yml
- peer-graph-service
  - ports: 7636:7636

## services/pil-migrate/docker-compose.yml

## services/pil-postgres/docker-compose.yml
- pil-postgres
  - ports: 5434:5432

## services/proxy-inspector-service/docker-compose.yml
- proxy-inspector-service
  - ports: 7631:7631

## services/rbac-service/docker-compose.yml
- rbac-service
  - ports: 7640:7640

## services/rewards-service/docker-compose.yml
- rewards-service
  - ports: 7602:7602

## services/rpc-forward-l1-29545/docker-compose.yml
- rpc-forward-l1-29545
  - ports: 29545:29545

## services/secrets-health-service/docker-compose.yml
- secrets-health-service
  - ports: 7618:7618

## services/session-service/docker-compose.yml
- session-service
  - ports: 7643:7643

## services/slashing-detection-service/docker-compose.yml
- slashing-detection-service
  - ports: 7620:7620

## services/snapshot-service/docker-compose.yml
- snapshot-service
  - ports: 7624:7624

## services/staking-service/docker-compose.yml
- staking-service
  - ports: 7601:7601

## services/supply-service/docker-compose.yml
- supply-service
  - ports: 7614:7614

## services/theme-service/docker-compose.yml
- theme-service
  - ports: 7634:7634

## services/transfer-lifecycle-service/docker-compose.yml
- transfer-lifecycle-service
  - ports: 7605:7605

## services/treasury-service/docker-compose.yml
- treasury-service
  - ports: 7628:7628

## services/tx-index-service/docker-compose.yml
- tx-index-service
  - ports: 7625:7625

## services/upgrade-orchestrator-service/docker-compose.yml
- upgrade-orchestrator-service
  - ports: 7623:7623

## services/validator-service/docker-compose.yml
- validator-service
  - ports: 7600:7600

## services/verification-service/docker-compose.yml
- verification-service
  - ports: 7630:7630

