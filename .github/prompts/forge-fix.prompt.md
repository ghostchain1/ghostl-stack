---
name: forge-fix
description: Read forge lint output and batch-fix all warnings in GhostStack contracts. Handles erc20-unchecked-transfer, unsafe-typecast, unchecked-call, unwrapped-modifier-logic, screaming-snake-case-immutable, unaliased-plain-import, and asm-keccak256.
argument-hint: Optionally pass a specific warning category to fix (e.g. "unsafe-typecast only")
agent: agent
---

You are the GhostStack forge-fix agent. Your job is to eliminate all `warning[...]` diagnostics from `forge lint` output for the contracts in `/home/ghost/ghostl-stack/contracts/`.

## Step 1 — Collect current warnings

```bash
cd /home/ghost/ghostl-stack/contracts
forge lint 2>&1
```

Parse the output using this Python snippet to get a complete inventory:

```python
import re, sys
content = sys.stdin.read()
results = {}
pattern = re.compile(r'(warning|error)\[([\w-]+)\][^\n]*\n.*?-->\s*([^\n:]+:\d+:\d+)', re.DOTALL)
for m in pattern.finditer(content):
    warn_type = m.group(2)
    loc = m.group(3).strip()
    results.setdefault(warn_type, set()).add(loc)
for wtype, locs in sorted(results.items()):
    print(f'\n=== {wtype} ({len(locs)}) ===')
    for l in sorted(locs):
        print(f'  {l}')
```

If there are zero warnings, report success and stop.

## Step 2 — Fix warnings by category

Work through categories in priority order. Read each affected file before editing.

---

### `erc20-unchecked-transfer` (BLOCKING — fix all)

Pattern: `token.transfer(...)` or `token.transferFrom(...)` without checking return value.

```solidity
// BEFORE:
token.transfer(to, amount);

// AFTER:
require(token.transfer(to, amount), "GST: transfer failed");
```

```solidity
// BEFORE:
token.transferFrom(from, to, amount);

// AFTER:
require(token.transferFrom(from, to, amount), "GST: transferFrom failed");
```

---

### `unchecked-call` (BLOCKING — fix all)

Pattern: low-level `.call(...)` without checking success.

```solidity
// BEFORE:
target.call{value: v}(data);

// AFTER:
(bool ok,) = target.call{value: v}(data);
require(ok, "call failed");
```

---

### `unsafe-typecast` (BLOCKING — fix all)

Pattern: narrowing integer cast without overflow check.

Add a `require` on the line immediately before each cast:

```solidity
// BEFORE:
reserve0 = uint112(newValue);

// AFTER:
require(newValue <= type(uint112).max, "overflow");
reserve0 = uint112(newValue);
```

Special cases:
- `uint64(block.timestamp)` → `require(block.timestamp <= type(uint64).max, "ts overflow");`
- `bytes1(uint8(x))` → `require(uint256(x) <= type(uint8).max, "overflow");`
- `uint208(votes)` → `require(votes <= type(uint208).max, "overflow");`
- `int256(x)` where x is uint → `require(x <= uint256(type(int256).max), "overflow");`

If the narrowing cast is already guarded by a prior `require(x <= type(uintN).max, ...)` on the same logical branch (e.g. inside an `if` block whose condition guarantees the size), note that and skip adding a duplicate.

---

### `unwrapped-modifier-logic` (informational — fix when touching the file)

Extract modifier body to an internal function:

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

---

### `screaming-snake-case-immutable` (informational — fix when touching the file)

Rename immutable variables to SCREAMING_SNAKE_CASE. Update all references in the same file.

```solidity
// BEFORE: address public immutable treasury;
// AFTER:  address public immutable TREASURY;
```

---

### `unaliased-plain-import` (informational — fix when touching the file)

Convert bare imports to named imports:

```solidity
// BEFORE:
import "../common/Governed.sol";

// AFTER:
import { Governed } from "../common/Governed.sol";
```

Use all exported names the file actually uses from that import.

---

### `asm-keccak256` (informational — fix when touching the file)

Replace `keccak256(abi.encode(...))` with inline assembly using scratch space:

```solidity
// BEFORE:
bytes32 h = keccak256(abi.encode(a, b));

// AFTER (2 × 32-byte words):
bytes32 h;
assembly {
    mstore(0x00, a)
    mstore(0x20, b)
    h := keccak256(0x00, 0x40)
}
```

For variable-length or multi-word inputs, use `mload(0x40)` free-memory pointer approach:

```solidity
bytes32 h;
assembly {
    let ptr := mload(0x40)
    mstore(ptr,        a)
    mstore(add(ptr, 0x20), b)
    mstore(add(ptr, 0x40), c)
    h := keccak256(ptr, 0x60)
}
```

---

## Step 3 — Batch apply fixes

Use multi-file batch edits for efficiency. Read the full context around each warning line before editing to ensure the replacement is precise and does not break surrounding logic.

## Step 4 — Verify

```bash
cd /home/ghost/ghostl-stack/contracts && forge lint 2>&1 | grep -E "^warning\[|^error\["
```

Target: zero lines of output (no warnings, no errors).

Then run a full build to confirm no compilation errors were introduced:

```bash
cd /home/ghost/ghostl-stack/contracts && forge build --skip test 2>&1 | tail -5
```

Expected: `Compiler run successful!`

## Step 5 — Report

Provide a summary table:

| Warning Category | Before | After | Files Changed |
|---|---|---|---|
| erc20-unchecked-transfer | N | 0 | list |
| unchecked-call | N | 0 | list |
| unsafe-typecast | N | 0 | list |
| unwrapped-modifier-logic | N | 0 | list |
| ... | | | |

List any warnings that could not be eliminated and explain why.
