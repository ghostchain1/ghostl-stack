# Phase 6 Attestation Checklist (dry-run / harness)

Generated: `2026-02-06T04:06:13Z`  
Repo: `ghostl-stack`  
Revision: run `git rev-parse HEAD` (branch: `main`)

This artifact documents what we can **verify in this environment** (offline / restricted runtime), and what is **explicitly not verified**.

## Environment constraints (affects verification)

- **Docker daemon access is not reliable** from inside gate scripts in this harness (e.g., `/var/run/docker.sock` permission issues) → docker-runtime checks were skipped.
- **RPC/runtime reachability is not reliable** in this harness → node health/load/restart checks were skipped.
- **Network egress may be restricted** → vulnerability DB downloads are unreliable; Trivy was run in offline-friendly mode where applicable.

## Gate-run source state (recorded)

Go/No-Go gates were executed on `2026-02-05` with a **dirty** working tree (as recorded in each pack’s `provenance/provenance.json`).

Modified tracked files at the time:

- `infra/scripts/doctor-l1.sh`
- `infra/scripts/doctor-l2.sh`
- `infra/scripts/doctor-l3.sh`
- `infra/scripts/gates/ai-go-no-go.sh`
- `infra/scripts/gates/l1-go-no-go.sh`
- `infra/scripts/gates/l2-go-no-go.sh`
- `infra/scripts/gates/l3-go-no-go.sh`

Untracked files were also present (**100** total at time of writing this attestation). Key examples:

- `contracts/src/governance/InterchainAuthorization.sol`
- `contracts/src/governance/LowBalancerGovernor.sol`
- `contracts/test/foundry/InterchainAuthorization.t.sol`
- `contracts/test/foundry/LowBalancerGovernor.t.sol`
- `docker-compose.phase3.yml`
- `docker-compose.phase3.secrets.yml`
- `docker-compose.autonomy.yml`
- `docs/architecture/phase4-governance.md`
- `docs/architecture/phase5-security.md`
- `tools/ghostcontrol/README.md`

For the complete list, run `git status -uall`.

## Go/No-Go gate results

## Clean-run refresh (single-SHA baseline)

The repository was consolidated into a single clean baseline commit:

- Baseline commit: `6bc989d0d886efe79c28c64628eea5bff25b92a1`
- Baseline tag: `phase2-6-lock-2026-02-06`

After tagging, the Phase 6 gates were re-run on `2026-02-06` with a **clean** working tree. The refreshed evidence packs below record `git.dirty=false` in `provenance/provenance.json`.

### L1 gate: **PASS (dry-run)**

Command:

`ALLOW_DEV_SECRETS=1 L1_DOCTOR_SKIP_RUNTIME=1 L1_DOCTOR_SKIP_DOCKER=1 SKIP_DOCKER_CHECK=1 SKIP_RPC_LOAD=1 SKIP_RESTART_CHECK=1 SKIP_MONITORING=1 SKIP_AI_MONITOR=1 SKIP_POLICY_REGISTRY=1 bash infra/scripts/gates/l1-go-no-go.sh`

Executed (verified):

- Foundry invariant suite: `npm --prefix contracts run test:invariant` → `contracts/reports/foundry/summary.json` shows `status: ok`, `exitCode: 0`, `updatedAt: 2026-02-05T20:24:30.655Z`
- Evidence pack produced:
  - `infra/evidence/out/evidence-pack-l1-20260205T202235Z.zip`
  - SHA256: `42fb997aafe3f02414fdd653a799a1b03c4da282ac89ec486a4525cc9c3fd238`
- Evidence pack provenance: `infra/evidence/out/evidence-pack-l1-20260205T202235Z/provenance/provenance.json` (`generatedAt: 2026-02-05T20:22:39Z`, `git.dirty: true`)

Skipped / not verifiable here:

- Docker daemon check (`SKIP_DOCKER_CHECK=1`, `L1_DOCTOR_SKIP_DOCKER=1`)
- RPC load + restart resilience (`SKIP_RPC_LOAD=1`, `SKIP_RESTART_CHECK=1`)
- Monitoring endpoints (`SKIP_MONITORING=1`, `SKIP_AI_MONITOR=1`)
- Policy registry runtime validation (`SKIP_POLICY_REGISTRY=1`)

Clean-run evidence (Feb 6):

- `infra/evidence/out/evidence-pack-l1-20260206T034922Z.zip`
- SHA256: `a94a294e2eadcc9d2d1f8215dbc38ce31862f96c00dfdc7d866831234efbbc3d`

### L2 gate: **PASS (dry-run)**

Command:

`ALLOW_DEV_SECRETS=1 L2_DOCTOR_SKIP_DOCKER=1 L2_DOCTOR_SKIP_RUNTIME=1 L2_GO_NO_GO_SKIP_RUNTIME=1 bash infra/scripts/gates/l2-go-no-go.sh`

Executed (verified):

- Evidence pack produced:
  - `infra/evidence/out/evidence-pack-l2-20260205T202334Z.zip`
  - SHA256: `a9305d6caae82593569f6a16174afe53a4f563e53ba709eee98654154e952a0f`
- Evidence pack provenance: `infra/evidence/out/evidence-pack-l2-20260205T202334Z/provenance/provenance.json` (`generatedAt: 2026-02-05T20:23:39Z`, `git.dirty: true`)

