# OP Dependency Inventory

## Purpose
This document is the initial Workstream 0 inventory for the GhostL2/GhostL3 custom-runtime migration.

It is a triaged inventory, not a full line-by-line dump. The goal is to identify the major OP-coupled surfaces that must be migrated, shimmed, frozen, or archived before Ghost-native L2/L3 can become the primary runtime path.

## Scope
Covered in this inventory:
- repo source-of-truth and root scripts
- SDK and RPC compatibility layers
- GhostBrain and orchestration surfaces
- contracts and deployment paths
- frontend and API product surfaces
- infra, provisioning, compose, and observability
- new `ghost-*` runtime services that still depend on OP-era SDK assumptions

## Triage Legend
- `blocker`: prevents Ghost-native runtime from being the primary path
- `compat`: acceptable short-term shim if isolated and documented
- `doc`: stale documentation or operator guidance
- `baseline`: may remain only as frozen compatibility/archive material
- `done`: addressed on this branch, retained for migration traceability

## 1. Source Of Truth And Operator Entry Points
These paths still define the official L2/L3 runtime as OP Stack.

| Path | Issue | Triage | Required action |
|------|-------|--------|-----------------|
| `.github/copilot-instructions.md` | Declares GhostL2/GhostL3 as OP Stack and instructs operators to run OP preflight/env sync flows | blocker | Replace with Ghost-runtime-primary guidance after replacement scripts exist |
| `AGENTS.md` | Chain identity table still labels L2/L3 as OP Stack | blocker | Update only when the runtime cutover is real and parity is proven |
| `package.json` | Root scripts expose `preflight:opstack`, `env:sync:opstack`, `env:sync:opstack:l3`, `opstack:check` as canonical flows | blocker | Introduce custom-runtime equivalents and demote OP scripts to compat/baseline |
| `compose.mainnet.yml` | Includes `op-node`, `op-batcher`, `op-proposer`, `op-challenger`, plus L3 variants | blocker | Replace production-path compose with Ghost-native services |
| `compose.testnet.yml` | Same OP service ownership in testnet path | blocker | Same as mainnet |

## 2. SDK And RPC Compatibility Layers
These are the main protocol-surface blockers because they preserve OP semantics behind Ghost-branded names.

Progress on this branch:
- `packages/ghost-nodes/` now exposes explicit `ghost_compat_*` method names for rollup telemetry.
- `packages/ghostl2-sdk/`, `packages/ghostl3-sdk/`, and `packages/ghostnode-sdk` sequencer telemetry now call the explicit compat names instead of raw `optimism_*` methods.
- `packages/ghost-ai-sdk/` route planning now sends explicit `targetLayer` / `targetAddress` metadata to GhostBrain, synthesizes deterministic fallback plans when GhostBrain is unavailable, and submits nested relay envelopes for cross-layer sends when gateway env vars are configured.
- The relay-envelope path now also accepts existing repo messenger env names (`L2_CROSS_DOMAIN_MESSENGER_ADDRESS`, `L3_CROSS_DOMAIN_MESSENGER_ADDRESS`) as compatibility aliases, so the new runtime path can consume legacy env inventories without inventing new addresses first.
- `services/ghost-rpc-proxy/` now terminates `ghost_compat_*`, legacy `ghost_*`, and raw `optimism_*` rollup RPC names at a real proxy boundary, and the devnet compose stack now routes service-side rollup status traffic through dedicated L2/L3 rollup proxy instances.
- Host-side doctor, startup, and VM health flows now target host-exposed rollup proxies, while direct node healthchecks were reduced to metrics-based liveness.
- Production-facing compose/env defaults for direct GhostL2/GhostL3 host RPCs were corrected back to `:29547` / `:39545`; the older `7260` / `7270` values remain only for ghost-exec compatibility service paths.
- The root `@ghostchain/ghost-nodes` surface no longer needs to export deprecated `ghost_*` rollup aliases; those are now isolated to the compat subpath while runtime support remains for migration.

