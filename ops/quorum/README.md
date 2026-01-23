# Cross-Region Quorum Attestation

This directory aggregates regional attestations into a quorum proof.

Inputs:
- `ops/quorum/regions/*.json` (one per region)

Output:
- `quorum-attestation.json`

Run:
```
./ops/quorum/quorum-attest.sh \
  --attestation ./ops/docker/attestations/immutability-attestation.json \
  --zk ./ops/zk/immutability-proof.json \
  --out ./ops/quorum/quorum-attestation.json
```

Set policy in `quorum-policy.json`.