Skipped / not verifiable here:

- Docker daemon check (`L2_DOCTOR_SKIP_DOCKER=1`)
- Runtime/RPC checks (`L2_GO_NO_GO_SKIP_RUNTIME=1`, `L2_DOCTOR_SKIP_RUNTIME=1`)

Clean-run evidence (Feb 6):

- `infra/evidence/out/evidence-pack-l2-20260206T035002Z.zip`
- SHA256: `86c27514b5f90cbcfabc27aa40fcdc6253e5c32ac1fd37ee2c2663e058e9a600`

### L3 gate: **PASS (dry-run)**

Command:

`ALLOW_DEV_SECRETS=1 L3_DOCTOR_SKIP_DOCKER=1 L3_DOCTOR_SKIP_RUNTIME=1 L3_GO_NO_GO_SKIP_RUNTIME=1 bash infra/scripts/gates/l3-go-no-go.sh`

Executed (verified):

- Evidence pack produced:
  - `infra/evidence/out/evidence-pack-l3-20260205T202400Z.zip`
  - SHA256: `5fdd7880169d4d6a9015e102c21cc2750e6344e1e9deec004a66350c32914784`
- Evidence pack provenance: `infra/evidence/out/evidence-pack-l3-20260205T202400Z/provenance/provenance.json` (`generatedAt: 2026-02-05T20:24:04Z`, `git.dirty: true`)

Skipped / not verifiable here:

- Docker daemon check (`L3_DOCTOR_SKIP_DOCKER=1`)
- Runtime/RPC checks (`L3_GO_NO_GO_SKIP_RUNTIME=1`, `L3_DOCTOR_SKIP_RUNTIME=1`)

Clean-run evidence (Feb 6):

- `infra/evidence/out/evidence-pack-l3-20260206T035019Z.zip`
- SHA256: `03830112e02108dab78cf464075e2857e94c3bac6c3e2c710739262715faef3e`

### AI governance gate: **PASS (docs + tests)**

Command:

`AI_GO_NO_GO_ALLOW_DIRTY=1 bash infra/scripts/gates/ai-go-no-go.sh`

Executed (verified):

- Federation invariants: `scripts/smoke/federation-invariants.sh`
- Failure-mode drill validation: `scripts/smoke/ai-governance-failure-modes.sh`
- Evidence pack reproducibility (deterministic):
  - `EVIDENCE_TIMESTAMP=20260203T180000Z EVIDENCE_EPOCH=1760100000 infra/scripts/evidence-pack-ai-governance.sh --verify`
  - Output: `Reproducible evidence pack hash: 98171d05e532345d35e73ca81a36335834522721aed9e6fdfd9b4d3b7334ef5d`

Notes:

- Clean-run note: AI go/no-go was also re-run with dirty-tree enforcement enabled (`AI_GO_NO_GO_ALLOW_DIRTY=0`).

## Static analysis & scan summaries (what we can validate offline)

- **Foundry invariants:** `contracts/reports/foundry/summary.json` → `status: ok`, `exitCode: 0`, `updatedAt: 2026-02-05T20:24:30.655Z`
- **Slither:** `contracts/reports/formal/summary.json` → `issues: 0`, `totalFindings: 320`, `updatedAt: 2026-02-05T16:49:48.419Z`
- **Trivy filesystem scan:** `ops/security/trivy-fs.json`
  - `CreatedAt: 2026-02-05T20:27:42.882072293Z`
  - Parsed counts: `vulnerabilities=0`, `misconfigurations=0`, `secrets=0`, `licenses=0`

AI evidence pack reproducibility (clean baseline + current workspace state):

- `EVIDENCE_TIMESTAMP=20260203T180000Z EVIDENCE_EPOCH=1760100000 infra/scripts/evidence-pack-ai-governance.sh --verify`
- Output: `Reproducible evidence pack hash: 03367c8b3778c6f717233fefa1173a7a06f65d1e72c8128d3cd1e68a2ec0abd1`

## “Governance cannot be overridden” — verified vs not verified (in this environment)

Verified here (code + tests):

- [x] Governance/authorization contracts are present:
  - `contracts/src/governance/PolicyRegistry.sol`
  - `contracts/src/governance/InterchainAuthorization.sol`
  - `contracts/src/governance/LowBalancerGovernor.sol`
- [x] Invariant suite passes (`contracts/reports/foundry/summary.json` = ok), providing code-level enforcement checks (see `docs/ai-core/invariants.md` and `docs/security/ai-governance-invariants.yaml` for the declared invariant set).
- [x] AI governance failure-mode drills pass (circuit-breaker behavior and refusal paths under simulated failure conditions).

Not verified here (requires real runtime integration):

- [ ] Live RPC health/load/restart behavior for L1/L2/L3 nodes.
- [ ] Docker-compose runtime launch correctness and network isolation enforcement under real container runtime.
- [ ] Bridge/interop execution against external chains (Ethereum/Bitcoin/etc) with real RPCs and finality.

## Decision (this environment)

- **Result:** **CONDITIONAL GO** for code-level governance/policy enforcement and artifact generation.
- **Production GO requires:** re-run all gates on a host with working Docker + RPC access **without** the skip flags above; run Trivy with DB updates enabled; run full integration tests and bridge failure simulations against controlled testnets.
