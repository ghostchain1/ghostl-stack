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

# L2 Evidence Pack

The L2 evidence pack captures OP Stack config, governance artifacts, and provenance hashes for Ghost L2.

Generate:

```bash
infra/scripts/evidence-pack-l2.sh
```

For reproducible output:

```bash
EVIDENCE_TIMESTAMP=20260202T000000Z \
EVIDENCE_EPOCH=1769980800 \
infra/scripts/evidence-pack-l2.sh --verify
```

# AI Governance Evidence Pack

The AI governance evidence pack captures the constitutional whitepaper, invariants registry,
ratification artifacts, federation checkpoints, and failure-mode drill evidence for audit.

Generate:

```bash
infra/scripts/evidence-pack-ai-governance.sh
```

For reproducible output:

```bash
EVIDENCE_TIMESTAMP=20260202T000000Z \
EVIDENCE_EPOCH=1769980800 \
infra/scripts/evidence-pack-ai-governance.sh --verify
```
