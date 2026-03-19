# GhostL2 — Custom Execution Layer

## Overview
GhostL2 is the target Ghost-native general-purpose execution layer for GhostChain.
The repo currently contains GhostL2 chain definitions and service scaffolds, but broader runtime parity and cutover work are still in progress.
It remains anchored to GhostChain L1 (chain_id=14000101) via the canonical L1 rollup and finality interfaces.

## Chain ID: 901
## Parent: GhostChain L1 (14000101)
## Stack: ghost-custom v1.0.0

## Key Contracts (L1-side)
- Settlement Rollup: `0xad32D5C2Da9f4159C4cc98686C005852b3905355`
- Finality Oracle:   `0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422`

## Modules
- ghost-exec        — intended execution-engine boundary (port 7260)
- ghost-sequencer   — intended block production and mempool service (port 7261)
- ghost-deriver     — intended batch ingestion and state replay service (port 7262)
- ghost-settlement  — intended commitment posting and finality service (port 7263)
- ghost-bridge      — intended L1<->L2 canonical messaging service (port 7264)
- ghost-proof       — intended fraud-proof and dispute interface (port 7265)

## Routing Law
All cross-chain traffic: L2 -> L1 only. L3 -> L2 -> L1.
No direct L3->L1 bypasses permitted.

## Status
Phase 1 baseline is frozen. Ghost-native scaffolds are present for Phase 2, but parity evidence and primary-runtime cutover are still pending.
