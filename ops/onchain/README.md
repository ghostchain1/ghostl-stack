# On-Chain Notarization

This directory stores on-chain notarization artifacts for immutability attestations.

Generated artifact:
- `notarization.json`

Submit a notarization hash using a pre-signed transaction (non-custodial):

```
GHOST_NOTARIZATION_RAW_TX=0x... \
./ops/onchain/notarize.sh \
  --attestation ./ops/docker/attestations/immutability-attestation.json \
  --merkle ./ops/docker/attestations/chain-state-merkle-proofs.json \
  --oci ./ops/docker/attestations/oci-image-provenance.json \
  --vc ./ops/docker/attestations/immutability-vc.json \
  --out ./ops/onchain/notarization.json
```

If no raw transaction is provided, the script records a `skipped` status without failing. This preserves non-custodial behavior by requiring an external signer.
