# ghostchain-bridge-hub

Hierarchical routing guard service for bridging:
- `GhostL1` is the only external egress source.
- `GhostL2` and `GhostL3` can only submit roots/messages inward.
- L3 withdrawal validation requires recursive `L3 -> L2 -> L1` confirmation.

## Endpoints

- `GET /health`
- `GET /state`
- `POST /roots/l2`
- `POST /roots/l3`
- `POST /egress` (requires `sourceLayer=1`)
- `POST /validate-withdrawal`
- `POST /egress/:messageId/execute`
