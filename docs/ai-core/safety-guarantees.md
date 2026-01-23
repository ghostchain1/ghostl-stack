# Safety Guarantees

Ghost Chain AI Core is bounded and auditable. It does not override consensus or protocol rules.

## Hard Safety Limits
- Never exceed configured gas caps.
- Never retry logical reverts.
- Never execute when policy constraints block the action.
- Never operate silently: all decisions and actions are logged.

## Failure Handling
- Out-of-gas and ambiguous failures trigger retries within policy limits.
- Logical reverts stop retries immediately.
- Recurrent failures create fingerprints and suppression rules.

## Auditability
Every decision writes:
- `ai_core_events` (module + event type)
- `ai_core_decisions` (rationale + confidence)
- `ai_core_actions` (action + status)

## Rollback
Autonomy can be paused instantly by setting:
`AUTONOMY_ENABLED=false`

Per-chain overrides can be set in `ai_policy_constraints`.
