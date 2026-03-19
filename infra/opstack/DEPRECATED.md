# DEPRECATED — OP Stack Infra (Phase 1 freeze)

> **Status:** Frozen compatibility baseline. Do not add new features here.  
> **Replacement:** [`docker-compose.custom-rollup.yml`](../../docker-compose.custom-rollup.yml) + services in `services/ghost-{exec,sequencer,deriver,settlement,bridge,proof}/`

This directory contains the OP Stack–based GhostL2/GhostL3 infra that was the pre-rebuild baseline.
It is retained for dual-run Phase 3 comparisons and will be removed in **Phase 5** once devnet
parity gates pass.

## What replaced what

| OP Stack component | Ghost custom replacement |
|---|---|
| `op-geth` (L2) | `ghost-exec` (port 7260) |
| `op-node` (L2) | `ghost-deriver` (port 7262) |
| `op-batcher` (L2) | `ghost-sequencer` (port 7261) |
| `op-proposer` (L2) | `ghost-settlement` (port 7263) |
| OptimismPortal bridge | `ghost-bridge` (port 7264) |
| OutputOracle / dispute game | `ghost-proof` (port 7265) |
| L3 equivalents | ports 7270–7275 |

## Phase 5 checklist (before deletion)

- [ ] Devnet dual-run parity gates pass (block output comparison)
- [ ] Testnet promotion approved by governance quorum
- [ ] OP Stack containers stopped and images purged
- [ ] `chains/l2/rollup.json` and `chains/l3/rollup.json` removed
- [ ] This directory removed
