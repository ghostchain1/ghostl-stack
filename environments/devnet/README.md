# Devnet overlays

This directory is the source-of-truth for DEVNET configuration overlays.

Rules:

- DEVNET may build from the working tree.
- TESTNET/MAINNET must deploy only from sealed releases.

Populate environment-specific values here and have `launch-system/build-release.sh`
render `env.testnet` / `env.mainnet` from these overlays.
