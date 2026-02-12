# Mainnet overlays

This directory holds MAINNET configuration overlays.

Hard rules:

- Never deploy mainnet from the devnet working tree.
- Never reuse testnet validator keys.
- Mainnet deploy is governance-gated.

Current overlays:

- `ghostchain.env`: merged into `releases/<id>/env.mainnet` by `launch-system/build-release.sh`.
