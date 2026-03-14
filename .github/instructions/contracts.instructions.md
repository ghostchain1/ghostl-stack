---
applyTo: "contracts/src/**,contracts/script/**,contracts/test/**"
---

# GhostStack Solidity Conventions

These instructions apply whenever you read or write any file under `contracts/src/`, `contracts/script/`, or `contracts/test/`.

## Compiler & Build

- Solidity version: `0.8.24` on all files (no exceptions).
- Default profile: `via_ir = true`, optimizer runs = 200.
- Legacy profile (`FOUNDRY_PROFILE=legacy`): `via_ir = false`, `evm_version = paris` — used for pre-Shanghai L1 compat; do not use PUSH0 opcodes there.
- After any contract edit run: `cd contracts && forge build --skip test` to confirm zero errors before finishing.

## Imports

- Always use named imports: `import { Foo, Bar } from "../path/Foo.sol";`
- Never use bare `import "../path/Foo.sol";` (triggers `unaliased-plain-import` lint note).
- OZ imports resolve via remapping — use `@openzeppelin/contracts/...` (maps to `lib/openzeppelin-contracts/`).

## Branding — Hard Rules

| Write | Never write |
|---|---|
| `GST` | `ETH`, `Ether`, `WETH` |
| `GhostChain` | `Ethereum`, `Mainnet` |
| `ghost_` RPC prefix | `eth_` |
| `GhostXchange` | `Uniswap`, `SushiSwap` |
| `GNS` | `ENS` |
| `GhostBrain` | `OpenAI`, `ChatGPT` |
| `// GhostChain Contracts v5.6.1 (path/File.sol)` | `// OpenZeppelin Contracts` |

- All new contracts must `import { GhostBrand } from "../ghost/GhostBrand.sol";` and inherit it when they need `GST_UNIT`, `CANONICAL_GST`, or canonical chain IDs.
- Do not use `@openzeppelin/*` in package scope — the rebranded lib is already at `contracts/lib/openzeppelin-contracts/`.

## Forge Lint — Must Fix (warnings = blocking)

### `erc20-unchecked-transfer`
```solidity
// BAD:
token.transfer(to, amount);
token.transferFrom(from, to, amount);

// GOOD:
require(token.transfer(to, amount), "GST: transfer failed");
require(token.transferFrom(from, to, amount), "GST: transferFrom failed");
```

### `unsafe-typecast`
```solidity
// BAD:
uint112(x)
uint64(block.timestamp)

// GOOD:
require(x <= type(uint112).max, "overflow");
uint112(x)

// For block.timestamp → uint64 (fits until year ~584B, still add the check):
require(block.timestamp <= type(uint64).max, "ts overflow");
uint64(block.timestamp)
```

### `unchecked-call`
```solidity
// BAD:
target.call{value: v}(data);

// GOOD:
(bool ok,) = target.call{value: v}(data);
require(ok, "call failed");
```

## Forge Lint — Informational (fix when touching the file)

### `unwrapped-modifier-logic`
Extract modifier body to an internal function to reduce bytecode:
```solidity
// BEFORE:
modifier onlyOwner() {
    require(msg.sender == owner, "not owner");
    _;
}

// AFTER:
modifier onlyOwner() {
    _onlyOwner();
    _;
}
function _onlyOwner() internal {
    require(msg.sender == owner, "not owner");
}
```

### `screaming-snake-case-immutable`
```solidity
// BAD:  address public immutable treasury;
// GOOD: address public immutable TREASURY;
```

### `asm-keccak256`
Use scratch-space inline assembly for gas efficiency:
```solidity
// BAD:
bytes32 h = keccak256(abi.encode(a, b, c));

// GOOD (for ≤32-byte inputs after encoding):
bytes32 h;
assembly {
    mstore(0x00, a)
    mstore(0x20, b)
    h := keccak256(0x00, 0x40)
}
```

## Governance Contracts

- Use **`GhostChainGovernor`** (custom) — never import OpenZeppelin's `Governor`.
- AI may construct proposal calldata; **humans must ratify** before execution.
- All constitution amendments go through `GhostConstitution.sol` clause system.

## Chain Guards

- L2/L3 contracts that must restrict to their chain: check `block.chainid == GHOST_L2_CHAIN_ID` or use `onlyL2Chain()` modifier pattern (extract to `_onlyL2Chain()` per lint rule above).
- Never hardcode Ethereum mainnet chain ID (1) anywhere.

## Test Contracts

- Fuzz tests: wrap `token.transfer(...)` with `require(...)` even in test files — lint applies equally.
- Use `vm.assume(...)` for preconditions instead of `if (...) return` where possible.
- Invariant tests: add `require(x <= type(uintN).max, "overflow")` before every narrowing cast — the lint checker does not exempt test files.
