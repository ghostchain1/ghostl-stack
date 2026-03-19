# GhostChain Custom L2/L3 Rebuild Plan

## Status
This document is an execution plan for migration work. It is not evidence that the migration is already complete.

The current branch already contains partial Ghost-native scaffolds under:
- `chains/ghostl2/`
- `chains/ghostl3/`
- `services/ghost-exec/`
- `services/ghost-sequencer/`
- `services/ghost-deriver/`
- `services/ghost-settlement/`
- `services/ghost-bridge/`
- `services/ghost-proof/`
- `services/ghost-observability/`
- `docs/architecture/custom-rollup/`

Those scaffolds are useful, but the repo source of truth, runtime compatibility layers, and operational scripts still contain substantial OP-era dependencies. This plan assumes the migration is only complete when the gates in this document pass.

## Objective
Replace the current OP-based GhostL2 and GhostL3 production runtime with Ghost-native execution paths while preserving:
- GhostChain L1 `14000101`, GhostL2 `901`, GhostL3 `903`
- Canonical host RPCs: L1 `18545`, L2 `29547`, L3 `39545`
- GST as the only gas token
- `ghost_` RPC namespace as the public interface
- Routing law: `L3 -> L2 -> L1` only
- Governance control over any canonical-address or bridge-contract changes

## Non-Negotiable Constraints
- L3 never calls L1 directly. Any L3 cross-chain path must transit L2 first.
- L2 never settles externally except through GhostChain L1.
- GhostChain L1 is the only chain that may talk to the outside world.
- New code must prefer `ghost-sdk-core`. Existing integrations may temporarily use `ghost-sdk` only where migration cost would otherwise block progress.
- No direct `ethers` or `web3` imports in application code.
- Canonical bridge and oracle addresses may not be changed without governance-proposal simulation first.
- Branding must remain Ghost-native across wallets, explorers, DNS, DEX, dashboards, SDKs, and operator surfaces.

## Current Repo Reality
The migration surface is wider than `infra/opstack/`.

- Repo instructions still define GhostL2 and GhostL3 as OP Stack chains.
- Root scripts still expose `preflight:opstack`, `env:sync:opstack`, and `opstack:check`.
- `packages/ghost-nodes/` now exposes an explicit `ghost_compat_*` boundary on the root API surface, while deprecated `ghost_*` rollup aliases are isolated to the compat subpath and still map to `optimism_*` wire methods internally.
- `services/ghost-rpc-proxy/` and the devnet compose stack now terminate `ghost_compat_*` through dedicated rollup proxies in front of `op-node` and `l3-op-node`.
- Host-side doctors, startup scripts, and VM health checks now target host-exposed rollup proxies rather than raw `op-node` RPC methods.
- GhostBrain-related compose bundles now default to canonical host RPC ports for GhostL2/GhostL3 instead of stale `7260/7270` operator defaults.
- Production-facing direct RPC defaults and env templates now also point back at canonical GhostL2/GhostL3 host RPCs (`29547` / `39545`), while `7260` / `7270` remain isolated to ghost-exec compatibility service paths.
- `packages/ghost-sdk/`, `packages/ghostl2-sdk/`, and `packages/ghostl3-sdk/` still contain some OP-era protocol semantics, but the bridge client is now an explicit compat shim and no longer falls back to upstream OP default addresses.
- GhostBrain WS routing and `packages/ghost-ai-sdk/` now exchange explicit `targetLayer` metadata and deterministic canonical hop paths instead of overloading the `to` field.
- `services/ghostbrain-core/` now builds nested Ghost relay envelopes from canonical hop paths and can consume existing repo messenger env names as compatibility aliases, but live runtime still needs confirmed gateway/messenger inventories and downstream relay/finality confirmation.
- Service-side rollup monitors now require `ghost_compat_*` through the rollup proxy boundary, but they still depend on OP-era rollup status semantics.
- The new `ghost-*` services are not yet part of the root workspace build.
- A root validation path now exists via `npm run check:custom-runtime`, but it currently typechecks service-local code only.
- Several custom-runtime services still use placeholder behavior:
  - `ghost-exec` is a wrapper around an external RPC endpoint, not yet a self-owned execution adapter.
  - `ghost-settlement` uses placeholder output-root and transaction payload logic.
  - `ghost-bridge` does not yet decode canonical bridge events deterministically.
  - `ghost-proof` still uses stub challenge payloads and replay flow.

## Definition Of Done
The migration is complete only when all of the following are true:
- No OP Stack runtime dependency exists in the GhostL2 or GhostL3 production path.
- L1 <-> L2 and L2 <-> L3 messaging work bidirectionally with deterministic replay protection.
- L3 -> L1 direct routing is impossible in runtime services, contracts, SDK flows, and operator scripts.
- Root build, routing checks, brand checks, and GST checks pass with the custom runtime as the primary path.
- New runtime services are validated by the repo, not left as standalone untracked sidecars.
- Any required address or contract-interface changes have governance simulation evidence.

## Workstream 0 - Freeze Baseline And Inventory Dependencies
Purpose: establish the compatibility baseline and stop the repo from drifting while migration work is in flight.

