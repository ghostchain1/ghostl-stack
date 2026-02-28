# Launch Readiness Report

Generated on: 2026-02-12

## Current State Summary

- DEVNET working tree: `/home/ghost/ghostl-stack/` (on `ghostchain-devnet`)
- Launch system scripts installed:
  - `launch-system/validate-release.sh`
  - `launch-system/build-release.sh`
  - `launch-system/seal-release.sh`
  - `launch-system/push-release-to-testnet.sh`
  - `launch-system/push-release-to-mainnet.sh`
- Governance gate contract code present:
  - `contracts/src/governance/MainnetLaunchGate.sol`
  - `contracts/src/governance/ReleaseGate.sol`
- Release sealing produces:
  - `manifest.json`, `checksums.txt`
  - `governance/launch-hashes.json`, `governance/calldata.txt`
  - `scripts/deploy-testnet.sh`, `scripts/deploy-mainnet.sh` (mainnet is authorization-gated)

## Validations Performed

- Script syntax validated (`bash -n`) on DEVNET.
- Keccak-256 implementation validated against known vector (`keccak256("")`).
- Sample sealed release(s) generated under `releases/local-*`.

## Blocking Issues / Gaps

1) **TESTNET and MAINNET SSH reachability**
   - Current VMs `ghostchain-testnet-l1` and `ghostchain-mainnet-l1` are running, but not reachable via the hypervisor’s private `192.168.122.0/24` management network.
   - QEMU guest agent is not connected for these VMs, so libvirt cannot report their in-guest IPs.
   - Until there is a reliable management path, `push-release-to-*.sh` cannot be executed end-to-end.

2) **On-chain gate deployment**
   - `MainnetLaunchGate` must be deployed on GhostChain L1 and its address must be set on MAINNET via `MAINNET_LAUNCH_GATE_ADDRESS`.
   - `ReleaseGate` must be deployed on GhostChain L1 and its address must be set on MAINNET via `MAINNET_RELEASE_GATE_ADDRESS`.
   - A governance/timelock path must exist to call `authorizeMainnetLaunch(...)`.
   - Governance must approve constitution hash + release manifest hash + proposal hash + attestation hash in `ReleaseGate`.

3) **Image digest locking**
   - `images.lock` currently contains a placeholder and should be populated with immutable digests (or an image distribution mechanism) before production.

## Next Steps (Recommended Order)

1) Establish a management interface for TESTNET/MAINNET VMs (guest agent or dedicated NIC).
2) Deploy `MainnetLaunchGate` + `ReleaseGate` and bind them behind your timelock/governance executor.
3) Implement image distribution:
   - registry with digest pinning, or
   - `docker save` artifacts shipped with the release
4) Generate and push a release to TESTNET; deploy and validate.
5) Generate a governance proposal and authorize a MAINNET release; deploy and validate.
