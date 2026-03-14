# Autonomous Policy Self-Healing

This module evaluates policy state and applies safe, deterministic self-healing actions.

Artifacts (generated at runtime):
- `policy-state.json`
- `healing-actions.json`
- `self-heal-log.json`

Run:
```
./ops/policy/self-heal.sh --mode prod --snapshot ./ops/docker/snapshots/<timestamp>
```

CRITICAL policy findings trigger the kill switch when invoked by `ghostctl-recreate.sh`.

Control:
- `POLICY_SELF_HEAL_REQUIRED=false` allows the recreate flow to proceed even if policy severity is CRITICAL (not recommended).
