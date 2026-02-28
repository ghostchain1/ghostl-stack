# Routing Law Policy (L3->L2->L1)

## Allowed Transaction Paths
- `L3 -> L2`
- `L2 -> L1`
- `L1 -> external`

## Disallowed Paths
- `L3 -> L1` (direct)
- `L2 -> external` (direct settlement)
- `L3 -> external`

## Enforcement Controls
- Compose network segmentation in `compose.testnet.yml`:
  - `l1_net`, `l2_net`, `l3_net`, `shared_obs`, `ingress_net`
- Static routing checks in `scripts/testnet/00-preflight.sh`
- Runtime routing checks in `scripts/verify-routing.sh`
- Release gate requires tx proof bundle (`scripts/testnet/30-verify.sh`)

## Violations
- Any direct L3->L1 reference in command/env/config is a release blocker
- Any direct external settlement from L2/L3 is a release blocker
