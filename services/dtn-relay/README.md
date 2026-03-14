# DTN Relay — GhostChain Governance Bundle Transport

A lightweight HTTP relay for transmitting signed governance bundles over
Delay/Disruption-Tolerant Networks (DTN) — e.g. air-gapped nodes, satellite links,
intermittent connectivity environments.

## Architecture

```
offline node ──── dtn pack ────► bundle.json ──► relay POST /ingest
                                                       │
online node  ◄─── dtn pull ◄─── relay GET /fetch/:id ◄┘
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `DTN_RELAY_PORT` | `7740` | Listening port |
| `DTN_RELAY_BIND` | `127.0.0.1` | Bind address (keep loopback in prod; use 0.0.0.0 only behind VPN) |
| `RELAY_ADMIN_TOKEN` | *(unset)* | Secret token for DELETE endpoint. If unset, admin ops are disabled. |
| `DTN_MAX_BUNDLE_BYTES` | `1048576` | Max ingest body size (1 MB) |
| `DTN_MAX_STORED` | `1000` | Max bundles stored in memory before LRU eviction |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ingest` | Ingest a signed governance bundle |
| `GET` | `/fetch/:bundleId` | Retrieve bundle by ID |
| `GET` | `/fetch-chain/:chainId` | List bundle IDs for a chain (sorted by nonce desc) |
| `GET` | `/status` | Health and stats |
| `DELETE` | `/bundle/:bundleId` | Purge bundle (requires `X-Admin-Token` header) |

## Security Notes

- Bundles undergo lightweight pre-validation on ingest (structure, expiry, replay nonce check).
- Full cryptographic verification (Merkle + signatures) must be performed by the consuming node
  using `@ghostchain/governance-bundle.verifyBundle()`.
- The relay intentionally does NOT hold signing keys — it is transport-only.
- Run behind a VPN or restrict `DTN_RELAY_BIND` to localhost for internal use.

## Running

```bash
node src/index.js
# or:
DTN_RELAY_PORT=7740 RELAY_ADMIN_TOKEN=$(openssl rand -hex 32) node src/index.js
```
