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
  --zk ./ops/zk/immutability-proof.json \
  --recursive ./ops/zk/recursive-proof.json \
  --out ./ops/onchain/notarization.json
```

If no raw transaction is provided, the script records a `skipped` status without failing. This preserves non-custodial behavior by requiring an external signer.

## Cross-Chain Anchor (L1/L2/L3)

`anchor-crosschain.sh` anchors the attestation + recursive proof hash across L1/L2/L3 using pre-signed raw transactions.

```
GHOST_ANCHOR_L1_RAW_TX=0x... \
GHOST_ANCHOR_L2_RAW_TX=0x... \
GHOST_ANCHOR_L3_RAW_TX=0x... \
./ops/onchain/anchor-crosschain.sh \
  --attestation ./ops/docker/attestations/immutability-attestation.json \
  --recursive ./ops/zk/recursive-proof.json \
  --out ./ops/onchain/cross-chain-anchors.json
```

Optional RPC overrides:

```
./ops/onchain/anchor-crosschain.sh \
  --attestation ./ops/docker/attestations/immutability-attestation.json \
  --recursive ./ops/zk/recursive-proof.json \
  --out ./ops/onchain/cross-chain-anchors.json \
  --rpc-l1 http://ghostchain:8545 \
  --rpc-l2 http://ghostl2:9545 \
  --rpc-l3 http://ghostl3:10545
```
