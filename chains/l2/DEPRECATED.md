# DEPRECATED — OP Stack baseline (Phase 1 freeze)

This directory (`chains/l2/`) is the **frozen compatibility baseline** from the OP Stack era.

> **Do not modify these files.** They are kept for reference during the dual-run Phase 3
> comparison period. The active chain definition is [`chains/ghostl2/chain.json`](../ghostl2/chain.json).

## Migration status

| File | Status | Replacement |
|---|---|---|
| `rollup.json` | **Frozen / read-only** | `chains/ghostl2/chain.json` + `chains/ghostl2/genesis.json` |

## Removal timeline

These files will be deleted in **Phase 5** (after devnet parity gates pass).
Track progress in [`docs/architecture/custom-rollup/README.md`](../../docs/architecture/custom-rollup/README.md).
