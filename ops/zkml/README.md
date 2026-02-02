# zkML Policy Learning

This module consumes snapshot signals and emits a policy update proposal plus a zkML proof reference.

Run:
```
ZKML_PROOF_PATH=/path/to/zkml-proof.json \
./ops/zkml/learn.sh --snapshot ./ops/docker/snapshots/<timestamp> --mode prod
```

Outputs:
- `policy-update.json`
- `model-proof.json`
- `learning-log.json`

If `ZKML_PROOF_PATH` is missing or invalid, `model-proof.json` is marked `missing` or `invalid`.
