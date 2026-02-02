# L1 Evidence Pack

This folder defines the structure and generation flow for the GhostChain L1 evidence pack. The pack is a deterministic, court-ready bundle that captures configuration, governance artifacts, and provenance hashes.

## Layout

- `templates/`: Placeholder metadata (non-secret) that must be populated by operators.
- `out/`: Generated evidence packs (ignored by git).

## Generation

Run the generator from repo root:

```bash
infra/scripts/evidence-pack-l1.sh
```

For reproducible output, pin the timestamp and epoch:

```bash
EVIDENCE_TIMESTAMP=20260202T000000Z \
EVIDENCE_EPOCH=1769980800 \
infra/scripts/evidence-pack-l1.sh --verify
```

## Notes

- Do not place secrets in this folder; only non-secret metadata is allowed.
- Update the templates before generating production evidence packs.
