# GhostStack Promotion Policy (Canonical)

> **Last updated:** 2026-03-23  
> **Status:** Enforced — no environment above devnet is ever hand-modified.  
> **Enforcement scripts:** `scripts/promote.sh`, `scripts/verify-release-gate.sh`  
> **Schema:** `release/manifest.schema.json`

---

## Operating Law

> **Devnet assembles. Testnet proves. Mainnet serves.**
>
> No code reaches production unless it has been:
> 1. Built and validated in devnet
> 2. Proven in testnet (deployment + upgrade + rollback + failure simulation)
> 3. Approved via governance (multisig or on-chain quorum)
> 4. Deployed without modification from the signed artifact set

---

## Lifecycle

```
ghostchain-devnet-v2 (1446)  ──►  testnet VMs  ──►  mainnet VMs
        (Gate 1+2)                  (Gate 3)         (Gate 4+5+6)
```

Promotion always flows left to right. **State never moves upward — only artifacts do.**

---

## Environment Roles

### 1. ghostchain-devnet-v2 (1446) (Integration Authority)

| Attribute | Value |
|---|---|
| **Purpose** | Build, assemble, and validate the entire Ghost stack |
| **Input** | Source code (git) |
| **Output** | Versioned release artifacts (see §Release Artifact Model) |
| **Orchestrator mode** | Permissive |

**Allowed actions:**
- Code changes and contract deployment
- Config generation and compose/orchestrator changes
- Chain wiring (L1/L2/L3), bridge wiring, app wiring
- Observability setup and GhostBrain integration

**Must validate before artifact freeze:**
- L1 ↔ L2 ↔ L3 messaging (routing-guard enforced)
- Bridge flows (L2L3Bridge, L1 Rollup, L2 Rollup)
- RPC health on all three chains
- Indexers and GhostScan synced
- Apps connected and responding
- Orchestrator boot order validated (Secrets → L1 → L2 → L3 → Bridge → AI → Apps → Observability)
- No config drift inside workspace
- GST leakage gates pass (`scripts/preflight.sh`)
- Routing law enforced (`scripts/verify-routing.sh`)

**Forbidden:**
- Serving real users
- Manual patching after a release candidate is tagged
- Skipping any validation step

---

### 2. Testnet VMs (Proof + Simulation Layer)

| Attribute | Value |
|---|---|
| **Purpose** | Break it safely before mainnet does |
| **Input** | **Only** versioned artifacts from devnet — never manual edits |
| **Output** | Evidence report + governance sign-off |
| **Orchestrator mode** | Strict |

**Required rehearsals** (run via `scripts/testnet/`):
- Full from-scratch deployment (`00-preflight.sh` → `10-build.sh` → `20-up.sh` → `30-verify.sh`)
- Upgrade simulation: N → N+1 artifact set
- Rollback simulation (`90-rollback.sh`) — must recover to N within SLA
- Node failure recovery (kill validator, confirm chain continues)
- Bridge stress test (L3 → L2 → L1 message flow at load)
- Governance action simulation (proposal + vote + execution path)
- Config integrity check (no drift between artifact manifest and running containers)
- Proof bundle collection: `L3_TX_HASH`, `L2_INCLUSION_TX_HASH`, `L1_SETTLEMENT_TX_HASH`, `MESSENGER_ROUNDTRIP_PROOF`

**Forbidden:**
- Editing configs directly on the VM
- Hotfixing running services
- Promoting to mainnet without a complete evidence report

---

### 3. Mainnet VMs (Production Layer)

| Attribute | Value |
|---|---|
| **Purpose** | Run only approved, reproducible state |
| **Input** | **Only** signed + governance-approved artifacts from testnet gate |
| **Output** | Live chain state (GhostChain L1 / GhostL2 / GhostL3) |
| **Orchestrator mode** | Locked |

**Runs:**
- Chain nodes (L1 Cosmos+EVM, L2 op-geth/op-node, L3 op-geth/op-node)
- Sequencers, relayers, bridge services
- Governance and treasury contracts
- GhostBrain AI layer
- User-facing apps (web, API, GhostScan)
- Full observability stack

**Forbidden:**
- Building anything from source
- Changing configs manually — all changes go through a new devnet cycle
- Running unapproved binaries or images
- Any action that bypasses governance quorum

---

## Release Artifact Model

Every promotion unit is an **immutable, signed release bundle**.

### Directory layout

