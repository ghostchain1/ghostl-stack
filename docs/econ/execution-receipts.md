# Execution Receipts (PHASE 4)

This document defines the signed evidence format used by `hg-treasury-agent`, `hg-risk-oracle`, and `hg-proof-snapshotter`.

## Security requirements
- Receipts are append-only artifacts under evidence directories.
- Signing secrets are injected from Vault/KMS, never committed.
- Receipt writes use restricted file mode (`0600`).
- Receipts include deterministic digests for reproducible verification.

## Treasury Execution Receipt Schema

```json
{
  "receiptId": "uuid",
  "service": "hg-treasury-agent",
  "timestamp": "ISO-8601",
  "proposalId": "string",
  "approved": true,
  "decision": "executed|rejected",
  "reason": "optional string",
  "intent": {
    "proposalId": "string",
    "approved": true,
    "actionType": "allocate|distribute|pause|other",
    "target": "address-or-id",
    "strategy": "optional",
    "amountWei": "optional",
    "riskScoreBps": 3500,
    "policyMaxRiskBps": 5000,
    "metadata": {}
  },
  "gate": {
    "mainnetMode": false,
    "activationVerified": true,
    "gateAddress": "optional address",
    "blockTag": "latest"
  },
  "digest": "sha256 hex",
  "signature": "hmac-sha256 hex"
}
```

## Risk Recommendation Receipt Schema

```json
{
  "recommendationId": "uuid",
  "timestamp": "ISO-8601",
  "strategyId": "string",
  "scoreBps": 4200,
  "tier": "low|medium|high",
  "maxAllocationBps": 2000,
  "rationale": ["risk_factor_a", "risk_factor_b"],
  "signature": "hmac-sha256 hex"
}
```

## Snapshot Proof Receipt Schema

```json
{
  "snapshotId": "uuid",
  "epoch": 123,
  "timestamp": "ISO-8601",
  "source": "indexer base url",
  "leaves": ["k:v", "k:v"],
  "merkleRoot": "sha256 hex",
  "proposalRef": "string",
  "onchainPost": {
    "enabled": false,
    "attempted": false,
    "succeeded": false,
    "reason": "disabled"
  },
  "signature": "hmac-sha256 hex"
}
```

## Verification

1. Rebuild digest from canonical JSON payload (excluding mutable transport fields).
2. Verify HMAC signature using key from secure secret manager.
3. Match proposal reference to on-chain governance event/queue.
4. Cross-link receipt with indexer event timeline and snapshot root publication.

## Validation Evidence (2026-02-27)

### Devnet (`docker-compose.econ.devnet.yml`)

Executed:

```bash
docker compose -f docker-compose.econ.devnet.yml up -d --build
curl http://localhost:7601/health
curl http://localhost:7602/health
curl http://localhost:7603/health
curl http://localhost:7604/health
curl -X POST http://localhost:7602/v1/risk/score ...
curl -X POST http://localhost:7601/v1/governance/execution-intent ...
curl -X POST http://localhost:7603/v1/ingest/flow ...
curl -X POST http://localhost:7604/v1/proofs/snapshot ...
curl http://localhost:7603/v1/flows/summary
curl http://localhost:7603/v1/proofs/snapshots
```

Observed:

- `hg-treasury-agent`, `hg-risk-oracle`, `hg-reporting-indexer`, `hg-proof-snapshotter` all healthy.
- Risk receipt write succeeds (`outputPath` under `/tmp/ghost-risk/...json`).
- Treasury execution receipt succeeds (`receiptPath` under `/tmp/ghost-evidence/...json`).
- Snapshot proof succeeds with Merkle root output (`filePath` under `/tmp/ghost-proofs/...json`).
- Indexer summary endpoints report updated aggregate flow totals and snapshot reference.

### Testnet (`docker-compose.econ.testnet.yml`)

Executed:

```bash
docker compose -f docker-compose.econ.testnet.yml up -d --build
curl http://localhost:7601/health
curl http://localhost:7602/health
curl http://localhost:7603/health
curl http://localhost:7604/health
curl -X POST http://localhost:7602/v1/risk/score ...
curl -X POST http://localhost:7601/v1/governance/execution-intent ...
curl -X POST http://localhost:7603/v1/ingest/flow ...
curl -X POST http://localhost:7604/v1/proofs/snapshot ...
curl http://localhost:7603/v1/flows/summary
```

Observed:

- All four services healthy under testnet overlay.
- Treasury execution intent accepted with signed receipt.
- Risk recommendation generated with signed response.
- Snapshot response reports:
  - `onchainPost.enabled=true`
  - `onchainPost.attempted=true`
  - `onchainPost.succeeded=false`
  - `onchainPost.reason=onchain_post_not_implemented_in_bootstrap`
- This is expected for bootstrap mode and does not block receipt generation.

### Runtime hardening fixes validated during smoke

- Service Dockerfiles now copy `package-lock.json` so `npm ci` succeeds in image builds.
- Runtime evidence directory resolution now performs a write probe and falls back to `/tmp/*` when bind-mounted paths are non-writable for non-root users.
