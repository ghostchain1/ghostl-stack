# Live Runtime Verification (L1/L2/L3)

This checklist is for verifying **running** GhostChain L1/L2/L3 networks on an operator host.

## Prereqs

- L1/L2/L3 are running and exposing their host ports.
- `curl` installed.
- Docker daemon access is recommended (for restart checks / image scans), but RPC checks work even when Docker is blocked.

## L1

- Full gate (RPC reachability + monitoring + policy + invariants + scans):
  - `bash infra/scripts/gates/l1-go-no-go.sh`
- If Docker daemon is blocked but RPC is reachable (skip docker-only parts automatically):
  - `bash infra/scripts/gates/l1-go-no-go.sh`
- Optional: include container image scan (requires Docker + Trivy):
  - `TRIVY_IMAGE_SCAN=1 bash infra/scripts/gates/l1-go-no-go.sh`

## L2

- Full gate:
  - `bash infra/scripts/gates/l2-go-no-go.sh`
- Optional restart resilience check (requires Docker):
  - `L2_GO_NO_GO_RESTART_CHECK=1 bash infra/scripts/gates/l2-go-no-go.sh`

## L3

- Full gate:
  - `bash infra/scripts/gates/l3-go-no-go.sh`
- Optional restart resilience check (requires Docker):
  - `L3_GO_NO_GO_RESTART_CHECK=1 bash infra/scripts/gates/l3-go-no-go.sh`
