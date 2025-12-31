# Chains

This folder contains the **local Polygon Edge chain data** used by the dev stack.

- `chains/l2/chain.json` and `chains/l3/chain.json` are the committed configs.
- `chains/l2/data/` and `chains/l3/data/` are generated (genesis + validator data) and ignored by git.

## Initialize

```bash
bash infra/scripts/chains/init.sh
```

## Premine a funded key (for Guard / Relayer)

Edit `chains/l2/chain.json` (and optionally `chains/l3/chain.json`) or run:

```bash
bash infra/scripts/chains/premine.sh 0xYourAddress --l3
```

Generate a new wallet (example):

```bash
cd contracts
node -e "const {Wallet}=require('ethers'); const w=Wallet.createRandom(); console.log('ADDRESS=',w.address); console.log('PRIVATE_KEY=',w.privateKey);"
cd ..
```

## Reset chain data

```bash
bash infra/scripts/chains/reset.sh
```

## Troubleshooting

If `ghostl2` / `ghostl3` won’t start, run:

```bash
bash infra/scripts/chains/doctor.sh
```

Polygon Edge runs as user `edge` (uid `100`, gid `101`) and can refuse to start if the bind-mounted data dir has mismatched ownership.
`bash infra/scripts/chains/init.sh` fixes ownership + permissions.
