# Governance Enforcement

This module enforces protocol governance invariants without human intervention. It evaluates snapshot artifacts and (optionally) submits an on-chain governance event using a pre-signed raw transaction.

Artifacts:
- `governance-rules.json`
- `enforcement-log.json` (generated at runtime)

Run:
```
GHOST_GOVERNANCE_EVENT_RAW_TX=0x... \
GHOST_GOVERNANCE_RPC_URL=http://ghostchain:8545 \
./ops/governance/enforce.sh --snapshot ./ops/docker/snapshots/<timestamp> --mode prod
```

If `onchainEventRequired=true` in `governance-rules.json`, the script fails when the raw tx or RPC URL is missing.
