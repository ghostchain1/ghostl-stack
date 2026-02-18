# Cascading Finality Safe Mode

This profile extends GhostControl for hierarchical settlement:

- `L3 -> L2 -> L1`
- No direct `L3 -> L1` finality path
- No direct `L2/L3 -> External` egress path

Config file:

- `tools/ghostcontrol/guards/config/cascading-finality-safe-mode.json`

## Halt behavior

- If `L1` halts:
  - pause L2 and L3 finality
  - disable bridge execution
  - switch to read-only mode
- If `L2` halts:
  - pause L3 finality
  - keep L1 active

## Operations

Use this config as an input to runbooks and planner policy generation for emergency gates.
