# GhostBrain Core — Runtime API Reference

**Version:** 1.0.0  
**Base URL:** `http://localhost:7900`  
**Management sideband:** `http://localhost:7901`

---

## Authentication

All endpoints require a Bearer token issued by the GhostBrain management sideband.
In development mode (`NODE_ENV=development`), authentication is bypassed.

```
Authorization: Bearer <token>
```

---

## Health

### `GET /health`

Returns service health. Used by Kubernetes liveness probe.

**Response 200:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "device_id": "ghost-brain-prod-0",
  "uptime_s": 3600
}
```

**Response 503** when degraded.

---

### `GET /ready`

Returns readiness. Used by Kubernetes readiness probe.

**Response 200:** `{ "ready": true }`  
**Response 503:** `{ "ready": false, "reason": "firmware_verify_pending" }`

---

## Inference

### `POST /v1/infer`

Submit an inference request to the GhostBrain compute engine.

**Request body:**
```json
{
  "request_id": "0xabc...def",
  "model_id":   "llama-7b",
  "input_cid":  "bafyreib...",
  "max_tokens": 256,
  "source":     "l3",
  "priority":   100
}
```

| Field        | Type    | Description |
|---|---|---|
| `request_id` | hex     | Unique request identifier (bytes32 from L3 event) |
| `model_id`   | string  | Model name: `llama-7b`, `llama-13b`, `embedding-v2`, `classifier-v1` |
| `input_cid`  | string  | GhostStore/IPFS CID of input tensor blob |
| `max_tokens` | integer | Maximum output tokens (inference budget) |
| `source`     | string  | `l3` or `internal` |
| `priority`   | integer | Scheduling priority (0–255; governance tasks ≥100) |

**Response 200:**
```json
{
  "request_id":  "0xabc...def",
  "output_cid":  "bafyreid...",
  "tokens":      128,
  "latency_ms":  42,
  "attestation": "0xed25519sig..."
}
```

| Field         | Type   | Description |
|---|---|---|
| `output_cid`  | string | GhostStore CID of output tensor |
| `tokens`      | int    | Actual tokens generated |
| `latency_ms`  | int    | Wall-clock inference time (ms) |
| `attestation` | hex    | Ed25519 signature from chiplet (verifiable against L1 manifest) |

**Errors:**  
- `400` — invalid model_id or malformed CID  
- `429` — inference queue full (retry after delay)  
- `503` — compute engine unavailable

---

## Transaction Classification

### `POST /v1/classify`

Classify a batch of L1/L2/L3 transactions for risk scoring.

**Request body:**
```json
{
  "source":       "l2",
  "block_number": "12345",
  "tx_hashes":    ["0xaaa...", "0xbbb..."],
  "timestamp":    "1700000000"
}
```

**Response 200:**
```json
{
  "high_risk": ["0xaaa..."],
  "normal":    ["0xbbb..."]
}
```

---

## Governance

### `POST /v1/governance/propose`

Submit an AI-generated governance proposal for human ratification on L1.
**Does not execute on-chain autonomously.**

**Request body:**
```json
{
  "title":       "Firmware update to v2.0.0",
  "description": "Detailed proposal text...",
  "calldata":    "0x..."
}
```

**Response 202:**
```json
{
  "proposal_id": "0xproposal...",
  "relay_tx_id": "relay-abc-123",
  "status":      "pending_human_ratification"
}
```

---

## Hardware Health (Management Sideband — port 7901)

### `GET /health`

Returns the full hardware health snapshot.

**Response 200:**
```json
{
  "ts_ms":        1700000000000,
  "overall":      "ok",
  "thermal": {
    "junction_c": 72.5,
    "throttled":  false,
    "level":      "ok"
  },
  "ecc_ce_total":  0,
  "ecc_ued_total": 0,
  "vdd_core_v":    0.75,
  "droop_events":  0,
  "link_ok":       true
}
```

### `GET /attestation`

Returns the current chip attestation report.

**Response 200:**
```json
{
  "device_id":       "ghost-brain-prod-0",
  "chip_uuid":       "550e8400-e29b-41d4-a716-446655440000",
  "firmware_hash":   "0xblake3...",
  "firmware_version": 2,
  "attested_at_ms":  1700000000000,
  "l1_block":        9876543,
  "trusted":         true,
  "signature":       "0xed25519sig..."
}
```

---

## Error Codes

| HTTP | Code              | Description |
|---|---|---|
| 400  | `invalid_request` | Malformed request body |
| 401  | `unauthorized`    | Missing or invalid Bearer token |
| 404  | `not_found`       | Model or resource not found |
| 429  | `rate_limited`    | Queue full — retry with backoff |
| 500  | `internal_error`  | Unexpected error |
| 503  | `unavailable`     | Compute engine offline or firmware verify pending |
