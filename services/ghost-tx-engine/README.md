# ghost-tx-engine

`ghost-tx-engine` is a durable transaction processor for GhostChain L1, GhostL2, and GhostL3.

It fills the gap between the repo's current placeholder worker flow and actual stable transaction processing:

- append-only journal for crash recovery
- bounded in-memory job tracking
- idempotent enqueue semantics
- per-layer concurrency controls
- exponential backoff with capped retries
- Ghost-native `ghost_sendRawTransaction` submission through `ghost-sdk-core`

## Endpoints

- `GET /health`
- `GET /readyz`
- `GET /status`
- `GET /metrics`
- `POST /transactions`
- `GET /transactions`
- `GET /transactions/:id`
- `POST /transactions/:id/retry`

## Request body

```json
{
  "layer": "L2",
  "rawTransaction": "0x02...",
  "idempotencyKey": "optional-client-key",
  "metadata": {
    "source": "wallet-service"
  }
}
```

## Environment

- `TX_ENGINE_L1_RPC_URL`, `TX_ENGINE_L2_RPC_URL`, `TX_ENGINE_L3_RPC_URL`
- `TX_ENGINE_REQUEST_TIMEOUT_MS`
- `TX_ENGINE_POLL_INTERVAL_MS`
- `TX_ENGINE_RETRY_BASE_MS`
- `TX_ENGINE_RETRY_MAX_MS`
- `TX_ENGINE_MAX_ATTEMPTS`
- `TX_ENGINE_MAX_TRACKED_JOBS`
- `TX_ENGINE_COMPACT_EVERY`
- `TX_ENGINE_JOURNAL_PATH`
