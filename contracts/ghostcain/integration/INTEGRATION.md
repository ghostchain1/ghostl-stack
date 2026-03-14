# @ghostchain/contracts — Integration Guide

<!-- LEGACY_DEP: attribution to upstream FOSS project; OZ v5 is the historical upstream required for derivative-library disclosure -->
The `@ghostchain/contracts` library is a fully rebranded fork of the upstream OZ Contracts v5 codebase.
All GRC standards, WGST, and GST identifiers are fully sovereign — see the migration table below for the upstream-to-sovereign name map.

---

## Quick Reference

| Import prefix | Foundry remapping | npm package |
|---|---|---|
| `@ghostchain/contracts/` | `@ghostchain/contracts/=lib/ghostchain-contracts/contracts/` | `@ghostchain/contracts` |

---

## Foundry — ghostl-stack Integration

### Step 1: Add as a git submodule

```bash
cd ghostl-stack/contracts
git submodule add https://github.com/ghostchain1/ghostchain-contracts lib/ghostchain-contracts
git submodule update --init --recursive
```

**Development (local symlink on Windows):**

```powershell
# Clone the repo as "ghostchain-contracts" (canonical directory name):
git clone https://github.com/ghostchain1/ghostchain-contracts ghostchain-contracts
# Or create a junction to your local checkout:
New-Item -ItemType Junction -Path "contracts\lib\ghostchain-contracts" `
  -Target "..\..\ghostchain-contracts" <!-- LEGACY_DEP: local dev only; clone path is user-specific -->
```

### Step 2: Add remappings to ghostl-stack `foundry.toml`

```toml
[profile.default]
# ... existing settings ...
remappings = [
  "@ghostchain/contracts/=lib/ghostchain-contracts/contracts/",
  "@ghostchain/contracts-upgradeable/=lib/ghostchain-contracts/contracts/",
  "forge-std/=lib/forge-std/src/",
  "ds-test/=lib/ds-test/src/",
]
```

> See `integration/ghostl-stack-foundry.patch` for the full annotated snippet.

### Step 3: Use in Solidity

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@ghostchain/contracts/token/GRC20/GRC20.sol";
import "@ghostchain/contracts/access/Ownable.sol";
import "@ghostchain/contracts/governance/Governor.sol";
```

---

## Hardhat/npm — ghostl-stack Integration

### Step 1: Add to ghostl-stack `package.json`

```json
{
  "devDependencies": {
    "@ghostchain/contracts": "file:../../ghostchain-contracts"
  }
}
```

Then install:

```bash
npm install
```

### Step 2: Import in Solidity (same syntax)

```solidity
import "@ghostchain/contracts/token/GRC721/GRC721.sol";
```

Hardhat resolves `@ghostchain/contracts/` → `node_modules/@ghostchain/contracts/contracts/` automatically via the `exports` field in the library's `package.json`.

No additional `hardhat.config` path changes are required.

> See `integration/hardhat-paths.js` for paths config context.

---

## Compiler Compatibility

| Setting | `@ghostchain/contracts` | ghostl-stack default |
|---|---|---|
| `solc_version` | 0.8.24 | 0.8.24 ✅ |
| `evm_version` | `cancun` | unset (defaults to `london`) |
| `via_ir` | false (default) | true |
| `optimizer_runs` | 200 | 200 ✅ |

**Note:** `via_ir = true` in ghostl-stack is compatible with these contracts — they compile correctly with or without the Yul IR pipeline.

---

## Contract Name Reference

<!-- LEGACY_DEP: migration reference table; legacy names appear only in the "Legacy Upstream" column for user orientation during migration -->
| Legacy Upstream | Sovereign (GhostChain) |
|---|---|
| `ERC20` <!-- LEGACY_DEP: upstream name --> | `GRC20` |
| `ERC721` <!-- LEGACY_DEP: upstream name --> | `GRC721` |
| `ERC1155` <!-- LEGACY_DEP: upstream name --> | `GRC1155` |
| `ERC4626` <!-- LEGACY_DEP: upstream name --> | `GRC4626` |
| `IERC165` <!-- LEGACY_DEP: upstream name --> | `IGST165` |
| `AccessControl` | `AccessControl` (unchanged) |
| `Ownable` | `Ownable` (unchanged) |
| `Governor` | `Governor` (unchanged) |
| `WGST9` | `WGST9` |
| `GST` | `GST` |

---

## Files in This Directory

| File | Purpose |
|---|---|
| `ghostl-stack-foundry.patch` | Remapping lines to add to ghostl-stack `foundry.toml` |
| `ghostl-stack-package-snippet.json` | `devDependencies` entry for ghostl-stack `package.json` |
| `hardhat-paths.js` | Hardhat paths config context and resolution notes |
