# GhostStack VM Role Matrix

> Quick reference. Full policy: [docs/PROMOTION_POLICY.md](PROMOTION_POLICY.md)

---

## Role Matrix

| | **ghostchain-devnet-v2 (1446)** | **Testnet VMs** | **Mainnet VMs** |
|---|---|---|---|
| **Primary role** | Build + Integrate | Prove + Simulate | Serve production |
| **Input** | Source code (git) | Devnet artifacts only | Signed + approved artifacts only |
| **Output** | Release artifacts | Evidence report + sign-off | Live chain state |
| **Orchestrator mode** | Permissive | Strict | Locked |
| **Risk level** | High (controlled) | Medium | Critical |

---

## What Each Environment Does

### ghostchain-devnet-v2 (1446) — Integration Authority

```
Allowed                           Forbidden
──────────────────────────────    ──────────────────────────────
✅ Code changes                    ❌ Serving real users
✅ Contract deployment             ❌ Manual patching post-RC tag
✅ Config generation               ❌ Skipping validation steps
✅ Compose / orchestrator changes
✅ Chain wiring (L1/L2/L3)
✅ Bridge + app wiring
✅ Observability + GhostBrain setup
```

**Must produce:**
- Versioned release bundle (`artifacts/release/release_manifest.json` + sig)
- Chain registry (canonical contract addresses for all layers)
- Deployment manifests and compose bundles
- ABI + SDK outputs

**Must validate before freeze:**
- L1 ↔ L2 ↔ L3 messaging (routing-guard)
- Bridge flows (L2L3Bridge, L1/L2 Rollup, L2/L3 Rollup)
- RPC health: L1 `:18545`, L2 `:29545`, L3 `:39545`
- GhostScan indexers synced
- Apps connected and healthy
- `scripts/preflight.sh` exits 0 (GST leakage + symbol + AI policy)
- `scripts/verify-routing.sh` exits 0
- Clean git tree (no uncommitted drift)

---

### Testnet VMs — Proof + Simulation Layer

```
Allowed                           Forbidden
──────────────────────────────    ──────────────────────────────
✅ Deploy from devnet artifacts    ❌ Editing configs directly on VM
✅ Upgrade rehearsal (N → N+1)    ❌ Hotfixing running services
✅ Rollback rehearsal             ❌ Promoting without evidence report
✅ Failure simulation
✅ Attack simulation
✅ Governance validation
✅ Bridge stress testing
✅ Config drift detection
```

**Required rehearsals** (`scripts/testnet/` lifecycle):
1. `00-preflight.sh` — environment readiness
2. `10-build.sh` — apply artifact set (no source rebuilds)
3. `20-up.sh` — start full stack
4. `30-verify.sh` — chain IDs + routing + tx proof bundle
5. Upgrade: N → N+1, confirm chain continues
6. Rollback: N+1 → N, confirm recovery within SLA
7. Node failure: kill validator, verify chain continues
8. Bridge stress: L3→L2→L1 message flow under load
9. Governance sim: proposal → vote → execute path
10. `40-backup.sh` — snapshot for evidence

**Required proof bundle** (env vars for `30-verify.sh`):
```
L3_TX_HASH
L2_INCLUSION_TX_HASH
L1_SETTLEMENT_TX_HASH
MESSENGER_ROUNDTRIP_PROOF
```

---

### Mainnet VMs — Production Layer

```
Runs                              Forbidden
──────────────────────────────    ──────────────────────────────
✅ L1 Cosmos + EVM nodes          ❌ Building anything from source
✅ L2 op-geth / op-node           ❌ Changing configs manually
✅ L3 op-geth / op-node           ❌ Running unapproved binaries
✅ Sequencers + relayers           ❌ Bypassing governance quorum
✅ Bridge services                 ❌ Copying state from lower envs
✅ Governance + Treasury contracts
✅ GhostBrain AI layer
✅ User-facing apps + GhostScan
✅ Full observability stack
```

---

## Promotion Flow

```
ghostchain-devnet-v2 (1446)
   │
   │  Gate 1: Devnet validation (scripts/promote.sh --env devnet --gate 1)
   │  Gate 2: Artifact freeze   (scripts/promote.sh --env devnet --gate 2)
   ▼
testnet VMs
   │
   │  Gate 3: Testnet simulation (scripts/promote.sh --env testnet --gate 3)
   │  Gate 4: Governance approval (scripts/promote.sh --env testnet --gate 4 --proposal-id <ID>)
   ▼
mainnet VMs
   │
   │  Gate 5: Mainnet deployment     (scripts/promote.sh --env mainnet --gate 5 --proposal-id <ID>)
   │  Gate 6: Post-deploy verification (scripts/promote.sh --env mainnet --gate 6)
   ▼
   Production
```

**Hard invariant: State does not move upward. Only artifacts do.**

---

## Chain Identity Reference

| Layer | Chain ID | RPC Port | Type |
|---|---|---|---|
| GhostChain L1 | `14000101` | `18545` | Cosmos SDK + EVM |
| GhostL2 | `901` | `29545` | OP Stack (op-geth/op-node) |
| GhostL3 | `903` | `39545` | OP Stack (app-specific) |

Gas token everywhere: **GST** — never ETH, Ether, WETH.

---

## Canonical Startup Order

Every environment must follow this order. No service may start before its dependencies are healthy.

```
1. Secrets       (Vault / env injection)
2. L1            (GhostChain: port 18545)
3. L2            (GhostL2: port 29545)       ← requires L1 healthy
4. L3            (GhostL3: port 39545)       ← requires L2 healthy
5. Bridge        (L2L3Bridge, relayers)      ← requires L1+L2+L3 healthy
6. GhostBrain    (AI core: port 7900)
7. Apps          (API, Web, GhostScan)
8. Observability (Prometheus :9090, Grafana :3000)
```

---

## Hypervisor Enforcement Rules

The hypervisor (GAIS REST API `:9100`) enforces:

| Rule | Description |
|---|---|
| VM isolation | Devnet/testnet/mainnet VMs have no shared network paths |
| Separate secrets | Each environment has its own Vault path — no cross-injection |
| Network segmentation | No cross-environment container reachability |
| Promotion-only deployment | No direct code pushes to testnet/mainnet VMs |
| Snapshot before hard-restart | `VM_SNAPSHOT_ENABLED=1` must be set in production |
| DRY_RUN all writes in staging | `VM_MANAGER_DRY_RUN=1` for staging hypervisor |
| Restart cooldown | 120 s per VM, max 4 restarts/hour (circuit breaker) |

---

## Gap Tracker (Current → Required for Mainnet)

| Gap | Blocks | Status |
|---|---|---|
| pnpm vs npm inconsistency | Reproducible builds | Open |
| Artifact signing infra | Gate 2 (mainnet) | Partial |
| Auth/gateway (Phase 2) | Production user safety | Phase 2 backlog |
| Full Ghost-native health checks | Gate 6 | In progress |
| Automated promotion pipeline | All gates | `scripts/promote.sh` created |
