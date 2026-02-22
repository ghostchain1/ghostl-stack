# Phase 5 Evidence Index

Generated: 2026-02-21

## Files
- `phase5-requirements-anchor.txt` — repository Phase 5 requirement anchors for output-oracle checks.
- `oracle-validation-refs.txt` — code references for implemented oracle validation checks.
- `consensus-telemetry-tests.txt` — direct unit test run for output-oracle incident logic.
- `smoke-consensus-autonomy.txt` — smoke gate run (syntax + consensus telemetry tests).
- `consensus-telemetry-syntax.txt` — JavaScript syntax check output for consensus telemetry service.
- `network-manager-syntax.txt` — JavaScript syntax check output for network manager service.

## Gate-relevant pointers
- Oracle wiring checks enforced (`zero address`, `not deployed`, `wrong parent chain`, `ABI/version mismatch`): `oracle-validation-refs.txt`.
- Requirement linkage to Phase 5 oracle criteria (`version()` and parent-chain placement): `phase5-requirements-anchor.txt`.
- Test proof of incident behavior: `consensus-telemetry-tests.txt` (3/3 pass, including Phase 5 wiring issues test).
- Smoke gate pass: `smoke-consensus-autonomy.txt`.
