# Geo-Political Risk Scoring

This module scores regions for quorum selection based on regulatory, sanctions, and stability risk.

Artifacts:
- `region-scores.json` (input scores)
- `quorum-selection.json` (selected regions per rotation)

Run:
```
./ops/geo-risk/select-quorum.sh --seed 20260101-000000
```
