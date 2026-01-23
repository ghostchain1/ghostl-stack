# ZK Immutability Proofs

This directory contains a reproducible ZK circuit and scripts to prove equality of pre/post hashes for:
- chain data fingerprints
- chain-state Merkle proofs
- gas token metadata

Artifacts (generated at runtime):
- `immutability-proof.json`
- `immutability-proof.verifier.json`
- `immutability-proof.onchain.json`

Requirements:
- `circom` in PATH
- `snarkjs` in PATH
- `ZK_PTAU_PATH` set to a Powers of Tau file
- `ZK_ENTROPY` set for deterministic key contribution

Generate:
```
ZK_PTAU_PATH=/path/to/powersOfTau.ptau \
ZK_ENTROPY=deterministic-seed \
./ops/zk/prove.sh --input ./ops/docker/snapshots/<timestamp>/immutability-input.json \
  --out-proof ./ops/zk/immutability-proof.json \
  --out-vkey ./ops/zk/immutability-proof.verifier.json
```

Verify:
```
./ops/zk/verify.sh \
  --proof ./ops/zk/immutability-proof.json \
  --vkey ./ops/zk/immutability-proof.verifier.json
```

On-chain verification requires a pre-signed raw transaction:
```
GHOST_ZK_VERIFY_RAW_TX=0x... \
./ops/zk/submit-proof.sh --proof ./ops/zk/immutability-proof.json --out ./ops/zk/immutability-proof.onchain.json
```
