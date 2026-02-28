# GhostStack VM-Separated Launch System

Hard requirement model:

- **DEVNET VM** (`ghostchain-devnet`) is the **only** source of truth and the **only** place builds happen.
- **TESTNET VM** deploys only from validated release artifacts.
- **MAINNET VM** deploys only from sealed release artifacts **and** an **on-chain authorization gate**.

Canonical working tree (DEVNET only):

- `/home/ghost/ghostl-stack/`

Release artifacts (DEVNET):

- `/home/ghost/ghostl-stack/releases/<release-id>/`

Release artifacts (TESTNET/MAINNET):

- `/opt/ghoststack/releases/<release-id>/`

## Phase 1: Build + validate (DEVNET)

```bash
cd /home/ghost/ghostl-stack
sudo -u ghost bash -lc './launch-system/validate-release.sh'
sudo -u ghost bash -lc './launch-system/build-release.sh --release-id <release-id>'
sudo -u ghost bash -lc './launch-system/seal-release.sh --release-id <release-id>'
```

Notes:

- `seal-release.sh` populates `images.lock` by pulling/building the DEVNET compose stack and recording immutable image IDs + repo digests (when available).
- Deploy scripts run `docker compose up ... --no-build` to enforce “no builds outside DEVNET”.
- Optional (recommended for production/airgapped): `HYPERGHOST_BUNDLE_IMAGES=1` when sealing to embed `images/docker-images.tar.gz` (deploy scripts auto-load it if present).

## Phase 2: Transfer artifacts (DEVNET → TESTNET/MAINNET)

Testnet:

```bash
./launch-system/push-release-to-testnet.sh --release-id <release-id> --ssh administrator@<TESTNET_IP_OR_HOST>
```

Mainnet:

```bash
./launch-system/push-release-to-mainnet.sh --release-id <release-id> --ssh administrator@<MAINNET_IP_OR_HOST>
```

Both push scripts:

- verify remote `hostname` matches the intended environment (regex)
- verify `sha256sum -c checksums.txt` succeeds on the remote side

## Phase 3: Deploy on TESTNET

On the TESTNET VM:

```bash
cd /opt/ghoststack/releases/<release-id>
sudo ./scripts/deploy-testnet.sh
./scripts/validate-testnet.sh
```

Rollback:

```bash
sudo ./scripts/rollback-testnet.sh
```

## Phase 4: Governance-locked MAINNET deploy (hard gate)

MAINNET deploy is forbidden unless:

1) DEVNET sealed the release (manifest/checksums/hashes).
2) A governance proposal authorized the exact tuple:
   - `release_id_bytes32`
   - `manifest_hash`
3) MAINNET deploy script verifies `MainnetLaunchGate.isLaunchAuthorized(releaseId, manifestHash) == true`.
4) MAINNET deploy script verifies `ReleaseGate.isMainnetLaunchAllowed() == true`.

On DEVNET, sealing writes:

- `releases/<release-id>/governance/launch-hashes.json`
- `releases/<release-id>/governance/calldata.txt`
- `releases/<release-id>/governance/proposal.md`

On MAINNET:

```bash
cd /opt/ghoststack/releases/<release-id>
RPC_L1=http://127.0.0.1:18545 \
MAINNET_LAUNCH_GATE_ADDRESS=0x... \
MAINNET_RELEASE_GATE_ADDRESS=0x... \
  ./governance/verify-onchain-authorization.sh

sudo RPC_L1=http://127.0.0.1:18545 \
MAINNET_LAUNCH_GATE_ADDRESS=0x... \
MAINNET_RELEASE_GATE_ADDRESS=0x... \
  ./scripts/deploy-mainnet.sh
```

If authorization is missing, `deploy-mainnet.sh` must fail with:

> MAINNET DEPLOY BLOCKED: No on-chain authorization found for release-id + manifestHash.

## Virt-manager remote management (hypervisor)

URI:

```text
qemu+ssh://administrator@<HYPERVISOR_PUBLIC_IP>/system
```

Permissions required on hypervisor:

- `administrator` in `libvirt` and `kvm` groups
