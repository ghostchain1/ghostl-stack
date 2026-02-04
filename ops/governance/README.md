# Governance Enforcement

This module enforces protocol governance invariants without human intervention. It evaluates snapshot artifacts and (optionally) submits an on-chain governance event using a pre-signed raw transaction.

Artifacts:
- `governance-rules.json`
- `enforcement-log.json` (generated at runtime)
- `ai-policy-l2.json` (optional, AI policy registry inputs)
- `ai-policy-proposal.json` (generated proposal bundle)

Run:
```
GHOST_GOVERNANCE_EVENT_RAW_TX=0x... \
GHOST_GOVERNANCE_RPC_URL=http://ghostchain:8545 \
./ops/governance/enforce.sh --snapshot ./ops/docker/snapshots/<timestamp> --mode prod
```

If `onchainEventRequired=true` in `governance-rules.json`, the script fails when the raw tx or RPC URL is missing.

## AI Policy Registry (L2)
Use `scripts/propose_ai_policy.mjs` to generate a governance proposal bundle for the L1 `AgentGovernancePolicy` registry:

```
cp ops/governance/ai-policy-l2.sample.json ops/governance/ai-policy-l2.json
POLICY_REGISTRY_ADDRESS=0x... \
node scripts/propose_ai_policy.mjs
```

## AI Policy Registry (L3)
Ghost L3 policy is anchored on L2. Use the same proposal builder, but point it at the L2 registry and the L3 policy config:

```
cp ops/governance/ai-policy-l3.sample.json ops/governance/ai-policy-l3.json
AI_POLICY_CONFIG=ops/governance/ai-policy-l3.json \
POLICY_REGISTRY_ADDRESS=0x... \
node scripts/propose_ai_policy.mjs
```

## Automation Capability Policy (PolicyRegistry)
Use `scripts/propose_policy_capability.mjs` to generate proposal calldata for enabling a capability key in `PolicyRegistry`:

```
POLICY_REGISTRY_ADDRESS=0x... \
CAPABILITY=CAP_AUTOMATION_SCHEDULE \
CAPABILITY_VALUE=1 \
node scripts/propose_policy_capability.mjs
```

By default, the script emits two calls:
1) `setPolicySetting` (min/max/activation delay/bounds)
2) `applyPolicy` to set the capability value

If your PolicyRegistry uses a non-zero activation delay, the capability will queue and require a follow-up `activatePolicy` transaction after the delay.
