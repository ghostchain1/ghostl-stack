# Satellite / Offline Quorum Nodes

This module ingests offline/satellite attestations and syncs them into the snapshot.

Input directory (default):
- `ops/satellite/pending/*.json`

Each attestation JSON should include:
```
{
  "region": "na-east-1",
  "timestamp": "2026-01-23T00:00:00Z",
  "attestationHash": "sha256...",
  "recursiveProofHash": "sha256...",
  "signature": "base64...",
  "nonce": "unique-id"
}
```

Run:
```
./ops/satellite/sync.sh --snapshot ./ops/docker/snapshots/<timestamp> --mode prod
```

Outputs:
- `ops/satellite/offline-attestations.json`
- `ops/satellite/sync-log.json`
