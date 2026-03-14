# GST-Native Evidence Pack

Generated (UTC): `2026-02-16T13:33:42Z`
Tested git ref: `brand/gst-native`

## Before / After counts

- Phase 1 targeted first-party leakage inventory (documented): `58` hits
  - Source: `docs/gst-migration/ETH-LEAKAGE-INVENTORY.md`
- Current enforced gate result: `0` forbidden hits
  - Command: `bash scripts/gst-leakage-gate.sh`

## Key diffs (atomic commit chain)

- `b9fd879d7` L1 canonical native currency + branding removal
- `e8f0bdc17` L2 canonical native currency + config rename
- `6f8c5519b` L3 canonical native currency + config rename
- `9c1f8c13e` through `7876e1981` Phase 3 waves A-E
- `8f1ff670b` Phase 4 enforcement gate hardening
- `da6f31260` Phase 5 governance lock + deterministic calldata
- `0ee50733c` Phase 6 Foundry invariant hardening
- `492890f53` Phase 7 GST dashboards
- `538dae64b` Phase 8 AI policy enforcement wiring

## Verification commands and results

- `bash scripts/gst-leakage-gate.sh` → **OK**
- `bash scripts/preflight.sh` → **OK**
- `forge test --match-path test/GSTInvariant.t.sol` (in `contracts/`) → **OK** (`2 passed`)
- `npm --prefix contracts run test:gst-invariant` → **OK** (`2 passed`)
- `npm --prefix contracts run build` → **OK**
- `npm --prefix services/hyper-ghost-supervisor run build` → **OK**
- `npm --prefix services/hyper-ghost-supervisor test` → **OK** (`4 passed`)
- `jq empty grafana/dashboards/gst-executive.json grafana/dashboards/gst-chains.json grafana/dashboards/gst-services.json` → **OK**
- Compose validation:
  - `docker compose -f infra/ghostchain/docker-compose.l1.yml config` → **OK**
  - `docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml -f observability/infra/docker-compose.yml config` → **OK**
  - `docker compose -f observability/infra/docker-compose.yml config` → **OK**
- L1/L2/L3 smoke (best effort in restricted harness):
  - `SKIP_* ... bash infra/scripts/gates/l1-go-no-go.sh` → **OK**
  - `L2_GO_NO_GO_SKIP_RUNTIME=1 L2_DOCTOR_SKIP_RUNTIME=1 L2_DOCTOR_SKIP_DOCKER=1 bash infra/scripts/gates/l2-go-no-go.sh` → **OK** (`L2_GO_NO_GO_INVARIANT_MODE=gst` default)
  - `L2_GO_NO_GO_SKIP_RUNTIME=1 L2_DOCTOR_SKIP_RUNTIME=1 L2_DOCTOR_SKIP_DOCKER=1 L2_GO_NO_GO_INVARIANT_MODE=full bash infra/scripts/gates/l2-go-no-go.sh` → **OK**
  - `L2_DOCTOR_SKIP_RUNTIME=1 L2_DOCTOR_SKIP_DOCKER=1 bash infra/scripts/doctor-l2.sh` → **OK**
  - `L3_GO_NO_GO_SKIP_RUNTIME=1 L3_DOCTOR_SKIP_RUNTIME=1 L3_DOCTOR_SKIP_DOCKER=1 bash infra/scripts/gates/l3-go-no-go.sh` → **OK** (`L3_GO_NO_GO_INVARIANT_MODE=gst` default)
  - `L3_GO_NO_GO_SKIP_RUNTIME=1 L3_DOCTOR_SKIP_RUNTIME=1 L3_DOCTOR_SKIP_DOCKER=1 L3_GO_NO_GO_INVARIANT_MODE=full bash infra/scripts/gates/l3-go-no-go.sh` → **OK**
  - `bash ops/scripts/preflight.sh --dry-run --json` → **OK**

## Governance calldata evidence

- Artifact: `docs/gst-migration/PROPOSAL-CALLDATA.json`
- Determinism check: repeated generation produced identical SHA256:
  - `1973615bd4be6929fb29e7324dc2067bdf9d49e3dcbfd0898b979ba3b37e8541`
- Key hashes:
  - `descriptionHash`: `0x24c25388e8158abeb51707fee4b44699a619c0db4d94ca8d9018ffc4a3814263`
  - `executor.proposalHash`: `0x778cdc1564c94936baab8fcdefce6201418b4a67623183771e7ed4b45bb3df03`
  - `governorHash`: `0x70312cb8a20291b22f9f81f245a6e279d25a6826d926ca17300e93d470d2aed9`

## Dashboard list (GST-only)

- `grafana/dashboards/gst-executive.json`
- `grafana/dashboards/gst-chains.json`
- `grafana/dashboards/gst-services.json`

## Compliance matrix

| Control | Status | Evidence |
|---|---|---|
| L1/L2/L3 GST branding | Green | Phase 2 commits + gate pass |
| Service identifier migration | Green | Phase 3 wave reports |
| Leakage enforcement gate | Green | `scripts/gst-leakage-gate.sh` + CI/workflow hooks |
| Governance constitutional lock | Green | `GSTConstitution.sol` + deterministic calldata artifact |
| Foundry invariant regression | Green | `contracts/test/GSTInvariant.t.sol` passing |
| GST observability dashboards | Green | `grafana/dashboards/gst-*.json` + compose/provisioning wiring |
| AI policy enforcement | Green | `services/ai-policy/gst_policy.ts` + Hyper Ghost/GhostControl/preflight wiring |
| L2/L3 go/no-go invariant enforcement in this harness | Green | Reduced-runtime and full invariant modes both pass in this harness |