```
artifacts/release/
  release_manifest.json       ← built by scripts/release/build-release-manifest.sh
  release_manifest.sig        ← signed by scripts/release/sign-release-manifest.sh
  release_manifest.pub        ← corresponding public key
  constitution_hash.txt       ← sha256 of GhostChain-Constitution.md at freeze
  checksums.txt               ← sha256 of every artifact file
  release_gate_verification.json  ← written by scripts/verify-release-gate.sh
```

### `release_manifest.json` required fields

Full schema: [`release/manifest.schema.json`](../release/manifest.schema.json)

| Field | Type | Description |
|---|---|---|
| `version` | semver string | Release version (e.g. `1.4.0`) |
| `gitCommit` | git SHA | Full commit hash at freeze |
| `chains` | object | `l1`, `l2`, `l3` with `chainId`, `rpc`, and `blockHeight` |
| `contracts` | object | Named contract → address mapping |
| `bridges` | object | Canonical bridge contract addresses |
| `finalityOracles` | object | Per-layer finality oracle addresses |
| `startupOrder` | array | Ordered service list for orchestrator |
| `healthChecks` | array | Per-service health check definitions |
| `dependencyGraph` | object | Service → `dependsOn` adjacency |
| `artifactChecksums` | object | File path → sha256 |
| `constitutionHash` | string | `sha256:<hex>` of the GhostConstitution doc |
| `generatedAt` | ISO-8601 | UTC timestamp of manifest generation |

---

## Promotion Gates (Non-Negotiable)

Run the full gate sequence with `scripts/promote.sh --env <devnet|testnet|mainnet>`.

### Gate 1 — Devnet Validation

```bash
scripts/promote.sh --env devnet --gate 1
```

Checks:
- [ ] `scripts/preflight.sh` passes (GST leakage + symbol + AI policy gates)
- [ ] L1/L2/L3 RPC responds with correct `eth_chainId`
- [ ] `scripts/verify-routing.sh` passes
- [ ] Bridge contracts (`L2L3Bridge`, L1/L2 Rollup) reachable
- [ ] Indexers returning non-zero block heights
- [ ] Apps returning healthy HTTP status
- [ ] Orchestrator boot order log validated
- [ ] No uncommitted config drift (`git diff --exit-code`)

---

### Gate 2 — Artifact Freeze

```bash
scripts/promote.sh --env devnet --gate 2
```

Steps:
- [ ] `scripts/release/build-release-manifest.sh` — builds `release_manifest.json`
- [ ] `checksums.txt` generated from all artifact files
- [ ] `scripts/release/sign-release-manifest.sh` — signs manifest with release key
- [ ] Git tag created: `release/vX.Y.Z`

> ❗ After Gate 2, **no changes are permitted** without a new version cycle.

---

### Gate 3 — Testnet Simulation

```bash
scripts/promote.sh --env testnet --gate 3
```

Runs `scripts/testnet/` lifecycle in order:
- [ ] `00-preflight.sh` — environment readiness
- [ ] `10-build.sh` — apply artifact set (no rebuilding from source)
- [ ] `20-up.sh` — start full stack from artifacts
- [ ] `30-verify.sh` — verify chain IDs, routing, tx proof bundle
- [ ] Upgrade simulation: deploy `vN+1` artifacts, confirm continuity
- [ ] Rollback simulation: revert to `vN`, confirm chain continues
- [ ] Bridge stress test: L3→L2→L1 message flow
- [ ] Governance action simulation: full proposal→vote→execute path
- [ ] `40-backup.sh` — snapshot testnet state for evidence
- [ ] Evidence report written to `artifacts/testnet/evidence-<version>.json`

---

### Gate 4 — Governance Approval

Required for:
- Mainnet promotion of any kind
- Validator set changes
- Bridge upgrades (L2L3Bridge, L1/L2 Rollup)
- Settlement logic changes
- Any treasury-affecting contract upgrade

Produces:
- Evidence report from Gate 3 (required input)
- On-chain proposal via `scripts/propose_chain_policy.mjs` or equivalent
- Proposal signed via `scripts/sign_chain_policy.mjs`
- Governance quorum reached (GhostChainGovernor)
- Approval record in `artifacts/release/governance-approval.json`

> AI (GhostBrain) may **draft** proposals. Humans must **ratify** via quorum.  
> Proposals route through signing relay at `http://localhost:7910` — never executed inline.

---

### Gate 5 — Mainnet Deployment

```bash
scripts/promote.sh --env mainnet --gate 5 --proposal-id <PROPOSAL_ID>
```

Steps:
- [ ] `scripts/verify-release-gate.sh --proposal-id <ID>` — confirms on-chain `isMainnetLaunchAllowed()` 
- [ ] `scripts/release/verify-release-attestation.sh` — verifies manifest signature
- [ ] Apply **exact artifact set** (no rebuilds, no env-specific modifications)
- [ ] Orchestrator deploys in canonical startup order

