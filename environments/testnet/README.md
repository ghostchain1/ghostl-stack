# Testnet overlays

This directory holds TESTNET configuration overlays.

Hard rule: do not place private keys here. Keys must be provisioned out-of-band
on the testnet VM and never shared with mainnet.

Current overlays:

- `ghostchain.env`: merged into `releases/<id>/env.testnet` by `launch-system/build-release.sh`.
