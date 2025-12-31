# Chains

This folder contains the **local Polygon Edge chain data** used by the dev stack.

- `chains/l2/chain.json` and `chains/l3/chain.json` are the committed configs.
- `chains/l2/data/` and `chains/l3/data/` are generated (genesis + validator data) and ignored by git.

## Initialize

```bash
bash infra/scripts/chains/init.sh
```

## Reset chain data

```bash
bash infra/scripts/chains/reset.sh
```