| Path | Issue | Triage | Required action |
|------|-------|--------|-----------------|
| `packages/ghost-nodes/src/rpc/GhostRPCClient.ts` | Legacy `ghost_*` rollup aliases still map to `optimism_*`, but they are now isolated away from the package root export surface | compat | Remove the legacy alias handling entirely once external compat consumers and proxies are fully migrated |
| `packages/ghost-nodes/src/GhostNode.ts` | Documents GhostL2/GhostL3 as OP Stack nodes | doc | Rewrite after protocol surface is finalized |
| `packages/ghost-sdk/src/networks.ts` | SDK defaults now use canonical L2/L3 RPCs; remaining work is bridge/protocol semantics rather than endpoint identity | done | Keep aligned with canonical runtime endpoints |
| `packages/ghost-sdk/src/bridge/GhostBridgeClient.ts` | Explicit compat shim for legacy bridge ABI stubs; upstream OP default addresses were removed in favor of canonical Ghost / env-configured addresses | compat | Replace the compat ABI surface with a Ghost-native bridge client |
| `packages/ghostl2-sdk/src/index.ts` | Now calls explicit `ghost_compat_*` rollup methods; still depends on OP-era semantics behind the compat boundary | compat | Replace compat calls with Ghost-native runtime API when available |
| `packages/ghostl3-sdk/src/index.ts` | Same explicit compat-boundary dependency as L2 SDK | compat | Same as above |
| `packages/ghostnode-sdk/src/sequencer/GhostSequencer.ts` | Same explicit compat-boundary dependency for sequencer telemetry | compat | Replace with Ghost-native sequencer/status interface |

## 3. Custom Runtime Service Manifest Migration
The custom-runtime service manifests now target `ghost-sdk-core`, and the repo root now exposes `npm run check:custom-runtime` for service-local type validation.

These services do not currently import SDK surfaces directly, so this change is primarily dependency hygiene plus a root validation entrypoint. Some regenerated lockfiles may still contain extraneous metadata entries for the old local `ghost-sdk` path, but active dependency resolution now points at `ghost-sdk-core`.

| Path | Issue | Triage | Required action |
|------|-------|--------|-----------------|
| `services/ghost-exec/package.json` | Manifest now targets `@ghostchain/ghost-sdk-core` | done | Keep on `ghost-sdk-core` |
| `services/ghost-sequencer/package.json` | Manifest now targets `@ghostchain/ghost-sdk-core` | done | Keep on `ghost-sdk-core` |
| `services/ghost-deriver/package.json` | Manifest now targets `@ghostchain/ghost-sdk-core` | done | Keep on `ghost-sdk-core` |
| `services/ghost-settlement/package.json` | Manifest now targets `@ghostchain/ghost-sdk-core` | done | Keep on `ghost-sdk-core` |
| `services/ghost-bridge/package.json` | Manifest now targets `@ghostchain/ghost-sdk-core` | done | Keep on `ghost-sdk-core` |
| `services/ghost-proof/package.json` | Manifest now targets `@ghostchain/ghost-sdk-core` | done | Keep on `ghost-sdk-core` |
| `services/ghost-observability/package.json` | Manifest now targets `@ghostchain/ghost-sdk-core` | done | Keep on `ghost-sdk-core` |
| `package.json` | Root now exposes `check:custom-runtime` | done | Expand beyond typecheck into runtime smoke tests later |

## 4. GhostBrain And Control-Plane Dependencies
These paths still assume OP runtime topology or retain compat-only OP fallback paths.

| Path | Issue | Triage | Required action |
|------|-------|--------|-----------------|
| `services/ghostbrain-core/src/routing/HopExecutor.ts` | Routing helper now builds nested Ghost relay envelopes from canonical hop paths and fails fast when required gateway env vars are unset | compat | Wire real gateway addresses in runtime envs and add downstream relay/finality confirmation once the Ghost-native status API exists |
| `services/ghostbrain-core/src/core/routeDecision.ts`, `src/routes/ws.ts`, `src/ws/server.ts` | GhostBrain route decisions now carry explicit `targetLayer` intent and canonical hop paths instead of overloading `to` | done | Keep this contract aligned with HopExecutor input expectations |
| `services/ghostbrain-core/docker/docker-compose.yml` | Standalone GhostBrain compose now defaults to canonical host RPC ports for L2/L3 | done | Keep aligned with canonical host RPC ports |
| `services/ghostbrain-core/src/agents/ghost_security_guardian.ts` | Default runtime inventory now targets Ghost-native containers; OP fleets require explicit compat opt-in | done | Keep Ghost-native inventory aligned with active compose bundles |
| `services/ghostbrain-core/src/kernel/safety_guard.ts` | Primary protection set now targets Ghost-native rollup/runtime processes; OP names remain only as compat safety fallback | compat | Remove legacy compat patterns after the OP baseline is retired |
| `services/ghostbrain/orchestrator/src/actions/restartNode.ts` | Restart guidance now references Ghost-native container names | done | Keep examples aligned with active runtime services |
| `services/ghostbrain/orchestrator/src/config.ts` | Orchestrator RPC defaults now use canonical host L2/L3 ports | done | Keep aligned with AGENTS.md canonical ports |
| `services/consensus-telemetry-service/src/index.js` | Pulls OP Stack lag metrics and now requires `ghost_compat_syncStatus` through the rollup proxy boundary, plus output-oracle snapshots | compat | Redesign telemetry around Ghost-native finality and settlement |
| `services/ai-monitor/src/index.js` | Parent-rollup lag checks now require `ghost_compat_syncStatus` through the rollup proxy boundary, but still depend on OP node metrics and status-field semantics | compat | Replace with Ghost-native parent-head and finality telemetry |
| `services/ghost-rpc-proxy/index.mjs` | Now canonicalizes rollup compat calls at runtime, but still preserves legacy `ghost_*` and raw `optimism_*` aliases | compat | Remove legacy rollup aliases after callers and operators fully converge on `ghost_compat_*` |
| `infra/opstack/docker-compose.yml` + `infra/opstack/docker-compose.l3.yml` | Devnet now uses dedicated internal and host-exposed rollup proxies for `op-node`, `op-sequencer`, and `l3-op-node`; direct node healthchecks were reduced to metrics liveness | compat | Expand or replace this boundary once the Ghost-native rollup API exists |
| `infra/production/docker-compose.production.yml`, `services/stack.env.production.template` | Production-facing direct RPC defaults now use canonical host ports `29547` / `39545`, while ghost-exec compatibility service ports remain separately configurable | done | Keep direct RPC defaults aligned with AGENTS.md and isolate ghost-exec ports as compatibility-only |
| `services/hyper-ghost-supervisor/src/db/seed.ts` | Demo verification metadata now assumes the compat proxy boundary and verifies `ghost_compat_syncStatus` directly | doc | Align any future verification executor with the compat-first schema before using this for runtime automation |

