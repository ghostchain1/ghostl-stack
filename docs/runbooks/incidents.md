# Incident Runbook (GhostStack Econ Engine)

## Severity matrix
- P0: routing law bypass or unauthorized treasury move
- P1: governance gate mismatch (mainnet mode active while gate false)
- P2: indexer/proof lag
- P3: dashboard/API degradation

## Immediate containment
1. Pause routing and treasury movement contracts.
2. Switch `hg-treasury-agent` to reject mode (`MAINNET_EXECUTION_MODE=true` + gate false).
3. Capture signed evidence snapshots from all `hg-*` services.
4. Preserve logs and metric series for forensic analysis.

## Investigation
- Validate latest execution receipts against on-chain events.
- Reconcile flow totals:
  - `L3->L2`
  - `L2->L1`
  - `L1->EXT`
  - `EXT->L1`
  - `L1->DIST`
- Recompute proof snapshot root from indexer state.

## Recovery
- Patch and test in devnet/testnet first.
- Re-enable components in order:
  1. reporting-indexer
  2. proof-snapshotter
  3. risk-oracle
  4. treasury-agent
  5. routing contracts (if paused)
- Publish post-incident report with receipt links.
