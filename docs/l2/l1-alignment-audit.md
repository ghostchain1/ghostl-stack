# Ghost L2 <-> L1 Alignment Audit

This document records the current L2-to-L1 alignment values derived from repo config files and the active `infra/opstack/.env`.

## Sources

- `infra/opstack/.env`
- `infra/opstack/config/rollup.json`
- `infra/opstack/config/genesis-l2.json`
- `infra/opstack/config/l1-deployments.json`
- `infra/opstack/config/l2-deployments.json`

## Chain IDs

| Layer | Source | Value |
| --- | --- | --- |
| L1 | `infra/opstack/.env` | `L1_CHAIN_ID=14000101` |
| L2 | `infra/opstack/.env` | `L2_CHAIN_ID=901` |
| L2 (genesis) | `infra/opstack/config/genesis-l2.json` | `chainId=901` |

## RPC endpoints

| Endpoint | Source | Value |
| --- | --- | --- |
| L1 RPC (host) | `infra/opstack/.env` | `HOST_L1_RPC=http://localhost:18545` |
| L1 RPC (docker) | `infra/opstack/.env` | `L1_RPC_DOCKER=http://l1-rpc-proxy:18546` |
| L2 RPC (host) | `infra/opstack/.env` | `HOST_L2_RPC=http://localhost:29547` |
| L2 RPC (docker) | `infra/opstack/.env` | `L2_RPC=http://l2-geth:8545` |
| L2 rollup RPC | `infra/opstack/docker-compose.yml` | `http://localhost:9546` (op-node) |
| L2 sequencer RPC | `infra/opstack/docker-compose.yml` | `http://localhost:9646` (op-sequencer) |

## L1 OP Stack contracts (from `l1-deployments.json`)

| Contract | Address |
| --- | --- |
| SystemConfigProxy | `0x712516e61C8B383dF4A63CFe83d7701Bce54B03e` |
| OptimismPortalProxy | `0xbCF26943C0197d2eE0E5D05c716Be60cc2761508` |
| L2OutputOracleProxy | `0x0Cf17D5DcDA9cF25889cEc9ae5610B0FB9725F65` |
| DisputeGameFactoryProxy | `0x05Aa229Aec102f78CE0E852A812a388F076Aa555` |
| L1StandardBridgeProxy | `0x2fc631e4B3018258759C52AF169200213e84ABab` |
| L1CrossDomainMessengerProxy | `0xAfe1b5bdEbD4ae65AF2024738bf0735fbb65d44b` |
| L1Erc721BridgeProxy | `0x63cf2Cd54fE91e3545D1379abf5bfd194545259d` |
| OptimismMintableERC20FactoryProxy | `0x69abbde9ebba86707ae2ccf56e9572fbb0d11da6` |

## L2 deployment metadata

From `infra/opstack/config/l2-deployments.json`:

- `chainId=901`
- `rpc=http://localhost:29547`
- `deployer=0x70997970C51812dc3A010C7d01b50e0d17dc79C8`

## Gas token alignment (L1 -> L2)

From `infra/opstack/.env`:

- `USE_CUSTOM_GAS_TOKEN=true`
- `CUSTOM_GAS_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3`
- `GAS_TOKEN_SYMBOL=GHOST`

`infra/opstack/config/genesis-l2.json` now sets `config.gasToken=0x5FbDB2315678afecb367f032d93F642f64180aa3`, matching the L1 gas token configuration. This is validated in `doctor-l2.sh`.

## Governance alignment

From `infra/opstack/.env`:

- `GOVERNANCE_LAYER=L1`
- `GOVERNOR_ADDRESS_L1=0xE5BD5bDC03371fB239956dbbF40bD185D6c2ea28`
- `EXECUTOR_ADDRESS_L1=0xAd5d57aD9bB17d34Debb88566ab2F5dB879Cc46F`

## Policy registry alignment

From `infra/opstack/.env`:

- `POLICY_REGISTRY_ADDRESS=<set to L1 AgentGovernancePolicy>`
- `POLICY_REGISTRY_RPC=<L1 RPC>`
- `POLICY_ROLE=L2_AI_MONITOR`

## Alignment gaps / notes

- `infra/opstack/config/rollup.json` contains `l1.chain_id` and `l2.chain_id` as `null` in repo; `up-l2.sh` updates rollup genesis fields at runtime. Consider persisting chain IDs during Phase 2 if desired.
- Challenger metrics default to 7303, which overlaps the sequencer metrics port. Override `L2_CHALLENGER_METRICS_HOST_PORT` when challengers are enabled.