Scope:
- `chains/l2/`
- `chains/l3/`
- `infra/opstack/`
- `infra/scripts/opstack/`
- `contracts/src/opstack/`
- `contracts/test/` paths that still assert OP-specific behavior
- `packages/ghost-nodes/`
- `packages/ghost-sdk/`
- `packages/ghostl2-sdk/`
- `packages/ghostl3-sdk/`
- `services/ghostbrain-core/`
- Hypervisor, compose, and provisioning paths that reference `op-geth`, `op-node`, `op-batcher`, `OutputOracle`, or `OptimismPortal`

Deliverables:
- A triaged inventory of every OP-coupled runtime, control-plane, SDK, contract, and observability path.
- A baseline devnet definition that is frozen except for parity fixes.
- Explicit ownership boundaries for `chains/ghostl2/`, `chains/ghostl3/`, `services/ghost-*`, `packages/ghost-sdk-core/`, and `packages/ghost-nodes/`.
- Initial inventory artifact: `docs/architecture/custom-rollup/op-dependency-inventory.md`

Exit gates:
- `rg -n "opstack|optimism|op-geth|op-node|OutputOracle|OptimismPortal"` results are triaged by path and owner.
- No new product feature work lands on OP-only code paths unless needed for migration compatibility or safety.

## Workstream 1 - Specify The Ghost-Native Protocol Surface
Purpose: define what replaces OP assumptions before implementation forks into incompatible directions.

Must be specified:
- Execution API between sequencer, deriver, proof, and execution engine
- Canonical commitment format and finality progression model
- Bridge event ABI, nonce derivation, replay protection, and retry semantics
- Fraud-proof first interface and future ZK-proof extension point
- SDK compatibility contract for consumers that currently call:
  - `ghost_compat_syncStatus`
  - `ghost_compat_outputAtBlock`
  - `ghost_compat_rollupConfig`
  - `ghost_compat_safeHeadAtL1Block`
- Whether current canonical addresses remain wrappers over new internals or require governance-managed replacement

Deliverables:
- Documented request and response schemas for `ghost-exec`, `ghost-sequencer`, `ghost-deriver`, `ghost-settlement`, `ghost-bridge`, and `ghost-proof`
- Contract-interface decision for rollup, bridge, and oracle surfaces
- Compatibility strategy for clients that still expect OP-era semantics behind Ghost-branded methods

Exit gates:
- No runtime module exposes a behavior that is undefined in this workstream.
- Governance impact is documented for every contract or address that cannot remain byte-for-byte compatible.

## Workstream 2 - Replace Runtime Internals Behind Stable Interfaces
Purpose: turn the current scaffolds into deterministic services that can own GhostL2 and GhostL3 execution.

### `ghost-exec`
- Replace the generic remote-RPC wrapper with a real execution adapter or managed execution-engine boundary.
- Stop assuming ad hoc `:8545` hosts as the production path; align with canonical L2/L3 RPC topology.
- Ensure all external-facing JSON-RPC remains `ghost_*`.

### `ghost-sequencer`
- Implement durable mempool state, deterministic ordering, and bounded backpressure.
- Make fee policy GST-native and layer-aware.
- Ensure block production behavior is reproducible under replay.

### `ghost-deriver`
- Implement durable parent-chain cursoring and replay semantics.
- Define exact parent inbox sources for L2-from-L1 and L3-from-L2 derivation.

### `ghost-settlement`
- Replace placeholder output-root derivation with the real commitment algorithm.
- Replace placeholder transaction payload construction with canonical contract calls.
- Wire safe and finalized head progression to real proof and oracle state.

### `ghost-bridge`
- Replace random nonce generation with deterministic event decoding.
- Define canonical message IDs, replay protection, and retry semantics.
- Support only `L1 <-> L2` at the L2 bridge boundary and `L2 <-> L3` at the L3 bridge boundary.

### `ghost-proof`
- Replace stub replay and challenge payloads with deterministic proof and dispute flow.
- Define failure handling when proof service is unavailable.
- Preserve fraud-proof first, ZK-ready later.

### Common requirements
- Keep new runtime services on `ghost-sdk-core` rather than regressing to `ghost-sdk`.
- Add service-local validation that is strong enough to catch placeholder logic before promotion.
- Keep routing-law enforcement in both service logic and shared guard libraries.

Exit gates:
- `npm run check:custom-runtime`
- `npm --prefix services/ghost-exec run check`
- `npm --prefix services/ghost-sequencer run check`
- `npm --prefix services/ghost-deriver run check`
- `npm --prefix services/ghost-settlement run check`
- `npm --prefix services/ghost-bridge run check`
- `npm --prefix services/ghost-proof run check`
- No production-path placeholder logic remains for output roots, bridge nonces, challenge payloads, or messenger hops.

## Workstream 3 - Cut The Control Plane Over To The Custom Runtime
Purpose: make the rest of the repo treat the Ghost-native stack as the primary path instead of a sidecar experiment.

