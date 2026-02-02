# L2 Governance-Locked Autonomy

Ghost L2 autonomy is anchored to **L1 governance**. Automated actions must be ratified by on-chain policy in the L1 `AgentGovernancePolicy` registry. The AI monitor will refuse to execute actions unless the policy registry allows them (or it is in observe-only mode).

## Action Tiers
- **Tier 0 (observe only)**: Metrics + incident classification only. Default for dev.
- **Tier 1 (safe auto-mitigations)**: Throttle batch submissions, apply guard delay. Requires policy allow.
- **Tier 2 (parameter changes)**: Fee or batch parameter changes. Requires governance proposal.
- **Tier 3 (critical actions)**: Key rotation, validator set changes, bridge upgrades. Requires multisig + governance + timelock.

## Policy Registry Wiring
Set these values in `infra/opstack/.env.l2`:

```
POLICY_REGISTRY_ADDRESS=0x...
POLICY_REGISTRY_RPC=http://localhost:18545
POLICY_ROLE=L2_AI_MONITOR
POLICY_ACTION_THROTTLE=L2_AI_THROTTLE
POLICY_ACTION_PAUSE=L2_AI_PAUSE
POLICY_REQUIRED=1
```

When `POLICY_REQUIRED=1` and `AI_MONITOR_OBSERVE_ONLY=0`, `infra/scripts/doctor-l2.sh` will fail if the registry or RPC is missing.

## Proposal Builder (Policy Updates)
Use the policy proposal builder to generate deterministic calldata bundles for L1 governance:

1) Copy the template policy and fill in addresses/tiers:

```
cp ops/governance/ai-policy-l2.sample.json ops/governance/ai-policy-l2.json
```

2) Build the proposal bundle:

```
node scripts/propose_ai_policy.mjs
```

Outputs: `ops/governance/ai-policy-proposal.json` (contains calldata + hashes).

## Evidence Hooks
Action policies can require evidence hashes; place the evidence hash in `evidenceHash` in the policy JSON to bind L2 actions to a governance-approved evidence pack.
