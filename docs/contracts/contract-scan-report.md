# GhostChain Contract Gap Scan Report

## Rollback Snapshot
- Patch: docs/rollback/contract-scan-20260123-064356/pre-change.patch
- ABI checksums: docs/rollback/contract-scan-20260123-064356/abi-checksums.txt
- Rollback command: `git apply -R docs/rollback/contract-scan-20260123-064356/pre-change.patch`

## Scan Summary
- Custom Solidity files scanned: 91
- Contracts/interfaces/libraries indexed: 189
- Missing imports: 0
- Missing contract names in deploy scripts: 0

## Newly Created Contracts
- None. No missing contract references were detected in custom GhostChain L1/L2/L3 code or deployment scripts.

## New Tests
- None (no new contracts).

## Deployment Scripts
- None added (no new contracts).

## ABI Validation
- ABI checksums unchanged after scan and report generation.

## OP Stack / Gas Token Safety
- No contract changes; no storage collisions or OP Stack breakage introduced.
- Gas token configuration unchanged by this task.

Canonical gas token (L1 ERC‑20):
- Contract: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- Symbol: `GST`
- Genesis mint: `1,000,000,000` GST to `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
- L2/L3 gas token source: L1 ERC‑20 address above

## AI Optimization
- Not applicable (no new contracts).

## Diagrams
- Mermaid interactions: `docs/contracts/ghostchain-interactions.mmd`
- Markdown render: `docs/contracts/ghostchain-interactions.md`

## Notes
- Dependency graph: `docs/contracts/dependency-graph.json`
- Missing contract scan: `docs/contracts/missing-contracts.json`