Scope:
- `package.json` root scripts
- `apps/api/`
- `apps/web/`
- `packages/ghost-nodes/`
- `packages/ghost-sdk/`
- `packages/ghost-sdk-core/`
- `packages/ghostl2-sdk/`
- `packages/ghostl3-sdk/`
- `services/ghostbrain-core/`
- Compose, Kubernetes, hypervisor, and VM provisioning paths
- Monitoring, metrics, and chain health surfaces

Required changes:
- Replace OP-primary script names and operator guidance with Ghost-runtime-primary equivalents.
- Reduce OP compatibility to an explicit shim boundary instead of letting it leak through the stack.
- Remove OP-branded descriptions from SDK and network metadata.
- Eliminate GhostBrain routing helpers that still assume OP messengers as the canonical hop mechanism.
- Bring the new `ghost-*` runtime services into root validation instead of leaving them outside workspace build coverage.

Exit gates:
- Root build and root checks pass with the custom runtime as the primary path:
  - `npm run build`
  - `npm run brand:full`
  - `npm run verify:routing`
  - `npm run gst:leakage`
- Operator-facing docs and scripts no longer require `infra/opstack/` for the primary L2/L3 bring-up path.
- Root validation includes the custom runtime services directly or through an explicit custom-runtime build script.

## Workstream 4 - Dual-Run Devnet And Parity Evidence
Purpose: prove that the new runtime behaves correctly before any testnet or mainnet promotion.

Required comparison dimensions:
- Block height progression
- Transaction ordering
- Receipts and execution outcomes
- State roots and output roots
- Safe head and finalized head progression
- Bridge message traces and replay protection
- Failure and restart recovery behavior

Mandatory scenario matrix:
- L1 -> L2 message
- L2 -> L1 message
- L2 -> L3 message
- L3 -> L2 message
- L3 -> L1 direct attempt must fail
- Service restart during batch submission
- Service restart during dispute window

Evidence requirements:
- Store parity results, failure cases, and accepted divergences in repo-tracked evidence or docs.
- Do not mark the custom runtime "active in devnet" unless parity evidence exists and is reproducible.

Exit gates:
- Consecutive parity runs pass for a defined block window.
- Bridge and routing matrix passes.
- Finality promotion and dispute handling are reproducible after restart.

## Workstream 5 - Governance, Promotion, And Address Integrity
Purpose: ensure the migration does not violate sovereignty or canonical-address rules.

Requirements:
- Any change to rollup, bridge, or oracle addresses requires governance-proposal simulation first.
- AI may draft proposals but may not execute them inline.
- `npm run phase2:preflight` must run before any governance contract deployment work tied to the migration.
- Promotion sequence remains `DEVNET -> TESTNET -> MAINNET`.

Exit gates:
- Every address change has simulation evidence and human-ratified governance approval.
- Promotion checklist records the exact runtime, config, and evidence bundle used for cutover.

## Workstream 6 - Decommission OP-Only Production Paths
Purpose: remove the old runtime only after parity and promotion gates are complete.

Removal targets:
- `infra/opstack/` as a primary runtime path
- OP-specific root scripts and provisioning defaults
- OP-primary health checks, dashboards, and service assumptions
- SDK descriptions and compat layers that are no longer needed for supported clients

Allowed exceptions:
- Archived compatibility baseline
- Historical evidence
- Tests that intentionally cover the frozen baseline

Exit gates:
- No production compose, Kubernetes, or VM provisioning path requires OP binaries.
- Remaining OP references are explicitly marked as baseline, archive, or compat-only.

## Validation Matrix
Use the smallest useful validation first, then broader gates.

Root:
- `npm run build`
- `npm run check:custom-runtime`
- `npm run brand:full`
- `npm run verify:routing`
- `npm run gst:leakage`

Contracts:
- `npm --prefix contracts run build`
- `npm run test:foundry`

Custom runtime services:
- `npm --prefix services/ghost-exec run check`
- `npm --prefix services/ghost-sequencer run check`
- `npm --prefix services/ghost-deriver run check`
- `npm --prefix services/ghost-settlement run check`
- `npm --prefix services/ghost-bridge run check`
- `npm --prefix services/ghost-proof run check`
- `npm --prefix services/ghost-observability run check`

Promotion-sensitive:
- `npm run phase2:preflight`

## Immediate Next Actions
1. Finish Workstream 0 by producing a triaged OP-dependency inventory across contracts, SDKs, GhostBrain, infra, and operator scripts.
2. Downgrade any doc claims that imply the custom runtime is already active before parity evidence exists.
3. Expand `npm run check:custom-runtime` from typecheck coverage into runtime smoke coverage as interfaces stabilize.
4. Define the canonical commitment, bridge, and proof interfaces before implementing more runtime code.
5. Bring the custom runtime further into root validation and promotion flows so it is not isolated from the main repo gates.

## Acceptance Criteria
- No OP Stack runtime dependencies in GhostL2/GhostL3 production path
- Bidirectional messaging: L1 <-> L2 and L2 <-> L3
- No L3 -> L1 direct bypass
- Unified Ghost branding across wallets, explorers, bridge, admin, governance, and SDK
- Devnet promotion gates pass before testnet promotion
