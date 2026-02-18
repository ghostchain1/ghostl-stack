# ghost-ai-consensus

Deterministic AI-assisted consensus policy service for cascading finality:
- `GhostL2` proposals must confirm parent `GhostL1` finality.
- `GhostL3` proposals must confirm parent `GhostL2` finality and its `GhostL1` anchor.

## Endpoints

- `GET /health`
- `GET /policy`
- `POST /score`
- `POST /validate-cascading-finality`
- `POST /propose-block`
- `POST /evidence-pack`

## Determinism constraints

- Fixed policy hash (`sha256` over canonical JSON policy config)
- Integer-only scoring
- No external network inference at decision time
- Replay-safe commitments for feature vectors and outcomes