## 5. Contracts, Deployment, And Contract-Compat Surfaces
These paths encode OP-era protocol or ABI compatibility into the contract layer.

| Path | Issue | Triage | Required action |
|------|-------|--------|-----------------|
| `contracts/src/opstack/` | Dedicated OP compatibility contract tree including `GhostOutputOracle.sol` | blocker | Decide whether this remains compat-only or is replaced entirely |
| `contracts/src/l1/L2OutputOracle.sol` | Native contract still tied to OP-era output-oracle model | blocker | Decide replacement or wrapper strategy |
| `contracts/test/foundry/GhostOutputOracle.t.sol` | Tests OP Stack ABI compatibility explicitly | compat | Keep only if still needed as controlled shim coverage |
| `contracts/test/foundry/L1Invariants.t.sol` | Imports and validates `L2OutputOracle` behavior | compat | Re-scope if output model changes |
| `contracts/scripts/deploy_l2.ts` | Deploys L2 as OP Stack contract suite | blocker | Replace with Ghost-native deployment flow |
| `contracts/scripts/deploy_l3.ts` | Deploys L3 as OP Stack contracts anchored to L2 | blocker | Replace with Ghost-native deployment flow |
| `contracts/scripts/deploy_l3_parent_on_l2.ts` | Emits `OptimismPortalProxy`, `L2OutputOracleProxy`, mock L2OO artifacts | blocker | Replace with Ghost-native settlement/bridge deployment flow |
| `contracts/scripts/deploy_all.ts` | Defaults to OP-era devnet ports and assumptions | blocker | Update to Ghost-runtime-primary topology |

## 6. Frontend And API Product Surfaces
User-facing and BFF paths still describe L2/L3 as OP Stack.

| Path | Issue | Triage | Required action |
|------|-------|--------|-----------------|
| `apps/web/src/services/ghostl2.ts` | L2 client copy now uses Ghost-native wording and canonical RPC docs | done | Keep aligned with runtime naming |
| `apps/web/src/services/ghostl3.ts` | L3 client copy now uses Ghost-native wording and canonical RPC docs | done | Keep aligned with runtime naming |
| `apps/web/src/services/ghostchain.ts` | Unified chain client now documents canonical L2/L3 endpoints | done | Keep aligned with canonical runtime endpoints |
| `apps/web/app/api/chains/l2/route.ts` | BFF now defaults to canonical RPC and reports Ghost-native rollup labeling | done | Keep data model aligned with runtime cutover |
| `apps/web/app/api/chains/l3/route.ts` | BFF now defaults to canonical RPC and reports Ghost-native rollup labeling | done | Keep data model aligned with runtime cutover |
| `apps/web/src/modules/chain/components/ChainLayerDashboard.tsx` | Renders L2/L3 as OP Stack rollups | doc | Update after runtime cutover |
| `apps/web/app/monitor/page.tsx` | Groups sequencers under `OP Stack` | doc | Update runtime labels and health semantics |
| `apps/web/app/layout.tsx` | Metadata keywords still include `OP Stack` | doc | Remove after cutover |

