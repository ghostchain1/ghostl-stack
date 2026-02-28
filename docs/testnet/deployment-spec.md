# GhostStack Testnet Deployment Spec

## Public Endpoints
- L1 RPC HTTP: `https://rpc.l1.<domain>` -> `ghostchain-rpc-proxy:8545`
- L2 RPC HTTP: `https://rpc.l2.<domain>` -> `l2-geth:8545`
- L3 RPC HTTP: `https://rpc.l3.<domain>` -> `l3-geth:8545`
- Grafana: `https://grafana.<domain>` -> `grafana:3000`
- Explorer (optional): `https://explorer.l1.<domain>` -> `ghostscout:4000`
- UI: `https://console.<domain>` -> Next.js app

## Private/Admin Endpoints
- L1 authrpc: `ghostchain-node1:8551` (private only)
- OP admin RPCs (if enabled): `op-node`, `op-sequencer`
- Vault/API key admin endpoints

## Required Ports
- L1: `18545`, `18546`, `18552`, `18551`, `18660`
- L2: `29547`, `29548`, `29546`, `7300-7304`
- L3: `39545`, `39548`, `39546`, `8300-8303`
- Observability: `3000`, `9091`, `9093`, `3100`
- UI: `3200`

## Minimum Host Sizing (single host rehearsal)
- CPU: 16 vCPU
- RAM: 48 GB
- Disk: 1 TB NVMe
- Network: 1 Gbps

## Routing Law (non-negotiable)
- GhostL3 transacts only with GhostL2
- GhostL2 transacts only with GhostChain (L1)
- No direct L3->L1 bypass
- External settlement/bridging only via L1

## TLS Strategy
- Public ingress: Traefik/Nginx + ACME certificates
- Internal traffic: private bridge networks (`l1_net`, `l2_net`, `l3_net`, `shared_obs`)
- Optional internal mTLS: service mesh or sidecar proxy rollout after testnet stabilization
