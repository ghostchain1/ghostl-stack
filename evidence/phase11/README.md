# Phase 11 Evidence Index

Generated: 2026-02-21

## Files
- `script-syntax.txt` — syntax check output for `infra/opstack/scripts/validate-operational-readiness.sh`.
- `runner-output.txt` — script runner output stream from Phase 11 gate execution.
- `operational-readiness-gate.txt` — structured JSON gate output.
- `gate-exit.txt` — exit code for the Phase 11 gate run.
- `gate-status.txt` — compact gate marker.
- `doctor-l1.txt` — L1 doctor output.
- `doctor-l2.txt` — L2 doctor output.
- `doctor-l3.txt` — L3 doctor output.
- `health-guard.txt` — Ghost Guard health check output.
- `health-relayer.txt` — Ghost Relayer health check output.
- `health-ai-monitor.txt` — AI Monitor health check output.
- `smoke-consensus-autonomy.txt` — consensus autonomy smoke output.
- `smoke-federation-invariants.txt` — federation invariants smoke output.
- `smoke-ai-stability.txt` — AI stability smoke output.

## Gate-relevant pointers
- Operational doctors pass for L1, L2, and L3.
- Critical control-plane health endpoints pass (guard, relayer, AI monitor).
- Non-destructive smoke checks pass (consensus autonomy, federation invariants, AI stability).
- Phase 11 gate status: `Gate11=PASS`.
