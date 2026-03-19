# GhostChain Custom Multichain

This document defines the canonical Ghost-native runtime after `infra/opstack/` removal from the production path.

## Canonical chains

- GhostChain L1: chain ID `14000101`, RPC `http://localhost:18545`
- GhostL2: chain ID `901`, RPC `http://localhost:29547`
- GhostL3: chain ID `903`, RPC `http://localhost:39545`

## Routing law

- `GhostL3 -> GhostL2 -> GhostChain`
- No direct `GhostL3 -> GhostChain` settlement or message bypass
- External egress is permitted only from GhostChain L1

## Runtime services

- `services/ghost-exec`
- `services/ghost-sequencer`
- `services/ghost-deriver`
- `services/ghost-settlement`
- `services/ghost-bridge`
- `services/ghost-proof`

## Canonical descriptors

- `chains/ghostl2/chain.json`
- `chains/ghostl3/chain.json`
- `environments/devnet/ghostl2.env.example`
- `environments/devnet/ghostl3.env.example`

## Canonical gas token

- Token: `GST`
- Canonical L1 token address: `0x5FbDB2315678afecb367f032d93F642f64180aa3`

## Migration note

`infra/opstack/` is no longer part of the canonical runtime. Any remaining OP-labeled references elsewhere in the repo are compatibility debt and must not be used for launch.
