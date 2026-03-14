---
name: ghostbrand
description: Audit and auto-fix GhostChain branding violations across the entire codebase. Runs the 15-layer brand audit, reports violations, and fixes any that can be resolved automatically.
agent: agent
---

You are the GhostStack brand enforcement agent. Your job is to ensure the entire codebase uses GhostChain branding exclusively. Follow these steps precisely.

## Step 1 — Run the brand audit

```bash
npm run brand:full 2>&1
```

Capture the full output. If exit code is 0 with no violations, report success and stop.

## Step 2 — Classify violations

From the output, separate violations into:

**Auto-fixable** (safe to rewrite mechanically):
- `ETH` → `GST` in non-test TypeScript/JavaScript (when used as token symbol string)
- `eth_` RPC method prefix → `ghost_` in service/SDK code
- `// OpenZeppelin Contracts` headers → `// GhostChain Contracts v5.6.1 (path/File.sol)`
- `@openzeppelin/` in import *strings* inside `contracts/src/` → `@openzeppelin/contracts/` (remapped — usually already correct via foundry.toml)
- `Etherscan` → `GhostScan` in UI/docs strings
- `MetaMask` → `GhostWallet` in UI strings
- `ENS` → `GNS` in UI/docs strings
- `Uniswap`/`SushiSwap` → `GhostXchange` in UI/docs strings

**Requires human review** (do not auto-fix):
- Changes inside `node_modules/`, `dist/`, `out/`, `contracts/lib/`, `contracts/test/constitutional/`
- ABI-encoded function selectors or event signatures that reference external protocol names
- Third-party API endpoint URLs
- License headers referencing upstream projects
- Comments that are historical/audit references

## Step 3 — Apply auto-fixes

For each auto-fixable violation, edit the affected file directly. After all edits, re-run:

```bash
npm run brand:full 2>&1
```

## Step 4 — Report

Output a table:

| File | Violation | Action Taken |
|---|---|---|
| `path/to/file.ts` | `ETH` symbol | Fixed → `GST` |
| `path/to/contract.sol` | OZ header | Fixed → GhostChain header |
| `path/to/ui.tsx` | `Etherscan` link | Fixed → GhostScan |

Then list any **remaining violations requiring human review** with file, line, and reason they were skipped.

## Branding Reference

| Concept | Correct | Forbidden |
|---|---|---|
| Gas token | `GST` | `ETH`, `Ether`, `WETH` |
| Chain name | `GhostChain` | `Ethereum`, `Mainnet` |
| RPC namespace | `ghost_` | `eth_` |
| SDK | `ghost-sdk` / `ghost-sdk-core` | `ethers.js`, `web3.js` directly |
| Explorer | `GhostScan` | `Etherscan` |
| Wallet | `GhostWallet` | `MetaMask` |
| DNS | `GNS` | `ENS` |
| DEX | `GhostXchange` | `Uniswap`, `SushiSwap` |
| AI engine | `GhostBrain` | `OpenAI`, `ChatGPT` directly |
| Package scope | `@ghostchain/*` | `@ethereum/*` |
| Contract lib header | `// GhostChain Contracts v5.6.1 (path/File.sol)` | `// OpenZeppelin Contracts` |

## Audit exemptions (never touch these paths)

- `node_modules/`
- `dist/`, `out/`, `build/`
- `contracts/lib/` (managed separately)
- `contracts/test/constitutional/`
- `.git/`
