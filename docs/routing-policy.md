# Routing Policy — GhostL3 → GhostL2 → GhostL1

Date: 2026-02-21

## Policy
Mandatory settlement hierarchy:
- Allowed: `L3 -> L2`
- Allowed: `L2 -> L1`
- Allowed operational reverse paths: `L1 -> L2`, `L2 -> L3`
- Blocked: any direct `L3 -> L1`
- Blocked: same-layer transitions (`L1 -> L1`, `L2 -> L2`, `L3 -> L3`)

External egress policy:
- Only `L1 -> external` is valid.
- Any `L2` or `L3` external egress is blocked.

## Shared Guard
The shared policy implementation is in:
- `packages/routing-guard/index.js`

Exports:
- `assertRoutingTransition(sourceLayer, targetLayer, opts?)`
- `assertExternalEgress(sourceLayer)`
- `assertEndpointAllowlisted(endpointUrl, allowlist)`
- `layerFromNumeric(value)`

## Enforcement Points
- `services/ghostchain-bridge-hub/src/server.ts`
  - `POST /roots/l2` enforces `L2 -> L1`
  - `POST /roots/l3` enforces `L3 -> L2`
  - `POST /egress` enforces external egress from `L1` only
  - `POST /route/validate` explicit operator route validation

- `services/ghost-relayer/src/index.ts`
  - Startup checks assert expected relay transitions for `L2 -> L3` and `L3 -> L2`
  - RPC endpoint checks enforce allowlist usage when enabled
  - `GET /routing-policy` publishes allowed + blocked transitions

- `services/bridge-service/src/index.js`
  - `POST /bridges/route/validate` admin validation endpoint backed by shared guard

## Validation Artifacts
See `evidence/phase3/`:
- `routing-guard-tests.txt`
- `routing-chaos-matrix.json`
- `bridge-hub-build.txt`
- `relayer-check.txt`
- `bridge-service-syntax-check.txt`
