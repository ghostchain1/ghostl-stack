# Phase 10 Evidence Index

Generated: 2026-02-21

## Files
- `script-syntax.txt` — syntax validation for `infra/opstack/scripts/validate-fault-safety-controls.sh`.
- `fault-safety-gate.txt` — full Phase 10 gate output (JSON + pass line).
- `gate-exit.txt` — exit code from Phase 10 gate execution.
- `gate-status.txt` — compact Phase 10 gate marker.
- `smoke-consensus-autonomy.txt` — post-Phase-10 consensus smoke output.
- `smoke-consensus-autonomy-status.txt` — exit code for consensus smoke.
- `opstack-check-postflight.txt` — post-gate preflight check (`npm run opstack:check`).
- `opstack-check-postflight-status.txt` — exit code for postflight preflight check.
- `validate-proposer-postflight.txt` — postflight proposer validation output.
- `validate-proposer-postflight-status.txt` — exit code for postflight proposer check.
- `validate-node-hygiene-postflight.txt` — postflight node hygiene check output.
- `validate-node-hygiene-postflight-status.txt` — exit code for postflight node hygiene check.
- `validate-bridge-wiring-postflight.txt` — initial postflight bridge wiring check (captured historical drift).
- `validate-bridge-wiring-postflight-status.txt` — exit code for initial postflight bridge wiring check.
- `validate-bridge-wiring-remediated.txt` — bridge wiring check after env remediation.
- `validate-bridge-wiring-remediated-status.txt` — exit code for remediated bridge wiring check.

## Gate-relevant pointers
- Dispute game factories are deployed and have bytecode on required parent chains.
- L2 emergency pause control is verifiable (guard policy contract deployed + guard mode API reachable).
- L3 messaging rate limits are enabled in guard runtime (`windowMs > 0`, `max > 0`).
- Manual L3 finalization is locked to relayer (`finalizeToL3` from non-relayer reverts with `not relayer`).
- Phase 10 gate status: `Gate10=PASS`.
- Postflight regression status: preflight/proposer/node-hygiene all pass, and bridge wiring now passes after remediating L3 parent pointer env values.
