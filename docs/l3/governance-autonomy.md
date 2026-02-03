# L3 Governance-Locked Autonomy

Ghost L3 autonomy is anchored to **L2 governance**. Automated actions must be ratified by on-chain policy in the L2 `AgentGovernancePolicy` registry. The AI monitor will refuse to execute actions unless the policy registry allows them (or it is in observe-only mode).

## Action tiers
- **Tier 0 (observe only)**: Metrics + incident classification only. Default for dev.
- **Tier 1 (safe auto-mitigations)**: Throttle batch submissions, apply guard delay. Requires policy allow.
- **Tier 2 (parameter changes)**: Fee or batch parameter changes. Requires governance proposal.
- **Tier 3 (critical actions)**: Key rotation, bridge upgrades. Requires multisig + governance + timelock.

## Policy registry wiring
Set these values in `infra/opstack/.env.l3` (anchored to L2 RPC):

```
POLICY_REGISTRY_ADDRESS=0x...
POLICY_REGISTRY_RPC=http://localhost:9545
POLICY_ROLE=L3_AI_MONITOR
POLICY_ACTION_THROTTLE=L3_AI_THROTTLE
POLICY_ACTION_PAUSE=L3_AI_PAUSE
POLICY_REQUIRED=1
```

When `POLICY_REQUIRED=1` and `OBSERVE_ONLY=0`, the AI monitor will block any action if the registry or RPC is missing.

## Chain policy inheritance (Federation)
L3 must reference the L2 chain policy registry for global constraints:

```
CHAIN_POLICY_REGISTRY_ADDRESS=0x<L2 PolicyRegistry>
CHAIN_POLICY_REGISTRY_RPC=http://localhost:9545
CHAIN_POLICY_REQUIRED=1
```

Export the L2 policy checkpoint for audit trail:

```bash
POLICY_CHECKPOINT_NETWORK=ghostl2 \
POLICY_CHECKPOINT_LAYER=L2 \
infra/scripts/federation/export-policy-checkpoint.sh
```

## Proposal builder (policy updates)
Use the policy proposal builder to generate deterministic calldata bundles for **L2** governance:

1) Copy the L3 policy template and fill in addresses/tiers:

```
cp ops/governance/ai-policy-l3.sample.json ops/governance/ai-policy-l3.json
```

2) Build the proposal bundle:

```
AI_POLICY_CONFIG=ops/governance/ai-policy-l3.json \
POLICY_REGISTRY_ADDRESS=0x... \
node scripts/propose_ai_policy.mjs
```

Outputs: `ops/governance/ai-policy-proposal.json` (contains calldata + hashes).

## Evidence hooks
Action policies can require evidence hashes; place the evidence hash in `evidenceHash` in the policy JSON to bind L3 actions to a governance-approved evidence pack.
