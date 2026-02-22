# Phase 6 Evidence Index

Generated: 2026-02-21

## Files
- `phase6-script-syntax.txt` — syntax check for proposer configuration validation script.
- `proposer-config-gate.txt` — Phase 6 proposer gate execution output (JSON summary + pass/fail).
- `gate-status.txt` — compact gate status marker.
- `proposer-compose-sections.txt` — extracted `op-proposer` and `l3-op-proposer` compose sections.
- `smoke-consensus-autonomy.txt` — smoke gate run after Phase 6 changes.

## Gate-relevant pointers
- Required proposer wiring (`--rollup-rpc`, `--l1-eth-rpc`) verified in compose sections.
- Parent chain target contract code validated for L2 and L3 proposer targets.
- In legacy output-oracle mode, the gate script also validates `version()` non-empty response.
- Current stack mode is fault-proof (`--game-factory-address`), so target code checks are applied to game-factory addresses.
