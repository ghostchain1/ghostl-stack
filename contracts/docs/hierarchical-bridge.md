# Hierarchical Messenger + Bridge (L3 → L2 → L1)

Minimal contracts to support messaging and ERC20 bridging in a parent/child chain hierarchy where each layer only talks to its parent.

## Contracts

- `common/XDomainMessenger.sol`: parent-only relay, replay protection, exposes `xDomainMessageSender`.
- `bridge/StandardBridge.sol`: escrow/burn on source, mint/release on destination via messenger auth.
- `bridge/BridgeMintableERC20.sol`: representation token minted/burned by a bridge.
- `tokens/TestERC20.sol`: simple ERC20 for testing.
- `apps/PingPong.sol`: demo app for cross-domain messaging.

## Deploy order per chain

1) Messenger (per chain):
   - L1: `XDomainMessenger(parent=0x0, child=L2Messenger)`
   - L2: `XDomainMessenger(parent=L1Messenger, child=L3Messenger)`
   - L3: `XDomainMessenger(parent=L2Messenger, child=0x0)`
   - Optionally call `setChildMessenger` after deploying.

2) Bridges (per parent/child pair):
   - L1 bridge: `StandardBridge(messenger=L1Messenger, remote=L2ToL1Bridge)`
   - L2 bridge (to L1): `StandardBridge(messenger=L2Messenger, remote=L1Bridge)`
   - L2 bridge (to L3): `StandardBridge(messenger=L2Messenger, remote=L3Bridge)`
   - L3 bridge: `StandardBridge(messenger=L3Messenger, remote=L2ToL3Bridge)`

3) Tokens (choose canonical custody layer):
   - If canonical on L1: deploy `TestERC20` on L1; deploy `BridgeMintableERC20` on L2/L3 with `bridge` = local bridge.
   - Bridging direction flips `localIsRepresentation` in `bridgeERC20`.

## Hardhat helper scripts

All scripts live under `contracts/scripts/` and use env vars.

- `deploy-messenger.ts`:
  - Env: `PARENT_MESSENGER` (default 0x0), `CHILD_MESSENGER` (default 0x0)
  - Run: `npx hardhat run scripts/deploy-messenger.ts --network ghostl2`
- `deploy-standard-bridge.ts`:
  - Env: `MESSENGER`, `REMOTE_BRIDGE`
  - Run: `MESSENGER=0x... REMOTE_BRIDGE=0x... npx hardhat run scripts/deploy-standard-bridge.ts --network ghostl2`
- `deploy-test-erc20.ts`:
  - Env: `TOKEN_NAME`, `TOKEN_SYMBOL`, `TOKEN_DECIMALS` (default 18), optional `MINT_TO`, `MINT_AMOUNT`
  - Run: `TOKEN_NAME="Test" TOKEN_SYMBOL=TST TOKEN_DECIMALS=18 npx hardhat run scripts/deploy-test-erc20.ts --network ghostl1`
- `deploy-bridge-mintable.ts`:
  - Env: `TOKEN_NAME`, `TOKEN_SYMBOL`, `TOKEN_DECIMALS`, `BRIDGE`
  - Run: `TOKEN_NAME="Rep" TOKEN_SYMBOL=REP TOKEN_DECIMALS=18 BRIDGE=0x... npx hardhat run scripts/deploy-bridge-mintable.ts --network ghostl2`
- `deploy-pingpong.ts`:
  - Env: `MESSENGER`
  - Run: `MESSENGER=0x... npx hardhat run scripts/deploy-pingpong.ts --network ghostl3`

Networks are preconfigured in `contracts/hardhat.config.ts`:
- `ghostl2` / `ghostl3` for the dev Polygon Edge stack
- `ghostl2Op` / `ghostl3Op` for the OP Stack L2/L3 RPCs (update envs as needed)

## Using the bridge

- To send ERC20 up/down, call `bridgeERC20`:
  - `localIsRepresentation=false` if the local token is canonical (escrow locally, mint remotely).
  - `localIsRepresentation=true` if the local token is a representation (burn locally, mint remotely).
- Finalization happens via `finalizeBridgeERC20` relayed through the messenger; only the remote bridge (as xDomain sender) is accepted.

## Notes

- This is for dev/test; not a replacement for OP Portal/SystemConfig/DGF/fault proofs.
- Messenger relay is direct call for simplicity; production would enqueue + prove.