## 7. Infra, Provisioning, Compose, And Observability
This is the largest operational surface area for migration.

| Path | Issue | Triage | Required action |
|------|-------|--------|-----------------|
| `infra/opstack/` | Canonical OP runtime tree remains intact and operator-focused | blocker | Replace as primary runtime path; archive as baseline only after parity |
| `infra/scripts/opstack/` | Root env sync and preflight still depend on this tree | blocker | Replace with Ghost-native scripts |
| `infra/hypervisor/provision/ghostl2-provision.sh` | Provisions OP Stack L2 and composes from `infra/opstack` | blocker | Rewrite for Ghost-native L2 runtime |
| `infra/hypervisor/provision/ghostl3-provision.sh` | Same for L3 | blocker | Rewrite for Ghost-native L3 runtime |
| `infra/hypervisor/provision/create-vms.sh` | VM sizing/comments still assume `op-geth + op-node + batcher + proposer` | blocker | Update service inventory and capacity plan |
| `infra/network-manager/ghost_network_manager.py` | Port labels and process inventory still tied to OP binaries | blocker | Replace with Ghost-native runtime process model |
| `infra/docker/compose/prometheus.yml` | Scrapes `op-node`, `op-batcher`, `op-proposer` and L3 OP variants | blocker | Replace with Ghost-native metrics jobs |
| `infra/k8s/blueprints/statefulsets/op-*.yaml` and `l3-op-*.yaml` | Kubernetes statefulsets are still OP-native | blocker | Replace with Ghost-native runtime manifests |
| `infra/network/docker-compose.network.yml` | Network bundles still expose OP geth/node naming | blocker | Update topology to custom runtime services |
| `infra/genesis-installer-v3.sh` | Still states GhostL2/GhostL3 run OP Stack | blocker | Rewrite installation workflow |

## 8. Baseline And Archive Candidates
These can remain only if explicitly frozen and documented as baseline or compat material.

| Path | Issue | Triage | Required action |
|------|-------|--------|-----------------|
| `chains/l2/DEPRECATED.md` | OP baseline already marked deprecated | baseline | Keep as frozen compatibility baseline |
| `chains/l3/DEPRECATED.md` | Same for L3 | baseline | Keep as frozen compatibility baseline |
| `infra/opstack-migration.md` | Historical OP migration plan | baseline | Keep only as historical record |
| `services/stack.env.example` | Notes deprecated L3 OutputOracle for dual-run | compat | Keep only while dual-run remains active |

## Immediate Blockers
These are the highest-priority blockers for custom-runtime cutover:

1. Root scripts and repo instructions still treat OP Stack as the canonical L2/L3 runtime.
2. SDK and RPC layers still depend on OP-era rollup semantics even though an explicit `ghost_compat_*` boundary now exists.
3. GhostBrain control-plane and routing helpers still need finalized Ghost-native relay transport and broader topology cleanup.
4. Deployment and contract flows still revolve around output-oracle and OP portal semantics.
5. Infra and observability still provision and monitor OP-native binaries.
## Recommended Next Cutover Sequence
1. Define the Ghost-native replacement for the `ghost_compat_*` rollup methods and migrate callers off the legacy alias path entirely.
2. Rewrite GhostBrain hop routing and settlement/proof interfaces around the Ghost-native transport model.
3. Expand root-level validation from `check:custom-runtime` typechecks into runtime smoke checks.
4. Replace root/operator entrypoints before touching final production compose and provisioning removal.

## Regeneration Command
Use targeted ripgrep searches rather than broad repo scans when refreshing this file:

```bash
rg -n "preflight:opstack|env:sync:opstack|opstack:check|infra/opstack|op-geth|op-node|op-batcher|op-proposer|op-challenger" \
  package.json .github/copilot-instructions.md AGENTS.md apps infra services docker-compose*.yml compose*.yml

rg -n "optimism_syncStatus|optimism_outputAtBlock|optimism_rollupConfig|optimism_safeHeadAtL1Block|OP Stack|OptimismPortal|OutputOracle" \
  packages services contracts apps

rg -n "ghost-sdk-core|@ghostchain/sdk|ethers|web3" \
  services/ghost-exec services/ghost-sequencer services/ghost-deriver services/ghost-settlement services/ghost-bridge services/ghost-proof services/ghost-observability \
  packages/ghost-nodes packages/ghost-sdk packages/ghostl2-sdk packages/ghostl3-sdk services/ghostbrain-core
```
