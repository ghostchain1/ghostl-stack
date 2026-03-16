# ghost-rpc-aggregator

`ghost-rpc-aggregator` is the Ghost-native RPC front door for GhostChain L1, GhostL2, and GhostL3.

It exists because the current [`ghost-rpc-proxy`](../ghost-rpc-proxy/index.mjs) is a single-upstream proxy. This service adds the stability features needed for sustained production traffic:

- per-layer endpoint pools
- short-lived response caching for safe `ghost_*` methods
- in-flight request deduplication
- endpoint verification against canonical Ghost chain IDs
- circuit breaking and failover
- bounded in-memory state

## Endpoints

- `GET /health`
- `GET /readyz`
- `GET /status`
- `GET /metrics`
- `POST /rpc/l1`
- `POST /rpc/l2`
- `POST /rpc/l3`

## Environment

- `RPC_L1_URLS`, `RPC_L2_URLS`, `RPC_L3_URLS`: comma-separated endpoint lists
- `RPC_REQUEST_TIMEOUT_MS`: upstream timeout
- `RPC_CACHE_DEFAULT_TTL_MS`: default cache TTL for safe methods
- `RPC_CACHE_MAX_ENTRIES`: bounded cache size
- `RPC_CIRCUIT_FAILURES`: failures before an endpoint is opened
- `RPC_CIRCUIT_COOLDOWN_MS`: cooldown before retrying an opened endpoint
- `RPC_VERIFY_INTERVAL_MS`: chain ID verification interval

## Notes

- Only `ghost_*` methods are accepted.
- Chain ID verification is enforced against:
  - `14000101` for L1
  - `901` for L2
  - `903` for L3
