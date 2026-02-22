# Phase 7 Evidence Index

Generated: 2026-02-21

## Files
- `phase7-script-syntax.txt` — syntax validation output for node hygiene gate script.
- `script-permissions.txt` — executable permission proof for gate script.
- `node-hygiene-gate.txt` — gate run output (writable dirs + genesis stamp validation + JSON summary).
- `gate-status.txt` — compact pass/fail marker.
- `smoke-consensus-autonomy.txt` — smoke gate run after Phase 7 changes.

## Gate-relevant pointers
- Fresh/writable data directories validated for active L2/L3 data paths.
- Stale genesis protection enforced via per-data-dir genesis SHA256 stamp checks.
- Gate can run in `prepare` mode for destructive reset/reinit when needed.
- Current run completed with `failures: 0`.
