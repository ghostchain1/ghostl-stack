# Compliance Evidence Packaging

This module produces an ISO/SOC-style evidence bundle by mapping controls to attestation artifacts.

Artifacts:
- `controls-map.json`
- `evidence-bundle.json` (generated)

Run:
```
./ops/compliance/bundle.sh --snapshot ./ops/docker/snapshots/<timestamp>
```
