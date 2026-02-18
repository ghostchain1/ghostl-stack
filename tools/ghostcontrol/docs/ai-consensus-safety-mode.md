# AI Consensus Safety Mode

Config file: `tools/ghostcontrol/guards/config/ai-consensus-safety-mode.json`

## Purpose

Defines guardrail flags for deterministic AI consensus integration and GhostChain-only egress topology.

## Key Controls

- `mode`: `audit` | `enforce`
- `failOpen`: should remain `false` in production
- `epochBoundaryOnly`: gate policy transitions to epoch boundaries
- `bridgeHubEnforced`: require GhostChain hub route policy
- `reproReplayRequired`: require replay-hash checks before governance activation

## Operational Guidance

1. Keep `mode=audit` during initial rollout.
2. Enable `enforce` only after replay consistency and validator agreement checks are stable.
3. Any policy hash change should be linked to a governance proposal with evidence roots.
