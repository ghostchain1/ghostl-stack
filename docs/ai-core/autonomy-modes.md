# Ghost Chain AI Core Autonomy Modes

## Modes
- **OBSERVE_ONLY**: Observe and forecast, but never take action.
- **ADVISORY**: Produce recommendations and require human approval for action.
- **ASSISTED**: Act when risk is under the threshold; escalate when risk is high.
- **AUTONOMOUS**: Act within policy bounds; block when risk exceeds limits.
- **AUTONOMOUS_STRICT**: No execution when risk exceeds limits; conservative behavior.

## Policy Controls
The following environment or policy settings bound autonomy:
- `AUTONOMY_ENABLED`
- `AUTONOMY_MAX_RISK`
- `AUTONOMY_MAX_GAS`
- `AUTONOMY_MAX_RETRIES`
- `AUTONOMY_POLICY_LOCK`
- `ai_policy_constraints` (per-chain overrides)

## Decision Outputs
AI Core decisions emit one of:
`ALLOW`, `MODIFY`, `RETRY`, `DEFER`, `BLOCK`, `ESCALATE`

Each output is recorded in `ai_core_decisions` with rationale and confidence.