---

### Gate 6 — Post-Deploy Verification

```bash
scripts/promote.sh --env mainnet --gate 6
```

Must confirm:
- [ ] Block progression on L1, L2, L3 (≥2 blocks since deploy)
- [ ] `eth_chainId` returns `0x D59465` (L1=14000101), `0x385` (L2=901), `0x387` (L3=903)
- [ ] Bridge relayers active and processing
- [ ] GhostBrain Core responding (`http://localhost:7900/health`)
- [ ] Apps returning HTTP 200
- [ ] Prometheus scrape targets up (`http://localhost:9090`)
- [ ] No unexpected container restarts since deploy
- [ ] `artifacts/release/postdeploy-verification.json` written

---

## Orchestrator Startup Order (Canonical)

```
1. Secrets (Vault / env injection)
2. GhostChain L1  (Cosmos + EVM — port 18545)
3. GhostL2        (op-geth / op-node — port 29545)
4. GhostL3        (op-geth / op-node — port 39545)
5. Bridge services (L2L3Bridge, relayers)
6. GhostBrain AI  (port 7900)
7. Apps           (API port varies, Web port varies)
8. Observability  (Prometheus :9090, Grafana :3000)
```

Hard dependency rules (enforced by orchestrator):
- L2 will not start until L1 is healthy
- L3 will not start until L2 is healthy
- Bridge services will not start until all three chains are healthy
- No service proceeds past a failed health gate

---

## Chain Registry — Single Source of Truth

All apps, scripts, and services read chain configuration from `chain-registry.json` (generated per-environment by the manifest build step). No hardcoded chain IDs, RPC endpoints, or contract addresses are permitted in application code.

| Field | Devnet value | Mainnet value |
|---|---|---|
| L1 chain ID | `14000101` | `14000101` |
| L2 chain ID | `901` | `901` |
| L3 chain ID | `903` | `903` |
| L1 RPC | `http://localhost:18545` | Vault-injected |
| L2 RPC | `http://localhost:29545` | Vault-injected |
| L3 RPC | `http://localhost:39545` | Vault-injected |
| L2L3Bridge | `0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2` | same |
| L1 Rollup (L2) | `0xad32D5C2Da9f4159C4cc98686C005852b3905355` | same |
| L2 Rollup (L3) | `0x130A46b6E41DB6E1e18fb9c759F223c459190e90` | same |
| Finality Oracle L1 | `0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422` | same |
| Finality Oracle L2 | `0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A` | same |
| Finality Oracle L3 | `0x87F850cbC2cFfac086F20d0d7307E12d06fA2127` | same |

---

## Repo Gap Tracker

These gaps must be closed before mainnet promotion:

| Gap | Blocker for | Owner | Status |
|---|---|---|---|
| Package manager inconsistency (pnpm vs npm) | Reproducible builds | Platform | Open |
| Artifact signing infrastructure | Gate 2 | Security | Partial (`sign-release-manifest.sh` exists) |
| Auth/gateway (Phase 2) | Production user safety | Gateway team | Phase 2 backlog |
| Promotion pipeline automation | Gates 1-6 | DevOps | `scripts/promote.sh` created |
| Full Ghost-native health checks | Gate 6 | Observability | In progress |

---

## Related Files

| File | Purpose |
|---|---|
| [`release/manifest.schema.json`](../release/manifest.schema.json) | JSON Schema (draft-07) for `release_manifest.json` |
| [`release/manifest.example.json`](../release/manifest.example.json) | Filled example validating against the schema |
| [`scripts/promote.sh`](../scripts/promote.sh) | Gate-ordered promotion driver |
| [`docs/VM_ROLE_MATRIX.md`](VM_ROLE_MATRIX.md) | Environment role matrix quick reference |
| [`.github/promotion-gates/`](../.github/promotion-gates/) | Per-gate CI check definitions |
| [`scripts/verify-release-gate.sh`](../scripts/verify-release-gate.sh) | On-chain release gate verifier |
| [`scripts/release/build-release-manifest.sh`](../scripts/release/build-release-manifest.sh) | Manifest builder |
| [`scripts/release/sign-release-manifest.sh`](../scripts/release/sign-release-manifest.sh) | Manifest signer |
| [`scripts/testnet/`](../scripts/testnet/) | Testnet lifecycle scripts |
| [`docs/production-readiness.md`](production-readiness.md) | Hardening playbook |
