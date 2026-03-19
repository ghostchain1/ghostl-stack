# GhostL3 — Application Domain Layer

## Overview
GhostL3 is the target Ghost-native application-domain execution layer anchored to GhostL2 (chain_id=901).
The repo currently contains GhostL3 chain definitions and service scaffolds, but broader runtime parity and cutover work are still in progress.
The intended design provides fast finality UX backed by L2 checkpoints with enforced L3->L2->L1 routing law.

## Chain ID: 903
## Parent: GhostL2 (901)
## Stack: ghost-custom v1.0.0

## Key Contracts (L2-side)
- Settlement Rollup: `0x130A46b6E41DB6E1e18fb9c759F223c459190e90`
- Finality Oracle:   `0x87F850cbC2cFfac086F20d0d7307E12d06fA2127`
- L2L3 Bridge:       `0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2`
- L3 Inbox:          `0x3155755b79aA083bd953911C92705B7aA82a18F9`

## Modules
- ghost-exec        — intended execution-engine boundary (port 7260)
- ghost-sequencer   — intended block production and mempool service (port 7261)
- ghost-deriver     — intended batch ingestion and state replay service (port 7262)
- ghost-settlement  — intended commitment posting and finality service (port 7263)
- ghost-bridge      — intended L2<->L3 canonical messaging service (port 7264)
- ghost-proof       — intended fraud-proof and dispute interface (port 7265)

## Routing Law
STRICT: L3 MUST NOT call L1 directly.
All messages from L3 must transit L2 first.
Enforced by routing-guard package at runtime.

## Status
Phase 1 baseline is frozen. Ghost-native scaffolds are present for Phase 2, but parity evidence and primary-runtime cutover are still pending.
