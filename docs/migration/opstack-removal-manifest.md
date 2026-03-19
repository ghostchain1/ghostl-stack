# OP Stack Removal Manifest

This document records the concrete OP Stack removal work required to make the canonical GhostChain production path Ghost-native.

## Canonical rule

The only canonical chains are:

- GhostChain
- Ghost L2
- Ghost L3

Ghost L2 and Ghost L3 must not depend on OP Stack in the canonical production path.

## Confirmed OP-specific references identified

### 1. README.md
The current README still declares:
- GhostL2 as an OP-Stack rollup anchored to GhostChain
- GhostL3 as an OP-Stack rollup anchored to GhostL2
- OptimismPortal / Oracles in the architecture diagram
- op-geth / op-node / batcher / proposer in the L2 section
- preflight:opstack and opstack-specific operational flows

### 2. .gitmodules
The repo still vendors OP Stack submodules:
- infra/opstack/op-geth
- infra/opstack/optimism
- infra/opstack/optimism-upstream

These must be removed from the canonical repo configuration.

### 3. package.json
The root package scripts still expose OP-specific canonical workflows:
- configure:build:ready:op-only
- preflight:opstack
- env:sync:opstack
- env:sync:opstack:l3
- opstack:check

These scripts must be removed or replaced with Ghost-native equivalents.

## Required deletions

Delete or quarantine all canonical references to:

- infra/opstack/
- op-geth
- op-node
- op-batcher
- op-proposer
- OptimismPortal
- OutputOracle
- CrossDomainMessenger
- StandardBridge
- OP Stack / Optimism / Superchain naming in public or operator-facing docs

## Required replacements

Replace OP-named components with Ghost-native components:

- GhostSettlementGateway
- GhostStateCommitmentChain
- GhostMessageBus
- GhostAssetBridge
- ghost-sequencer
- ghost-executor
- ghost-deriver
- ghost-batch-publisher
- ghost-state-publisher
- ghost-dispute-daemon

## Immediate file edits required

1. Rewrite README.md to remove all OP references.
2. Rewrite .gitmodules to remove all infra/opstack submodules.
3. Rewrite package.json to remove OP-specific scripts.
4. Delete or quarantine infra/opstack/.
5. Replace OP-specific preflight and env-sync references in docs and scripts.
6. Normalize chain metadata around GhostChain / Ghost L2 / Ghost L3 only.

## Launch blocker status

The repository is not yet launch-clean while the above references remain.

Until these are removed, the repo still exposes OP Stack as part of the canonical architecture.
